import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.household import Household, HouseholdInvite, HouseholdMember, StockItem
from app.models.user import User
from app.schemas.household import HouseholdCreate, HouseholdUpdate, InviteCreate
from app.services import friend as friend_service
from app.services.errors import (
    AlreadyAMember,
    AlreadyExists,
    InviteExpired,
    LastOwnerCannotLeave,
    NotAMember,
    NotFound,
)

# Unambiguous alphabet: no O/0, I/1/l. Invite codes get read aloud and retyped from a
# phone screen, and "was that an O or a zero" is a support ticket waiting to happen.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 8


def _new_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))


async def get_membership(
    db: AsyncSession, household_id: uuid.UUID, user_id: uuid.UUID
) -> HouseholdMember:
    member = await db.get(HouseholdMember, (household_id, user_id))
    if member is None:
        raise NotAMember(str(household_id))
    return member


def _counts_subqueries() -> tuple[Select, Select, Select]:
    """Correlated counts for the household overview.

    .correlate(Household) is load-bearing. The outer query also joins
    household_member, and without an explicit correlation SQLAlchemy auto-correlates
    that table *out* of the member_count subquery — leaving it with no FROM clause and
    raising InvalidRequestError. Naming Household as the only correlated table pins
    household_member inside the subquery where it belongs.
    """
    member_count = (
        select(func.count())
        .select_from(HouseholdMember)
        .where(HouseholdMember.household_id == Household.id)
        .correlate(Household)
        .scalar_subquery()
    )
    stock_count = (
        select(func.count())
        .select_from(StockItem)
        .where(StockItem.household_id == Household.id)
        .correlate(Household)
        .scalar_subquery()
    )
    low_count = (
        select(func.count())
        .select_from(StockItem)
        .where(
            StockItem.household_id == Household.id,
            StockItem.quantity_grams <= StockItem.low_stock_grams,
        )
        .correlate(Household)
        .scalar_subquery()
    )
    return member_count, stock_count, low_count


async def list_for_user(
    db: AsyncSession, user_id: uuid.UUID
) -> list[tuple[Household, str, int, int, int]]:
    """Households the user belongs to, with their counts.

    The counts are correlated subqueries in one statement rather than three queries per
    household: the shelf overview is the first screen after signing in, and N+1 there is
    immediately visible.
    """
    member_count, stock_count, low_count = _counts_subqueries()
    rows = await db.execute(
        select(Household, HouseholdMember.role, member_count, stock_count, low_count)
        .join(HouseholdMember, HouseholdMember.household_id == Household.id)
        .where(HouseholdMember.user_id == user_id)
        .order_by(Household.name)
    )
    return [tuple(row) for row in rows.all()]  # type: ignore[misc]


async def get_with_counts(
    db: AsyncSession, household_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Household, str, int, int, int]:
    await get_membership(db, household_id, user_id)
    member_count, stock_count, low_count = _counts_subqueries()
    row = (
        await db.execute(
            select(Household, HouseholdMember.role, member_count, stock_count, low_count)
            .join(HouseholdMember, HouseholdMember.household_id == Household.id)
            .where(Household.id == household_id, HouseholdMember.user_id == user_id)
        )
    ).first()
    if row is None:
        raise NotAMember(str(household_id))
    return tuple(row)  # type: ignore[return-value]


async def load_members(db: AsyncSession, household_id: uuid.UUID) -> list[HouseholdMember]:
    rows = await db.scalars(
        select(HouseholdMember)
        .options(selectinload(HouseholdMember.user))
        .where(HouseholdMember.household_id == household_id)
        .order_by(HouseholdMember.role, HouseholdMember.created_at)
    )
    return list(rows)


async def create(db: AsyncSession, payload: HouseholdCreate, owner: User) -> Household:
    household = Household(name=payload.name, created_by_id=owner.id)
    household.members.append(HouseholdMember(user_id=owner.id, role="owner"))
    db.add(household)
    await db.flush()
    return household


async def update(db: AsyncSession, household_id: uuid.UUID, payload: HouseholdUpdate) -> Household:
    household = await db.get(Household, household_id)
    if household is None:
        raise NotFound("household")
    # exclude_unset, so PATCHing only the picture does not blank the name — and passing
    # image_url: null explicitly still clears it.
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(household, key, value)
    await db.flush()
    return household


async def delete(db: AsyncSession, household_id: uuid.UUID) -> None:
    household = await db.get(Household, household_id)
    if household is None:
        raise NotFound("household")
    await db.delete(household)
    await db.flush()


async def remove_member(
    db: AsyncSession, household_id: uuid.UUID, target_user_id: uuid.UUID
) -> None:
    member = await db.get(HouseholdMember, (household_id, target_user_id))
    if member is None:
        raise NotFound("member")

    if member.role == "owner":
        owners = await db.scalar(
            select(func.count())
            .select_from(HouseholdMember)
            .where(
                HouseholdMember.household_id == household_id,
                HouseholdMember.role == "owner",
            )
        )
        # Otherwise the household becomes unadministrable: nobody left who can invite,
        # rename or delete it, and the remaining members cannot promote themselves.
        if (owners or 0) <= 1:
            raise LastOwnerCannotLeave(str(household_id))

    await db.delete(member)
    await db.flush()


async def create_invite(
    db: AsyncSession, household_id: uuid.UUID, payload: InviteCreate, created_by: User
) -> HouseholdInvite:
    invite = HouseholdInvite(
        household_id=household_id,
        code=_new_code(),
        invited_email=payload.invited_email,
        created_by_id=created_by.id,
        expires_at=datetime.now(UTC) + timedelta(days=payload.expires_in_days),
    )
    db.add(invite)
    await db.flush()
    return invite


async def list_invites(db: AsyncSession, household_id: uuid.UUID) -> list[HouseholdInvite]:
    """Everything this household has offered and not yet had taken up.

    Both flavours, in one list, because the owner's question is "who have we asked?" and
    not "which mechanism did we use". Declined invites stay in it deliberately — a refusal
    the owner never sees is a row they go on waiting for — and they leave on their own when
    the invite expires, which is a notice period rather than a cleanup job.
    """
    rows = await db.scalars(
        select(HouseholdInvite)
        .options(selectinload(HouseholdInvite.invited_user))
        .where(
            HouseholdInvite.household_id == household_id,
            HouseholdInvite.accepted_at.is_(None),
            HouseholdInvite.expires_at > datetime.now(UTC),
        )
        .order_by(HouseholdInvite.created_at.desc())
    )
    return list(rows)


async def invite_friend(
    db: AsyncSession,
    household_id: uuid.UUID,
    invited_user_id: uuid.UUID,
    created_by: User,
    expires_in_days: int,
) -> HouseholdInvite:
    """Offer a named friend a place in the household. Owner-only; the router's `Ownership`
    dependency has already established that.

    **Friendship is the gate, and it is checked here and nowhere else.** Without it this
    endpoint would accept any uuid and become a way to put your household's name in a
    stranger's inbox — a poke with a household attached. `friend_service.get_pair` is the
    same read `/friends` is built on, so "friend" means exactly what it means everywhere
    else, blocks included.

    Every way of not being a friend — no such account, never connected, a request still
    pending, or they blocked you — raises the *same* `NotFound`, which the router renders
    as the same 404 the friends router gives. A distinguishable refusal here would be a
    block that announces itself, which is the one thing a block must not do.

    Friendship is checked before membership, but *not* for privacy — this endpoint is
    owner-only, and an owner can already read their own member list, so "they are already
    in this household" tells them nothing they cannot see on the same page. The order is
    simply the simpler rule to hold: "you may only invite friends" is true unconditionally,
    so it is answered first. Either order is correct; `test_a_non_friend_who_is_already_a
    _member_is_still_answered_as_a_non_friend` pins which one we chose.
    """
    pair = await friend_service.get_pair(db, created_by.id, invited_user_id)
    if pair is None or pair.status != "accepted":
        # Inviting yourself lands here too: you are not your own friend, and the
        # canonical-order CHECK on `friendship` makes the self-pair unrepresentable.
        raise NotFound("friend")

    if await db.get(HouseholdMember, (household_id, invited_user_id)) is not None:
        raise AlreadyAMember(str(invited_user_id))

    open_invite = await db.scalar(
        select(HouseholdInvite).where(
            HouseholdInvite.household_id == household_id,
            HouseholdInvite.invited_user_id == invited_user_id,
            HouseholdInvite.accepted_at.is_(None),
            HouseholdInvite.declined_at.is_(None),
        )
    )
    now = datetime.now(UTC)
    if open_invite is not None:
        if open_invite.expires_at > now:
            raise AlreadyExists("invitation")
        # Expired but never answered, and `uq_household_invite_open_recipient` does not
        # know about time — a partial index cannot have `now()` in its predicate, because
        # the predicate has to be immutable. So the row is renewed rather than duplicated,
        # which is also what the owner meant by clicking the button a second time.
        open_invite.expires_at = now + timedelta(days=expires_in_days)
        open_invite.created_by_id = created_by.id
        await db.flush()
        return await _with_recipient(db, open_invite.id)

    invite = HouseholdInvite(
        household_id=household_id,
        # No code, on purpose. The whole point of a named invite is that there is nothing
        # to forward; see the model docstring.
        code=None,
        invited_user_id=invited_user_id,
        created_by_id=created_by.id,
        expires_at=now + timedelta(days=expires_in_days),
    )
    db.add(invite)
    await db.flush()
    return await _with_recipient(db, invite.id)


async def _with_recipient(db: AsyncSession, invite_id: uuid.UUID) -> HouseholdInvite:
    """Re-read an invite with `invited_user` eagerly loaded.

    A row that has just been flushed has an unloaded relationship, and `Invite` serialises
    `invited_user` — so touching it under async SQLAlchemy raises MissingGreenlet rather
    than lazy-loading. Only the *named* flavour hits this: a many-to-one whose foreign key
    is NULL short-circuits to None without any IO, which is why a code invite serialised
    perfectly well and this only showed up on the new path.
    """
    row = await db.scalar(
        select(HouseholdInvite)
        .options(selectinload(HouseholdInvite.invited_user))
        .where(HouseholdInvite.id == invite_id)
    )
    assert row is not None
    return row


async def list_invitations(db: AsyncSession, user_id: uuid.UUID) -> list[HouseholdInvite]:
    """What is waiting on *you*, shaped like `GET /friends/requests`.

    Households you already belong to are filtered out rather than shown with a button that
    is guaranteed to fail: you can be invited and then join by code in the same afternoon,
    and the invite that is now moot should stop asking. It is only ever that race — the
    send path refuses to create one — so this is a safety net, not the normal case.
    """
    already_in = select(HouseholdMember.household_id).where(HouseholdMember.user_id == user_id)
    rows = await db.scalars(
        select(HouseholdInvite)
        .options(
            selectinload(HouseholdInvite.household),
            selectinload(HouseholdInvite.created_by),
        )
        .where(
            HouseholdInvite.invited_user_id == user_id,
            HouseholdInvite.accepted_at.is_(None),
            HouseholdInvite.declined_at.is_(None),
            HouseholdInvite.expires_at > datetime.now(UTC),
            HouseholdInvite.household_id.not_in(already_in),
        )
        .order_by(HouseholdInvite.created_at.desc())
    )
    return list(rows)


async def _open_invitation_for(
    db: AsyncSession, invite_id: uuid.UUID, user_id: uuid.UUID
) -> HouseholdInvite:
    """The one invitation this person is allowed to answer, or 404.

    `invited_user_id != user_id` is doing three jobs at once: it rejects somebody else's
    invitation, it rejects a code invite (whose recipient is NULL, so it can never equal a
    real id), and it means this function cannot be talked into touching the M3 code path.
    """
    invite = await db.get(HouseholdInvite, invite_id)
    if (
        invite is None
        or invite.invited_user_id != user_id
        or invite.accepted_at is not None
        or invite.declined_at is not None
    ):
        raise NotFound("invitation")
    return invite


async def accept_invitation(db: AsyncSession, invite_id: uuid.UUID, user: User) -> Household:
    """Join the household you were invited to.

    Friendship is deliberately *not* re-checked. The offer was made by a household, not by
    a person, and a household with two owners does not stop meaning it because one of them
    unfriended you afterwards. An owner who has changed their mind revokes the invite,
    which is one click and already exists; an invitation that evaporates for a reason the
    invited person cannot see would be a 404 on a button that was on screen a second ago.
    """
    invite = await _open_invitation_for(db, invite_id, user.id)
    if invite.expires_at <= datetime.now(UTC):
        # 410 at the edge, same as a stale code: the offer was real and has simply run out.
        raise InviteExpired(str(invite_id))

    if await db.get(HouseholdMember, (invite.household_id, user.id)) is not None:
        raise AlreadyAMember(str(invite.household_id))

    db.add(HouseholdMember(household_id=invite.household_id, user_id=user.id, role="member"))
    invite.accepted_at = datetime.now(UTC)
    invite.accepted_by_id = user.id
    await db.flush()

    household = await db.get(Household, invite.household_id)
    assert household is not None
    return household


async def decline_invitation(db: AsyncSession, invite_id: uuid.UUID, user: User) -> None:
    """Say no, and have it recorded.

    A declined *friend request* is deleted (`friend_service.drop_request`); a declined
    household invitation is stamped. The difference is who is left waiting. A friend
    request is between two people and a quiet "no" spares somebody a rejection they gain
    nothing from reading. A household invitation was sent by an owner who is administering
    a member list and is now watching a pending row: with a delete they cannot tell a
    refusal from an expiry from their own misremembering, and the person who said no gets
    asked again next week.

    The row is kept rather than deleted for the same reason: re-inviting after a decline
    is allowed — people change their minds and so do households — and the stamp is what
    makes the second ask a deliberate act rather than an accident.
    """
    invite = await _open_invitation_for(db, invite_id, user.id)
    invite.declined_at = datetime.now(UTC)
    await db.flush()


async def revoke_invite(db: AsyncSession, household_id: uuid.UUID, invite_id: uuid.UUID) -> None:
    invite = await db.get(HouseholdInvite, invite_id)
    if invite is None or invite.household_id != household_id:
        raise NotFound("invite")
    await db.delete(invite)
    await db.flush()


async def accept_invite(db: AsyncSession, code: str, user: User) -> Household:
    """Join with a bearer code. Unchanged since M3, and deliberately so.

    A named invite has `code IS NULL`, and `NULL = 'ABCD1234'` is NULL rather than true, so
    this query cannot reach one however it is called — `JoinRequest.code` has
    `min_length=1`, so there is no empty string to compare against either.
    """
    invite = await db.scalar(select(HouseholdInvite).where(HouseholdInvite.code == code.upper()))
    if invite is None or invite.accepted_at is not None:
        raise NotFound("invite")
    if invite.expires_at <= datetime.now(UTC):
        raise InviteExpired(code)

    existing = await db.get(HouseholdMember, (invite.household_id, user.id))
    if existing is not None:
        raise AlreadyAMember(str(invite.household_id))

    db.add(HouseholdMember(household_id=invite.household_id, user_id=user.id, role="member"))
    invite.accepted_at = datetime.now(UTC)
    invite.accepted_by_id = user.id
    await db.flush()

    household = await db.get(Household, invite.household_id)
    assert household is not None
    return household
