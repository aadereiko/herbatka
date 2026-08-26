import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import Tea
from app.models.review import Review
from app.models.user import User
from app.schemas.review import ReviewInput
from app.services.errors import NotFound

_LOADS = (selectinload(Review.user),)


async def _approved_tea(db: AsyncSession, slug: str) -> Tea:
    tea = await db.scalar(select(Tea).where(Tea.slug == slug, Tea.is_approved.is_(True)))
    if tea is None:
        raise NotFound("tea")
    return tea


async def list_for_tea(
    db: AsyncSession, slug: str, *, page: int = 1, size: int = 10
) -> tuple[list[Review], int]:
    tea = await _approved_tea(db, slug)
    base = select(Review).where(Review.tea_id == tea.id)

    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = await db.scalars(
        base.options(*_LOADS)
        # The id is a tiebreak, not decoration. Two reviews can share a created_at
        # (func.now() is transaction time in Postgres), and an ORDER BY with ties is
        # unstable — rows swap between requests, so paging shows one twice and another
        # never. Any deterministic second key fixes that.
        .order_by(Review.created_at.desc(), Review.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(rows), total


async def get_mine(db: AsyncSession, tea_id: uuid.UUID, user_id: uuid.UUID) -> Review | None:
    return await db.scalar(
        select(Review).options(*_LOADS).where(Review.tea_id == tea_id, Review.user_id == user_id)
    )


async def upsert(db: AsyncSession, slug: str, payload: ReviewInput, author: User) -> Review:
    """Create or replace the author's single review of this tea.

    One endpoint rather than separate create and update: the unique (user_id, tea_id)
    means the client can never meaningfully choose between them, and asking it to would
    only invite a race where both requests lose.
    """
    tea = await _approved_tea(db, slug)
    review = await get_mine(db, tea.id, author.id)

    if review is None:
        review = Review(tea_id=tea.id, user_id=author.id, **payload.model_dump())
        db.add(review)
    else:
        for key, value in payload.model_dump().items():
            setattr(review, key, value)

    await db.flush()
    # Re-fetched for the same reason every stock mutation is: updated_at carries
    # onupdate=func.now(), so the flush expires it and reading it back is lazy IO.
    fresh = await get_mine(db, tea.id, author.id)
    assert fresh is not None
    return fresh


async def delete_mine(db: AsyncSession, slug: str, user_id: uuid.UUID) -> None:
    tea = await _approved_tea(db, slug)
    review = await get_mine(db, tea.id, user_id)
    if review is None:
        raise NotFound("review")
    await db.delete(review)
    await db.flush()


async def list_mine(
    db: AsyncSession, user_id: uuid.UUID, *, page: int = 1, size: int = 20
) -> tuple[list[Review], int]:
    base = select(Review).where(Review.user_id == user_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = await db.scalars(
        base.options(*_LOADS, selectinload(Review.tea))
        .order_by(Review.updated_at.desc(), Review.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(rows), total
