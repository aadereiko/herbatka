import uuid
from datetime import UTC, datetime

from sqlalchemy import case, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.friendship import Friendship, canonical_pair
from app.models.user import User
from app.services.errors import (
    AlreadyConnected,
    Blocked,
    CannotBefriendYourself,
    NotFound,
)

_LOADS = (selectinload(Friendship.user_a), selectinload(Friendship.user_b))

MIN_SEARCH_LENGTH = 2
SEARCH_LIMIT = 20


async def get_pair(db: AsyncSession, me: uuid.UUID, other: uuid.UUID) -> Friendship | None:
    a, b = canonical_pair(me, other)
    return await db.scalar(
        select(Friendship)
        .options(*_LOADS)
        .where(Friendship.user_a_id == a, Friendship.user_b_id == b)
    )


def state_of(row: Friendship | None, me: uuid.UUID) -> str:
    """How the relationship looks from one side.

    The row is symmetric; the reading is not. A pending request is "outgoing" to the
    person who sent it and "incoming" to the person who has to answer it.
    """
    if row is None:
        return "none"
    if row.status == "accepted":
        return "friends"
    if row.status == "blocked":
        return "blocked"
    return "outgoing" if row.requested_by_id == me else "incoming"


def friend_ids_subquery(me: uuid.UUID):
    """The ids of everyone the user is actually friends with.

    CASE rather than two queries: the pair is stored in a fixed order, so which column
    holds "the other person" depends on which side of the pair the viewer is.
    """
    return (
        select(
            case(
                (Friendship.user_a_id == me, Friendship.user_b_id),
                else_=Friendship.user_a_id,
            ).label("friend_id")
        )
        .where(
            Friendship.status == "accepted",
            or_(Friendship.user_a_id == me, Friendship.user_b_id == me),
        )
        .subquery()
    )


async def list_friends(db: AsyncSession, me: uuid.UUID) -> list[tuple[User, datetime]]:
    rows = await db.scalars(
        select(Friendship)
        .options(*_LOADS)
        .where(
            Friendship.status == "accepted",
            or_(Friendship.user_a_id == me, Friendship.user_b_id == me),
        )
        .order_by(Friendship.responded_at.desc())
    )
    out = []
    for row in rows:
        other = row.user_b if row.user_a_id == me else row.user_a
        out.append((other, row.responded_at or row.created_at))
    return out


async def list_requests(db: AsyncSession, me: uuid.UUID) -> list[tuple[Friendship, User, str]]:
    rows = await db.scalars(
        select(Friendship)
        .options(*_LOADS)
        .where(
            Friendship.status == "pending",
            or_(Friendship.user_a_id == me, Friendship.user_b_id == me),
        )
        .order_by(Friendship.created_at.desc())
    )
    out = []
    for row in rows:
        other = row.user_b if row.user_a_id == me else row.user_a
        out.append((row, other, state_of(row, me)))
    return out


async def list_blocked(db: AsyncSession, me: uuid.UUID) -> list[User]:
    rows = await db.scalars(
        select(Friendship)
        .options(*_LOADS)
        .where(Friendship.status == "blocked", Friendship.blocked_by_id == me)
        .order_by(Friendship.updated_at.desc())
    )
    return [row.user_b if row.user_a_id == me else row.user_a for row in rows]


async def send_request(db: AsyncSession, me: User, target_id: uuid.UUID) -> Friendship:
    if target_id == me.id:
        raise CannotBefriendYourself
    if await db.get(User, target_id) is None:
        raise NotFound("user")

    existing = await get_pair(db, me.id, target_id)
    if existing is not None:
        if existing.status == "blocked":
            # Whoever did the blocking, the answer to the other side is "no such person
            # to befriend". Saying "you are blocked" would tell them the block exists.
            raise Blocked(str(target_id))
        raise AlreadyConnected(existing.status)

    a, b = canonical_pair(me.id, target_id)
    row = Friendship(user_a_id=a, user_b_id=b, status="pending", requested_by_id=me.id)
    db.add(row)
    await db.flush()
    fresh = await get_pair(db, me.id, target_id)
    assert fresh is not None
    return fresh


async def accept_request(db: AsyncSession, me: uuid.UUID, request_id: uuid.UUID) -> Friendship:
    row = await db.get(Friendship, request_id)
    # Only the person who did *not* send it can accept it, and only while it is pending.
    if (
        row is None
        or row.status != "pending"
        or me not in (row.user_a_id, row.user_b_id)
        or row.requested_by_id == me
    ):
        raise NotFound("request")

    row.status = "accepted"
    row.responded_at = datetime.now(UTC)
    await db.flush()
    fresh = await db.scalar(select(Friendship).options(*_LOADS).where(Friendship.id == request_id))
    assert fresh is not None
    return fresh


async def drop_request(db: AsyncSession, me: uuid.UUID, request_id: uuid.UUID) -> None:
    """Declining an incoming request and cancelling an outgoing one are the same delete."""
    row = await db.get(Friendship, request_id)
    if row is None or row.status != "pending" or me not in (row.user_a_id, row.user_b_id):
        raise NotFound("request")
    await db.delete(row)
    await db.flush()


async def unfriend(db: AsyncSession, me: uuid.UUID, other_id: uuid.UUID) -> None:
    row = await get_pair(db, me, other_id)
    if row is None or row.status != "accepted":
        raise NotFound("friend")
    await db.delete(row)
    await db.flush()


async def block(db: AsyncSession, me: User, other_id: uuid.UUID) -> None:
    """Blocking replaces whatever was there — friendship, open request, or nothing."""
    if other_id == me.id:
        raise CannotBefriendYourself
    if await db.get(User, other_id) is None:
        raise NotFound("user")

    row = await get_pair(db, me.id, other_id)
    if row is None:
        a, b = canonical_pair(me.id, other_id)
        row = Friendship(user_a_id=a, user_b_id=b, status="blocked", blocked_by_id=me.id)
        db.add(row)
    else:
        row.status = "blocked"
        row.blocked_by_id = me.id
        row.requested_by_id = None
        row.responded_at = None
    await db.flush()


async def unblock(db: AsyncSession, me: uuid.UUID, other_id: uuid.UUID) -> None:
    row = await get_pair(db, me, other_id)
    # Only the blocker can lift it: otherwise the blocked person could simply undo it.
    if row is None or row.status != "blocked" or row.blocked_by_id != me:
        raise NotFound("block")
    await db.delete(row)
    await db.flush()


async def search(db: AsyncSession, me: User, q: str) -> list[tuple[User, str]]:
    """Partial match on display name, exact match on email.

    A partial email match would turn this box into an address-enumeration tool: type
    "@gmail" and read off the list. Someone who already knows the full address learns
    nothing new by finding it.
    """
    q = q.strip()
    if len(q) < MIN_SEARCH_LENGTH:
        return []

    rows = await db.scalars(
        select(User)
        .where(
            User.id != me.id,
            User.is_active.is_(True),
            or_(User.display_name.ilike(f"%{q}%"), User.email == q),
        )
        .order_by(User.display_name)
        .limit(SEARCH_LIMIT)
    )
    users = list(rows)

    out = []
    for user in users:
        pair = await get_pair(db, me.id, user.id)
        # Someone who blocked you is simply absent, not listed as blocked.
        if pair is not None and pair.status == "blocked" and pair.blocked_by_id != me.id:
            continue
        out.append((user, state_of(pair, me.id)))
    return out
