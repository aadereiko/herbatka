import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import Ingredient
from app.models.preference import (
    BrewingNote,
    FavouriteShop,
    FavouriteTea,
    IngredientRating,
    ShopReview,
)
from app.models.user import User
from app.schemas.preference import BrewingNoteInput, ShopReviewInput
from app.services.errors import NotFound


def favourite_tea_ids(user_id: uuid.UUID | None):
    """Subquery of the viewer's starred teas, for the catalog list to join against.

    Returns an always-empty set when nobody is signed in, so the caller does not need a
    second code path — `is_favourite` is simply false for everyone.
    """
    query = select(FavouriteTea.tea_id)
    return query.where(FavouriteTea.user_id == user_id) if user_id else query.where(False)


def favourite_shop_ids(user_id: uuid.UUID | None):
    query = select(FavouriteShop.shop_id)
    return query.where(FavouriteShop.user_id == user_id) if user_id else query.where(False)


async def set_favourite_tea(
    db: AsyncSession, user_id: uuid.UUID, tea_id: uuid.UUID, *, on: bool
) -> None:
    if on:
        existing = await db.get(FavouriteTea, (user_id, tea_id))
        # Idempotent: starring twice is the same as starring once, and a double tap on a
        # phone should not be a 409.
        if existing is None:
            db.add(FavouriteTea(user_id=user_id, tea_id=tea_id))
    else:
        await db.execute(
            delete(FavouriteTea).where(
                FavouriteTea.user_id == user_id, FavouriteTea.tea_id == tea_id
            )
        )
    await db.flush()


async def set_favourite_shop(
    db: AsyncSession, user_id: uuid.UUID, shop_id: uuid.UUID, *, on: bool
) -> None:
    if on:
        if await db.get(FavouriteShop, (user_id, shop_id)) is None:
            db.add(FavouriteShop(user_id=user_id, shop_id=shop_id))
    else:
        await db.execute(
            delete(FavouriteShop).where(
                FavouriteShop.user_id == user_id, FavouriteShop.shop_id == shop_id
            )
        )
    await db.flush()


# ------------------------------------------------------------------------ shop reviews


async def shop_rating_subquery():
    """Grouped once, joined once — the same shape the tea catalog uses, and for the same
    reason: a correlated AVG per row would fire one query per shop on the list."""
    return (
        select(
            ShopReview.shop_id.label("shop_id"),
            func.avg(ShopReview.score).label("avg_score"),
            func.count(ShopReview.id).label("review_count"),
        )
        .group_by(ShopReview.shop_id)
        .subquery()
    )


async def get_my_shop_review(
    db: AsyncSession, shop_id: uuid.UUID, user_id: uuid.UUID
) -> ShopReview | None:
    return await db.scalar(
        select(ShopReview)
        .options(selectinload(ShopReview.user))
        .where(ShopReview.shop_id == shop_id, ShopReview.user_id == user_id)
    )


async def list_shop_reviews(
    db: AsyncSession, shop_id: uuid.UUID, *, page: int = 1, size: int = 10
) -> tuple[list[ShopReview], int]:
    base = select(ShopReview).where(ShopReview.shop_id == shop_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = await db.scalars(
        base.options(selectinload(ShopReview.user))
        # id as the tiebreak, as everywhere else: equal timestamps must not reshuffle
        # between requests or paging shows one row twice.
        .order_by(ShopReview.created_at.desc(), ShopReview.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(rows), total


async def upsert_shop_review(
    db: AsyncSession, shop_id: uuid.UUID, payload: ShopReviewInput, author: User
) -> ShopReview:
    review = await get_my_shop_review(db, shop_id, author.id)
    if review is None:
        review = ShopReview(shop_id=shop_id, user_id=author.id, **payload.model_dump())
        db.add(review)
    else:
        for key, value in payload.model_dump().items():
            setattr(review, key, value)
    await db.flush()
    fresh = await get_my_shop_review(db, shop_id, author.id)
    assert fresh is not None
    return fresh


async def delete_shop_review(db: AsyncSession, shop_id: uuid.UUID, user_id: uuid.UUID) -> None:
    review = await get_my_shop_review(db, shop_id, user_id)
    if review is None:
        raise NotFound("review")
    await db.delete(review)
    await db.flush()


# ------------------------------------------------------------------ ingredient ratings


async def rate_ingredient(
    db: AsyncSession, user_id: uuid.UUID, ingredient_id: uuid.UUID, score: int
) -> None:
    """Set, or change, how much you like an ingredient. PUT semantics: no 409 for a second
    opinion, because changing your mind about clove is the normal case."""
    existing = await db.get(IngredientRating, (user_id, ingredient_id))
    if existing is None:
        db.add(IngredientRating(user_id=user_id, ingredient_id=ingredient_id, score=score))
    else:
        existing.score = score
    await db.flush()


async def clear_ingredient_rating(
    db: AsyncSession, user_id: uuid.UUID, ingredient_id: uuid.UUID
) -> None:
    """Unrated is a real state, distinct from a low score: "I have no opinion on hibiscus"
    is not "I dislike hibiscus", and only the delete can say the first one."""
    rating = await db.get(IngredientRating, (user_id, ingredient_id))
    if rating is None:
        raise NotFound("rating")
    await db.delete(rating)
    await db.flush()


async def attach_ingredient_ratings(
    db: AsyncSession, ingredients: Sequence[Ingredient], viewer: User | None
) -> None:
    """Hang `my_score`, `average_score` and `rating_count` on each ingredient in place.

    Two queries for the whole page rather than three per row: the alternative is a
    correlated AVG in the select list, which is one query per ingredient on a list of
    twenty, and the same again for the ingredients nested inside a tea.

    The attributes are set on every ingredient passed in, including the ones nobody has
    rated — a missing attribute would make `IngredientTaste` raise, and the schema is
    deliberately strict there so that a forgotten call is a 500 rather than a page that
    quietly claims nothing has ever been rated.
    """
    if not ingredients:
        return

    ids = {ingredient.id for ingredient in ingredients}

    rows = await db.execute(
        select(
            IngredientRating.ingredient_id,
            func.avg(IngredientRating.score),
            func.count(),
        )
        .where(IngredientRating.ingredient_id.in_(ids))
        .group_by(IngredientRating.ingredient_id)
    )
    aggregates = {ingredient_id: (float(average), count) for ingredient_id, average, count in rows}

    mine: dict[uuid.UUID, int] = {}
    if viewer is not None:
        mine = dict(
            (
                await db.execute(
                    select(IngredientRating.ingredient_id, IngredientRating.score).where(
                        IngredientRating.user_id == viewer.id,
                        IngredientRating.ingredient_id.in_(ids),
                    )
                )
            ).all()
        )

    for ingredient in ingredients:
        average, count = aggregates.get(ingredient.id, (None, 0))
        ingredient.average_score = average
        ingredient.rating_count = count
        ingredient.my_score = mine.get(ingredient.id)


async def attach_tea_ingredient_ratings(db: AsyncSession, tea: Any, viewer: User | None) -> None:
    """The same, for the ingredients hanging off one tea.

    Every path that builds a `TeaDetail` has to call this, because `IngredientTaste` has
    no defaults and will raise without it. That is on purpose and it is the cheap half of
    the bargain: five one-line calls, against a schema that cannot silently under-report.
    """
    await attach_ingredient_ratings(db, [link.ingredient for link in tea.ingredient_links], viewer)


# ----------------------------------------------------------------------- brewing notes


async def get_brewing(db: AsyncSession, user_id: uuid.UUID, tea_id: uuid.UUID) -> Any:
    return await db.get(BrewingNote, (user_id, tea_id))


async def upsert_brewing(
    db: AsyncSession, user_id: uuid.UUID, tea_id: uuid.UUID, payload: BrewingNoteInput
) -> BrewingNote:
    note = await db.get(BrewingNote, (user_id, tea_id))
    if note is None:
        note = BrewingNote(user_id=user_id, tea_id=tea_id, **payload.model_dump())
        db.add(note)
    else:
        for key, value in payload.model_dump().items():
            setattr(note, key, value)
    await db.flush()
    # Refreshed, not re-fetched with db.get: the row is already in the identity map, so
    # get() returns it without touching the database and updated_at — expired by
    # onupdate=func.now() — stays expired, which is lazy IO the moment anything reads it.
    await db.refresh(note)
    return note


async def delete_brewing(db: AsyncSession, user_id: uuid.UUID, tea_id: uuid.UUID) -> None:
    note = await db.get(BrewingNote, (user_id, tea_id))
    if note is None:
        raise NotFound("brewing note")
    await db.delete(note)
    await db.flush()
