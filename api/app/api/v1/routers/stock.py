import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import DbSession, Membership, PageParams
from app.schemas.common import Page
from app.schemas.household import (
    HouseholdEvent,
    StockAdjust,
    StockEventCreate,
    StockItem,
    StockItemCreate,
    StockItemDetail,
    StockItemUpdate,
    household_event,
    stock_item,
    stock_item_detail,
)
from app.services import consumption as consumption_service
from app.services import stock as stock_service
from app.services.errors import InsufficientStock, NotFound

# Nested under the household so that membership — checked by the Membership dependency
# on every route — is structurally impossible to forget.
router = APIRouter(prefix="/households/{household_id}/stock", tags=["stock"])


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No such {what}")


async def _detail(db: DbSession, item: object) -> StockItemDetail:
    events = await stock_service.recent_events(db, item.id)  # type: ignore[attr-defined]
    # One extra aggregate per detail read. It is a single indexed sum over
    # ix_stock_event_item_occurred, and it rides along here rather than living behind its
    # own endpoint because every caller of this response wants it: a tin page that has to
    # fetch twice to say "about three weeks left" would show the number a beat late, and
    # a number that arrives after the reader has moved on is one they never see.
    pace = await consumption_service.pace_for_item(db, item)  # type: ignore[arg-type]
    return stock_item_detail(item, events, pace)


@router.get("", response_model=Page[StockItem])
async def list_stock(
    household_id: uuid.UUID,
    _: Membership,
    db: DbSession,
    paging: PageParams,
    q: Annotated[str | None, Query(max_length=120)] = None,
    low_only: bool = False,
) -> Page[StockItem]:
    items, total = await stock_service.list_items(
        db, household_id, q=q, low_only=low_only, page=paging.page, size=paging.size
    )
    return Page.build([stock_item(i) for i in items], total, paging.page, paging.size)


@router.get("/activity", response_model=Page[HouseholdEvent])
async def household_activity(
    household_id: uuid.UUID, _: Membership, db: DbSession, paging: PageParams
) -> Page[HouseholdEvent]:
    """What has been happening on this shelf: every cup, tin and recount, newest first.

    Declared **above** `/{item_id}`, and that is load-bearing rather than tidiness.
    FastAPI matches routes in declaration order, and `item_id` is a `uuid.UUID` path
    parameter — put this second and `/activity` is parsed as a malformed UUID and answers
    422 instead of a timeline.
    """
    events, total = await stock_service.household_events(
        db, household_id, page=paging.page, size=paging.size
    )
    return Page.build([household_event(e) for e in events], total, paging.page, paging.size)


@router.post("", response_model=StockItemDetail, status_code=status.HTTP_201_CREATED)
async def add_tin(
    household_id: uuid.UUID, payload: StockItemCreate, member: Membership, db: DbSession
) -> StockItemDetail:
    """A tin on the shelf, and — with `new_tea` — the catalog entry it needs to sit on.

    One request, so one transaction: the tea, any ingredients or shop proposed with it,
    and the tin itself are all written under this request's session, which `get_db`
    commits once at the end. Nothing here creates a tea and hopes the tin lands too.
    """
    try:
        item = await stock_service.create_item(db, household_id, payload, member.user)
    except NotFound as exc:
        # The exception's own words, not a fixed "No such tea": with `new_tea` in the body
        # the thing that was not found may be its brand or one of its ingredients.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"No such {exc}"
        ) from exc
    return await _detail(db, item)


@router.get("/{item_id}", response_model=StockItemDetail)
async def get_tin(
    household_id: uuid.UUID, item_id: uuid.UUID, _: Membership, db: DbSession
) -> StockItemDetail:
    try:
        item = await stock_service.get_item(db, household_id, item_id)
    except NotFound as exc:
        raise _not_found("tin") from exc
    return await _detail(db, item)


@router.patch("/{item_id}", response_model=StockItemDetail)
async def update_tin(
    household_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: StockItemUpdate,
    _: Membership,
    db: DbSession,
) -> StockItemDetail:
    try:
        item = await stock_service.update_item(db, household_id, item_id, payload)
    except NotFound as exc:
        raise _not_found("tin") from exc
    return await _detail(db, item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_tin(
    household_id: uuid.UUID, item_id: uuid.UUID, _: Membership, db: DbSession
) -> None:
    try:
        await stock_service.delete_item(db, household_id, item_id)
    except NotFound as exc:
        raise _not_found("tin") from exc


@router.post("/{item_id}/events", response_model=StockItemDetail)
async def record_movement(
    household_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: StockEventCreate,
    member: Membership,
    db: DbSession,
) -> StockItemDetail:
    """The one-tap brew. `grams` is a positive magnitude; the server applies the sign."""
    try:
        item = await stock_service.record_movement(db, household_id, item_id, payload, member.user)
    except NotFound as exc:
        raise _not_found("tin") from exc
    except InsufficientStock as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only {exc} g left in that tin.",
        ) from exc
    return await _detail(db, item)


@router.post("/{item_id}/adjust", response_model=StockItemDetail)
async def adjust_tin(
    household_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: StockAdjust,
    member: Membership,
    db: DbSession,
) -> StockItemDetail:
    try:
        item = await stock_service.adjust_item(db, household_id, item_id, payload, member.user)
    except NotFound as exc:
        raise _not_found("tin") from exc
    return await _detail(db, item)
