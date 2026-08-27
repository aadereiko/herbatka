"""Idempotent catalog seeding.

Re-runnable by design: everything is matched on slug and skipped if present, so this
can be run against a database that already has data — including in a deploy step —
without creating duplicates or clobbering edits an admin has made.
"""

import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.core.slug import slugify
from app.db.session import SessionLocal
from app.models.catalog import Brand, Ingredient, Tea, TeaIngredient
from app.models.shop import Shop, ShopListing
from app.seed.data import BRANDS, BREWING, INGREDIENTS, LISTINGS, SHOPS, TEAS


async def seed() -> dict[str, int]:
    created = {"ingredients": 0, "brands": 0, "teas": 0, "shops": 0, "listings": 0}

    async with SessionLocal() as session:
        existing_ingredients = {i.slug: i for i in await session.scalars(select(Ingredient))}
        for name, category, caffeinated in INGREDIENTS:
            slug = slugify(name)
            if slug in existing_ingredients:
                continue
            ingredient = Ingredient(
                slug=slug, name=name, category=category, is_caffeinated=caffeinated
            )
            session.add(ingredient)
            existing_ingredients[slug] = ingredient
            created["ingredients"] += 1

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
            f"{created['listings']} listings."
        )
