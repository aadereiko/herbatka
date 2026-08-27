import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.household import Household, HouseholdInvite, HouseholdMember, StockItem
from app.models.user import User
from app.schemas.household import HouseholdCreate, HouseholdUpdate, InviteCreate
from app.services.errors import (
    AlreadyAMember,
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
    rows = await db.scalars(
        select(HouseholdInvite)
        .where(
            HouseholdInvite.household_id == household_id,
            HouseholdInvite.accepted_at.is_(None),
            HouseholdInvite.expires_at > datetime.now(UTC),
        )
        .order_by(HouseholdInvite.created_at.desc())
    )
    return list(rows)


async def revoke_invite(db: AsyncSession, household_id: uuid.UUID, invite_id: uuid.UUID) -> None:
    invite = await db.get(HouseholdInvite, invite_id)
    if invite is None or invite.household_id != household_id:
        raise NotFound("invite")
    await db.delete(invite)
    await db.flush()


async def accept_invite(db: AsyncSession, code: str, user: User) -> Household:
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
