import uuid
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.slug import slugify
from app.models.catalog import Brand, Ingredient, Tea, TeaIngredient
from app.models.user import User
from app.schemas.catalog import (
    BrandCreate,
    BrandUpdate,
    IngredientCreate,
    IngredientUpdate,
    TeaCreate,
    TeaIngredientIn,
    TeaUpdate,
)
from app.services.errors import IngredientInUse, NotFound


async def _unique_slug(
    db: AsyncSession, model: Any, name: str, exclude_id: uuid.UUID | None = None
) -> str:
    """Slugify, then suffix -2, -3 … until the slug is free.

    Two different vendors really do both sell a "Breakfast Blend", so a bare unique
    constraint on the slug would reject the second one outright. Deduplicating here
    keeps URLs readable without making the catalog reject legitimate entries.
    """
    base = slugify(name)
    candidate = base
    suffix = 1
    while True:
        query = select(model.id).where(model.slug == candidate)
        if exclude_id is not None:
            query = query.where(model.id != exclude_id)
        if await db.scalar(query) is None:
            return candidate
        suffix += 1
        candidate = f"{base}-{suffix}"


async def _paginate[M](
    db: AsyncSession, query: Select[tuple[M]], page: int, size: int
) -> tuple[list[M], int]:
    """Run a count and a page of rows for the same filtered query.

    The count is derived from the caller's query with ordering and eager loads stripped,
    so the two can never drift apart the way a hand-written second query would.
    """
    count_query = select(func.count()).select_from(query.order_by(None).subquery())
    total = await db.scalar(count_query) or 0
    rows = await db.scalars(query.offset((page - 1) * size).limit(size))
    return list(rows.unique()), total


# --------------------------------------------------------------------------- brands


async def list_brands(
    db: AsyncSession, q: str | None, page: int, size: int
) -> tuple[list[Brand], int]:
    query = select(Brand).order_by(Brand.name)
    if q:
        query = query.where(Brand.name.ilike(f"%{q}%"))
    return await _paginate(db, query, page, size)


async def create_brand(db: AsyncSession, payload: BrandCreate) -> Brand:
    brand = Brand(
        slug=await _unique_slug(db, Brand, payload.name),
        name=payload.name,
        country=payload.country,
        website=payload.website,
    )
    db.add(brand)
    await db.flush()
    return brand


async def update_brand(db: AsyncSession, brand_id: uuid.UUID, payload: BrandUpdate) -> Brand:
    brand = await db.get(Brand, brand_id)
    if brand is None:
        raise NotFound("brand")
    fields = payload.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"] != brand.name:
        brand.slug = await _unique_slug(db, Brand, fields["name"], exclude_id=brand.id)
    for key, value in fields.items():
        setattr(brand, key, value)
    await db.flush()
    return brand


async def delete_brand(db: AsyncSession, brand_id: uuid.UUID) -> None:
    brand = await db.get(Brand, brand_id)
    if brand is None:
        raise NotFound("brand")
    # The FK is ON DELETE SET NULL: teas survive, they just lose their brand.
    await db.delete(brand)
    await db.flush()


# ---------------------------------------------------------------------- ingredients


async def list_ingredients(
    db: AsyncSession, q: str | None, category: str | None, page: int, size: int
) -> tuple[list[Ingredient], int]:
    query = select(Ingredient).order_by(Ingredient.name)
    if q:
        query = query.where(Ingredient.name.ilike(f"%{q}%"))
    if category:
        query = query.where(Ingredient.category == category)
    return await _paginate(db, query, page, size)


async def get_ingredient_by_slug(db: AsyncSession, slug: str) -> Ingredient:
    ingredient = await db.scalar(select(Ingredient).where(Ingredient.slug == slug))
    if ingredient is None:
        raise NotFound("ingredient")
    return ingredient


async def create_ingredient(db: AsyncSession, payload: IngredientCreate) -> Ingredient:
    ingredient = Ingredient(
        slug=await _unique_slug(db, Ingredient, payload.name),
        **payload.model_dump(),
    )
    db.add(ingredient)
    await db.flush()
    return ingredient


async def update_ingredient(
    db: AsyncSession, ingredient_id: uuid.UUID, payload: IngredientUpdate
) -> Ingredient:
    ingredient = await db.get(Ingredient, ingredient_id)
    if ingredient is None:
        raise NotFound("ingredient")
    fields = payload.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"] != ingredient.name:
        ingredient.slug = await _unique_slug(
            db, Ingredient, fields["name"], exclude_id=ingredient.id
        )
    for key, value in fields.items():
        setattr(ingredient, key, value)
    await db.flush()
    return ingredient


async def delete_ingredient(db: AsyncSession, ingredient_id: uuid.UUID) -> None:
    ingredient = await db.get(Ingredient, ingredient_id)
    if ingredient is None:
        raise NotFound("ingredient")

    # Checked here rather than left to the FK's ON DELETE RESTRICT so the caller gets a
    # 409 naming the teas, instead of a 500 from an IntegrityError.
    in_use = await db.scalar(
        select(func.count())
        .select_from(TeaIngredient)
        .where(TeaIngredient.ingredient_id == ingredient_id)
    )
    if in_use:
        raise IngredientInUse(str(in_use))

    await db.delete(ingredient)
    await db.flush()


# ------------------------------------------------------------------------------ teas

# Every tea read eager-loads its brand and ingredients. Without this, rendering a page
# of 24 teas fires 24 brand queries plus 24 ingredient queries — the classic N+1 — and
# TeaSummary needs the ingredients anyway to fill primary_ingredients.
_TEA_LOADS = (
    selectinload(Tea.brand),
    selectinload(Tea.ingredient_links).selectinload(TeaIngredient.ingredient),
)


async def list_teas(
    db: AsyncSession,
    *,
    q: str | None = None,
    tea_type: str | None = None,
    ingredient_slug: str | None = None,
    brand_slug: str | None = None,
    approved: bool | None = True,
    page: int = 1,
    size: int = 24,
) -> tuple[list[Tea], int]:
    query = select(Tea).options(*_TEA_LOADS).order_by(Tea.name)

    if approved is not None:
        query = query.where(Tea.is_approved.is_(approved))
    if q:
        query = query.where(Tea.name.ilike(f"%{q}%"))
    if tea_type:
        query = query.where(Tea.tea_type == tea_type)
    if brand_slug:
        query = query.join(Tea.brand).where(Brand.slug == brand_slug)
    if ingredient_slug:
        # EXISTS rather than a join: joining tea_ingredient would multiply the tea rows
        # by their matching ingredients and inflate the count.
        query = query.where(
            select(TeaIngredient.tea_id)
            .join(Ingredient, Ingredient.id == TeaIngredient.ingredient_id)
            .where(TeaIngredient.tea_id == Tea.id, Ingredient.slug == ingredient_slug)
            .exists()
        )

    return await _paginate(db, query, page, size)


async def get_tea_by_slug(db: AsyncSession, slug: str, *, include_unapproved: bool = False) -> Tea:
    query = select(Tea).options(*_TEA_LOADS).where(Tea.slug == slug)
    if not include_unapproved:
        query = query.where(Tea.is_approved.is_(True))
    tea = await db.scalar(query)
    if tea is None:
        raise NotFound("tea")
    return tea


async def get_tea(db: AsyncSession, tea_id: uuid.UUID) -> Tea:
    tea = await db.scalar(select(Tea).options(*_TEA_LOADS).where(Tea.id == tea_id))
    if tea is None:
        raise NotFound("tea")
    return tea


async def _resolve_ingredients(
    db: AsyncSession, rows: list[TeaIngredientIn]
) -> list[TeaIngredient]:
    if not rows:
        return []

    ids = [row.ingredient_id for row in rows]
    found = set(await db.scalars(select(Ingredient.id).where(Ingredient.id.in_(ids))))
    missing = [str(i) for i in ids if i not in found]
    if missing:
        raise NotFound(f"ingredient(s) {', '.join(missing)}")

    # position preserves the order the client sent, so "green tea, mint, lemon" does not
    # come back alphabetised into something that reads like a different recipe.
    return [
        TeaIngredient(
            ingredient_id=row.ingredient_id,
            percentage=row.percentage,
            is_primary=row.is_primary,
            position=index,
        )
        for index, row in enumerate(rows)
    ]


async def create_tea(
    db: AsyncSession, payload: TeaCreate, *, created_by: User | None, approved: bool
) -> Tea:
    if payload.brand_id is not None and await db.get(Brand, payload.brand_id) is None:
        raise NotFound("brand")

    fields = payload.model_dump(exclude={"ingredients"})
    tea = Tea(
        slug=await _unique_slug(db, Tea, payload.name),
        is_approved=approved,
        created_by_id=created_by.id if created_by else None,
        **fields,
    )
    tea.ingredient_links = await _resolve_ingredients(db, payload.ingredients)
    db.add(tea)
    await db.flush()
    return await get_tea(db, tea.id)


async def update_tea(db: AsyncSession, tea_id: uuid.UUID, payload: TeaUpdate) -> Tea:
    tea = await db.get(Tea, tea_id)
    if tea is None:
        raise NotFound("tea")

    fields = payload.model_dump(exclude_unset=True)
    ingredients = fields.pop("ingredients", None)

    if fields.get("brand_id") is not None and await db.get(Brand, fields["brand_id"]) is None:
        raise NotFound("brand")
    if "name" in fields and fields["name"] != tea.name:
        tea.slug = await _unique_slug(db, Tea, fields["name"], exclude_id=tea.id)
    for key, value in fields.items():
        setattr(tea, key, value)

    if ingredients is not None:
        # cascade="all, delete-orphan" on the relationship means reassigning the list
        # deletes the rows that dropped out; no manual cleanup needed.
        tea.ingredient_links = await _resolve_ingredients(
            db, [TeaIngredientIn.model_validate(row) for row in ingredients]
        )

    await db.flush()
    return await get_tea(db, tea.id)


async def approve_tea(db: AsyncSession, tea_id: uuid.UUID) -> Tea:
    tea = await db.get(Tea, tea_id)
    if tea is None:
        raise NotFound("tea")
    tea.is_approved = True
    await db.flush()
    return await get_tea(db, tea.id)


async def delete_tea(db: AsyncSession, tea_id: uuid.UUID) -> None:
    tea = await db.get(Tea, tea_id)
    if tea is None:
        raise NotFound("tea")
    await db.delete(tea)
    await db.flush()
