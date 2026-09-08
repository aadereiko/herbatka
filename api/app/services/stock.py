import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import Tea
from app.models.household import StockEvent, StockItem
from app.models.shop import Shop
from app.models.user import User
from app.schemas.household import (
    StockAdjust,
    StockEventCreate,
    StockItemCreate,
    StockItemUpdate,
)
from app.services import catalog as catalog_service
from app.services.errors import InsufficientStock, NotFound

RECENT_EVENT_LIMIT = 20

# Grams are stored as Numeric(8,2); quantising every input the same way means a client
# sending 5.005 cannot leave the cached total and the ledger sum disagreeing in the
# second decimal place.
_GRAM_PRECISION = Decimal("0.01")

_SIGN = {"purchase": 1, "brew": -1, "discard": -1}

# StockItem.shop is serialised on every tin, so it is eager-loaded alongside the tea.
# Leaving it out makes reading item.shop lazy IO, which an async session cannot do.
_LOADS = (selectinload(StockItem.tea), selectinload(StockItem.shop))


def _grams(value: float | Decimal) -> Decimal:
    return Decimal(str(value)).quantize(_GRAM_PRECISION, rounding=ROUND_HALF_UP)


async def _get_item(db: AsyncSession, household_id: uuid.UUID, item_id: uuid.UUID) -> StockItem:
    item = await db.scalar(
        select(StockItem)
        .options(*_LOADS)
        # populate_existing, because this is called *after* a mutation to re-read the
        # row. Without it SQLAlchemy hands back the identity-mapped object and leaves an
        # already-loaded relationship alone — so changing shop_id would leave `shop`
        # reporting whatever it was before, including None.
        .execution_options(populate_existing=True)
        .where(StockItem.id == item_id, StockItem.household_id == household_id)
    )
    if item is None:
        raise NotFound("tin")
    return item


async def recent_events(db: AsyncSession, item_id: uuid.UUID) -> list[StockEvent]:
    rows = await db.scalars(
        select(StockEvent)
        .options(selectinload(StockEvent.user))
        .where(StockEvent.stock_item_id == item_id)
        .order_by(StockEvent.occurred_at.desc(), StockEvent.created_at.desc())
        .limit(RECENT_EVENT_LIMIT)
    )
    return list(rows)


async def household_events(
    db: AsyncSession, household_id: uuid.UUID, *, page: int = 1, size: int = 20
) -> tuple[list[StockEvent], int]:
    """The whole shelf's ledger, newest first.

    The sibling of `recent_events`, one level up: that answers "what happened to this
    tin", this answers "what has been happening in this house". Same rows, and the
    membership check on the route is what keeps them private either way.

    Ordered by `occurred_at` with `created_at` as the tiebreak, exactly as the per-tin
    log is. Two events recorded in the same second must not reshuffle between requests,
    and `occurred_at` is user-supplied enough — a brew can be recorded for this morning —
    that ties are not rare.
    """
    query = (
        select(StockEvent)
        .join(StockItem, StockItem.id == StockEvent.stock_item_id)
        .where(StockItem.household_id == household_id)
    )
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = await db.scalars(
        query.options(
            selectinload(StockEvent.user),
            selectinload(StockEvent.stock_item).selectinload(StockItem.tea),
        )
        .order_by(StockEvent.occurred_at.desc(), StockEvent.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(rows), total


async def list_items(
    db: AsyncSession,
    household_id: uuid.UUID,
    *,
    q: str | None = None,
    low_only: bool = False,
    page: int = 1,
    size: int = 24,
) -> tuple[list[StockItem], int]:
    query = (
        select(StockItem)
        .options(*_LOADS)
        .join(StockItem.tea)
        .where(StockItem.household_id == household_id)
        .order_by(Tea.name)
    )
    if q:
        query = query.where(Tea.name.ilike(f"%{q}%"))
    if low_only:
        # Compared column-to-column rather than against a constant: each tin carries its
        # own threshold, because 10 g of matcha is a fortnight and 10 g of herbal is one pot.
        query = query.where(StockItem.quantity_grams <= StockItem.low_stock_grams)

    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = await db.scalars(query.offset((page - 1) * size).limit(size))
    return list(rows.unique()), total


async def get_item(db: AsyncSession, household_id: uuid.UUID, item_id: uuid.UUID) -> StockItem:
    return await _get_item(db, household_id, item_id)


async def _append_event(
    db: AsyncSession,
    item: StockItem,
    *,
    kind: str,
    delta: Decimal,
    actor: User | None,
    note: str | None,
) -> None:
    """Append to the ledger and move the cached head, in one transaction.

    Both writes happen here and nowhere else, which is what keeps
    stock_item.quantity_grams equal to SUM(stock_event.delta_grams).
    """
    db.add(
        StockEvent(
            stock_item_id=item.id,
            user_id=actor.id if actor else None,
            kind=kind,
            delta_grams=delta,
            note=note,
            occurred_at=datetime.now(UTC),
        )
    )
    item.quantity_grams = _grams(item.quantity_grams + delta)
    await db.flush()


async def _resolve_tea(db: AsyncSession, payload: StockItemCreate, actor: User) -> Tea:
    """The tin's tea, whether the catalog already had it or this request is adding it.

    `catalog_service.create_tea` and nothing else. A second tea insert here is how the
    two ways of submitting a tea quietly stop agreeing: the slug deduplication, the
    unapproved default, the new ingredients that ride along with a blend's recipe and the
    proposed shop all live in that one function, and half of them would be missing from a
    copy written for this module.

    `approved=False` unconditionally, exactly as `POST /catalog/teas` does. The permission
    matrix has no row where submitting a tea also approves it, and an admin who means to
    approve one has `POST /admin/teas` — the difference is meant to be which endpoint you
    call, not which shelf you happened to be standing at.
    """
    if payload.new_tea is not None:
        tea, _ratings = await catalog_service.create_tea(
            db, payload.new_tea, created_by=actor, approved=False
        )
        return tea

    tea = await db.get(Tea, payload.tea_id)
    if tea is None:
        raise NotFound("tea")
    return tea


async def _resolve_shop(
    db: AsyncSession, payload: StockItemCreate, tea: Tea, actor: User
) -> uuid.UUID | None:
    """Where the tin came from: a shop the catalog has, one it does not, or nowhere.

    After the tea, and that ordering is not incidental — proposing a shop also lists this
    tin's tea in it, so the tea has to exist before the listing can point at it.

    An id nobody recognises is refused here rather than left to the foreign key, which
    would answer with a 500 from an IntegrityError instead of a sentence naming what was
    not found.
    """
    if payload.new_shop is not None:
        shop = await catalog_service.create_suggested_shop(
            db, tea, payload.new_shop, created_by=actor, approved=False
        )
        return shop.id

    if payload.shop_id is not None and await db.get(Shop, payload.shop_id) is None:
        raise NotFound("shop")
    return payload.shop_id


async def create_item(
    db: AsyncSession, household_id: uuid.UUID, payload: StockItemCreate, actor: User
) -> StockItem:
    tea = await _resolve_tea(db, payload, actor)
    shop_id = await _resolve_shop(db, payload, tea, actor)

    fields = payload.model_dump(
        exclude={"tea_id", "new_tea", "shop_id", "new_shop", "quantity_grams", "low_stock_grams"}
    )
    item = StockItem(
        household_id=household_id,
        tea_id=tea.id,
        shop_id=shop_id,
        added_by_id=actor.id,
        quantity_grams=Decimal(0),
        low_stock_grams=_grams(payload.low_stock_grams),
        **fields,
    )
    db.add(item)
    await db.flush()

    # The opening amount is a `purchase` event, not a directly-written quantity, so the
    # ledger explains every gram in the tin from the moment it exists.
    opening = _grams(payload.quantity_grams)
    if opening > 0:
        await _append_event(
            db, item, kind="purchase", delta=opening, actor=actor, note="Opening balance"
        )

    return await _get_item(db, household_id, item.id)


async def update_item(
    db: AsyncSession, household_id: uuid.UUID, item_id: uuid.UUID, payload: StockItemUpdate
) -> StockItem:
    item = await _get_item(db, household_id, item_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(
            item, key, _grams(value) if key == "low_stock_grams" and value is not None else value
        )
    await db.flush()
    # Re-fetched, not returned directly: updated_at has onupdate=func.now(), so the
    # flush expires it and reading it back would be lazy IO in an async session.
    return await _get_item(db, household_id, item_id)


async def delete_item(db: AsyncSession, household_id: uuid.UUID, item_id: uuid.UUID) -> None:
    item = await _get_item(db, household_id, item_id)
    await db.delete(item)
    await db.flush()


async def record_movement(
    db: AsyncSession,
    household_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: StockEventCreate,
    actor: User,
) -> StockItem:
    item = await _get_item(db, household_id, item_id)
    delta = _grams(payload.grams) * _SIGN[payload.kind]

    # Refused rather than clamped to zero: silently brewing 5 g from a 2 g tin would
    # leave the ledger describing something that did not happen.
    if item.quantity_grams + delta < 0:
        raise InsufficientStock(f"{float(item.quantity_grams):g}")

    await _append_event(db, item, kind=payload.kind, delta=delta, actor=actor, note=payload.note)
    return await _get_item(db, household_id, item_id)


async def adjust_item(
    db: AsyncSession,
    household_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: StockAdjust,
    actor: User,
) -> StockItem:
    """Reconcile to a measured total, recording the difference as an `adjust` event."""
    item = await _get_item(db, household_id, item_id)
    target = _grams(payload.quantity_grams)
    delta = _grams(target - item.quantity_grams)

    if delta == 0:
        return item  # nothing moved; the CHECK constraint forbids a zero-delta event

    await _append_event(db, item, kind="adjust", delta=delta, actor=actor, note=payload.note)
    return await _get_item(db, household_id, item_id)


async def ledger_total(db: AsyncSession, item_id: uuid.UUID) -> Decimal:
    """Sum of the ledger. Exists so tests can assert the cached head never drifts."""
    total = await db.scalar(
        select(func.coalesce(func.sum(StockEvent.delta_grams), 0)).where(
            StockEvent.stock_item_id == item_id
        )
    )
    return Decimal(total or 0)
