import uuid

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DbSession, PageParams
from app.schemas.common import Page
from app.schemas.friend import (
    FeedActor,
    FeedItem,
    Friend,
    FriendRequest,
    FriendTarget,
    HouseholdRef,
    ReviewFeedItem,
    SearchResult,
    StockedFeedItem,
)
from app.schemas.household import TeaRef, UserRef
from app.services import feed as feed_service
from app.services import friend as friend_service
from app.services.errors import (
    AlreadyConnected,
    Blocked,
    CannotBefriendYourself,
    NotFound,
)

router = APIRouter(tags=["friends"])


def _gone(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No such {what}")


@router.get("/friends", response_model=list[Friend])
async def list_friends(user: CurrentUser, db: DbSession) -> list[Friend]:
    rows = await friend_service.list_friends(db, user.id)
    return [Friend(user=UserRef.model_validate(u), friends_since=since) for u, since in rows]


@router.get("/friends/requests", response_model=list[FriendRequest])
async def list_requests(user: CurrentUser, db: DbSession) -> list[FriendRequest]:
    rows = await friend_service.list_requests(db, user.id)
    return [
        FriendRequest(
            id=row.id,
            user=UserRef.model_validate(other),
            direction=direction,  # type: ignore[arg-type]
            created_at=row.created_at,
        )
        for row, other, direction in rows
    ]


@router.get("/friends/blocked", response_model=list[UserRef])
async def list_blocked(user: CurrentUser, db: DbSession) -> list[UserRef]:
    return [UserRef.model_validate(u) for u in await friend_service.list_blocked(db, user.id)]


@router.post("/friends/requests", response_model=FriendRequest, status_code=status.HTTP_201_CREATED)
async def send_request(payload: FriendTarget, user: CurrentUser, db: DbSession) -> FriendRequest:
    try:
        row = await friend_service.send_request(db, user, payload.user_id)
    except CannotBefriendYourself as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot befriend yourself"
        ) from exc
    except Blocked as exc:
        # Deliberately the same 404 an unknown user gets. Distinguishing them would tell
        # the sender that a block exists, which is the one thing a block should not do.
        raise _gone("user") from exc
    except NotFound as exc:
        raise _gone("user") from exc
    except AlreadyConnected as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "You are already friends"
                if str(exc) == "accepted"
                else "There is already a request between you"
            ),
        ) from exc

    other = row.user_b if row.user_a_id == user.id else row.user_a
    return FriendRequest(
        id=row.id,
        user=UserRef.model_validate(other),
        direction="outgoing",
        created_at=row.created_at,
    )


@router.post("/friends/requests/{request_id}/accept", response_model=Friend)
async def accept_request(request_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Friend:
    try:
        row = await friend_service.accept_request(db, user.id, request_id)
    except NotFound as exc:
        raise _gone("request") from exc
    other = row.user_b if row.user_a_id == user.id else row.user_a
    return Friend(
        user=UserRef.model_validate(other), friends_since=row.responded_at or row.created_at
    )


@router.delete("/friends/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def drop_request(request_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    try:
        await friend_service.drop_request(db, user.id, request_id)
    except NotFound as exc:
        raise _gone("request") from exc


@router.delete("/friends/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unfriend(user_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    try:
        await friend_service.unfriend(db, user.id, user_id)
    except NotFound as exc:
        raise _gone("friend") from exc


@router.post("/friends/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def block(user_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    try:
        await friend_service.block(db, user, user_id)
    except CannotBefriendYourself as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot block yourself"
        ) from exc
    except NotFound as exc:
        raise _gone("user") from exc


@router.delete("/friends/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def unblock(user_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    try:
        await friend_service.unblock(db, user.id, user_id)
    except NotFound as exc:
        raise _gone("block") from exc


@router.get("/users/search", response_model=list[SearchResult])
async def search_users(
    user: CurrentUser, db: DbSession, q: str = Query(default="", max_length=120)
) -> list[SearchResult]:
    rows = await friend_service.search(db, user, q)
    return [
        SearchResult(user=UserRef.model_validate(u), state=state)  # type: ignore[arg-type]
        for u, state in rows
    ]


def _feed_items(entries: list[dict]) -> list[FeedItem]:
    """Shared with the home page, which shows the first few of the same timeline."""
    items: list[FeedItem] = []
    for entry in entries:
        row = entry["row"]
        if entry["kind"] == "review":
            items.append(
                ReviewFeedItem(
                    at=row.created_at,
                    actor=FeedActor.model_validate(row.user),
                    tea=TeaRef.model_validate(row.tea),
                    score=row.score,
                    body=row.body,
                )
            )
        else:
            items.append(
                StockedFeedItem(
                    at=row.created_at,
                    actor=FeedActor.model_validate(row.added_by) if row.added_by else None,
                    tea=TeaRef.model_validate(row.tea),
                    household=HouseholdRef.model_validate(row.household),
                    grams=float(row.quantity_grams),
                )
            )
    return items


@router.get("/feed", response_model=Page[FeedItem])
async def get_feed(user: CurrentUser, db: DbSession, paging: PageParams) -> Page[FeedItem]:
    entries, total = await feed_service.page(db, user.id, page=paging.page, size=paging.size)

    items = _feed_items(entries)
    return Page.build(items, total, paging.page, paging.size)
