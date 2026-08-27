"""Idempotent catalog seeding.

Re-runnable by design: everything is matched on slug and skipped if present, so this
can be run against a database that already has data — including in a deploy step —
without creating duplicates or clobbering edits an admin has made.

Two deliberate exceptions to "skipped if present", both of the same shape. An ingredient
that already exists but has **no** description gets one, and one that has **no** picture
gets the seeded photograph. A seed that only helps a fresh install helps nobody with a
database — the rows are already there, and skipping them means the text and the pictures
never arrive without a `db-reset`. Neither is an overwrite: a description somebody has
typed and a photograph an admin has uploaded are both left exactly as they are, which is
the property that makes re-running this safe.
"""

import asyncio
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.slug import slugify
from app.db.session import SessionLocal
from app.models.catalog import Brand, Ingredient, Tea, TeaIngredient
from app.models.shop import Shop, ShopListing
from app.seed.data import BRANDS, BREWING, INGREDIENTS, LISTINGS, SHOPS, TEAS
from app.seed.photos import PHOTOS
from app.services.images import store


def _attach_photos(ingredients: dict[str, Ingredient]) -> int:
    """Copy each seeded photograph into the media root and credit it on its row.

    Two rules, and both of them are about not lying:

      - **Only where there is no picture.** An admin who has uploaded their own photograph
        of clove has said something we have no business overwriting on the next deploy —
        and their picture is *theirs*, so stamping a Commons photographer's name onto the
        row would attribute it to somebody who has never seen it. `is None`, not
        falsiness, for the same reason the description backfill uses it.
      - **The credit is written with the picture, in one step.** The CHECK on `ingredient`
        forbids a credit without a picture; writing them together is what keeps the pair
        true, and the four fields are set unconditionally rather than only when non-null so
        that a row can never end up half-credited.

    Synchronous file I/O inside an async function on purpose: this is thirty-nine local
    reads in a one-shot script, and `store()` is the same call the upload endpoint makes.
    Reimplementing it as a copy would fork the "where do pictures live and what are they
    named" decision into a second place.
    """
    written = 0
    for slug, photo in PHOTOS.items():
        ingredient = ingredients.get(slug)
        if ingredient is None or ingredient.image_url is not None:
            continue
        ingredient.image_url = store(photo.path.read_bytes())
        ingredient.image_attribution = photo.author
        ingredient.image_license = photo.licence
        ingredient.image_license_url = photo.licence_url
        ingredient.image_source_url = photo.source_url
        written += 1
    return written


async def seed_catalog(session: AsyncSession) -> dict[str, int]:
    """Everything `seed()` does, minus owning the session and the commit.

    Split out so a test can run the real thing inside its own rolled-back transaction —
    the backfill rule above is the kind of "does it clobber?" question that is only
    honestly answered by running the seed twice against the same rows.
    """
    created = {
        "ingredients": 0,
        "descriptions": 0,
        "photos": 0,
        "brands": 0,
        "teas": 0,
        "shops": 0,
        "listings": 0,
    }

    existing_ingredients = {i.slug: i for i in await session.scalars(select(Ingredient))}
    for name, category, caffeinated, description in INGREDIENTS:
        slug = slugify(name)
        found = existing_ingredients.get(slug)
        if found is not None:
            # Only a row with nothing to say. `is None`, not falsiness: an admin who has
            # deliberately blanked a description has still said something, and stamping
            # ours back over it every deploy would make that edit impossible to keep.
            if found.description is None:
                found.description = description
                created["descriptions"] += 1
            continue
        ingredient = Ingredient(
            slug=slug,
            name=name,
            category=category,
            is_caffeinated=caffeinated,
            description=description,
        )
        session.add(ingredient)
        existing_ingredients[slug] = ingredient
        created["ingredients"] += 1

    created["photos"] = _attach_photos(existing_ingredients)

    existing_brands = {b.slug: b for b in await session.scalars(select(Brand))}
    for name, country, website in BRANDS:
        slug = slugify(name)
        if slug in existing_brands:
            continue
        brand = Brand(slug=slug, name=name, country=country, website=website)
        session.add(brand)
        existing_brands[slug] = brand
        created["brands"] += 1

    # Flush so the new ingredients and brands have ids for the teas to reference.
    await session.flush()

    existing_teas = (
        {t.slug for t in await session.scalars(select(Tea.slug))}
        if False
        else {slug for slug in await session.scalars(select(Tea.slug))}
    )
    for name, tea_type, caffeine, brand_name, origin, description, recipe in TEAS:
        slug = slugify(name)
        if slug in existing_teas:
            continue
        temp, seconds, dose = BREWING[tea_type]
        tea = Tea(
            slug=slug,
            name=name,
            tea_type=tea_type,
            caffeine_level=caffeine,
            brand_id=existing_brands[slugify(brand_name)].id if brand_name else None,
            origin_country=origin,
            description=description,
            brew_temp_c=temp,
            brew_seconds=seconds,
            grams_per_100ml=dose,
            is_approved=True,
            ingredient_links=[
                TeaIngredient(
                    ingredient_id=existing_ingredients[slugify(ingredient_name)].id,
                    percentage=percentage,
                    is_primary=primary,
                    position=position,
                )
                for position, (ingredient_name, percentage, primary) in enumerate(recipe)
            ],
        )
        session.add(tea)
        created["teas"] += 1

    # Shops, and what they sell. Flushed first so the listings can reference them.
    existing_shops = {s.slug: s for s in await session.scalars(select(Shop))}
    for name, website, address, city, country, description, lat, lng in SHOPS:
        slug = slugify(name)
        if slug in existing_shops:
            continue
        shop = Shop(
            slug=slug,
            name=name,
            website=website,
            address=address,
            city=city,
            country=country,
            description=description,
            latitude=Decimal(str(lat)) if lat is not None else None,
            longitude=Decimal(str(lng)) if lng is not None else None,
            is_approved=True,
        )
        session.add(shop)
        existing_shops[slug] = shop
        created["shops"] += 1
    await session.flush()

    teas_by_slug = {t.slug: t for t in await session.scalars(select(Tea))}
    existing_listings = {
        (row.shop_id, row.tea_id, row.pack_grams)
        for row in await session.scalars(select(ShopListing))
    }
    for shop_name, tea_name, pack, price, currency, path in LISTINGS:
        shop = existing_shops[slugify(shop_name)]
        tea = teas_by_slug.get(slugify(tea_name))
        if tea is None:
            continue
        pack_value = Decimal(str(pack)) if pack is not None else None
        if (shop.id, tea.id, pack_value) in existing_listings:
            continue
        session.add(
            ShopListing(
                shop_id=shop.id,
                tea_id=tea.id,
                pack_grams=pack_value,
                price_minor=price,
                currency=currency,
                product_url=f"{shop.website}{path}" if shop.website and path else None,
            )
        )
        existing_listings.add((shop.id, tea.id, pack_value))
        created["listings"] += 1

    return created


async def seed() -> dict[str, int]:
    async with SessionLocal() as session:
        created = await seed_catalog(session)
        await session.commit()
    return created


def main() -> None:
    created = asyncio.run(seed())
    total = sum(created.values())
    if total == 0:
        print("Catalog already seeded; nothing to do.")
    else:
        print(
            f"Seeded {created['ingredients']} ingredients, {created['brands']} brands, "
            f"{created['teas']} teas, {created['shops']} shops, "
            f"{created['listings']} listings. "
            f"Backfilled {created['descriptions']} ingredient descriptions "
            f"and {created['photos']} ingredient photos."
        )
