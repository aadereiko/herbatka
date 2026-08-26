import uuid

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession, Membership, Ownership
from app.models.household import Household, HouseholdMember
from app.schemas.household import (
    HouseholdCreate,
    HouseholdDetail,
    HouseholdSummary,
    HouseholdUpdate,
    Invite,
    InviteCreate,
    JoinRequest,
    Member,
    UserRef,
)
from app.services import household as household_service
from app.services.errors import (
    AlreadyAMember,
    InviteExpired,
    LastOwnerCannotLeave,
    NotFound,
)

router = APIRouter(prefix="/households", tags=["households"])


def _summary(
    household: Household, role: str, members: int, tins: int, low: int
) -> HouseholdSummary:
    return HouseholdSummary(
        id=household.id,
        name=household.name,
        role=role,  # type: ignore[arg-type]
        member_count=members,
        stock_item_count=tins,
        low_stock_count=low,
        created_at=household.created_at,
    )


def _member(member: HouseholdMember) -> Member:
    return Member(
        user=UserRef.model_validate(member.user),
        role=member.role,  # type: ignore[arg-type]
        joined_at=member.created_at,
    )


async def _detail(db: DbSession, household_id: uuid.UUID, user_id: uuid.UUID) -> HouseholdDetail:
    household, role, members, tins, low = await household_service.get_with_counts(
        db, household_id, user_id
    )
    summary = _summary(household, role, members, tins, low)
    member_rows = await household_service.load_members(db, household_id)
    return HouseholdDetail(**summary.model_dump(), members=[_member(m) for m in member_rows])


@router.get("", response_model=list[HouseholdSummary])
async def list_households(user: CurrentUser, db: DbSession) -> list[HouseholdSummary]:
    """Not paginated: you belong to a handful of households, not thousands."""
    rows = await household_service.list_for_user(db, user.id)
    return [_summary(*row) for row in rows]


@router.post("", response_model=HouseholdDetail, status_code=status.HTTP_201_CREATED)
async def create_household(
    payload: HouseholdCreate, user: CurrentUser, db: DbSession
) -> HouseholdDetail:
    household = await household_service.create(db, payload, user)
    return await _detail(db, household.id, user.id)


@router.post("/join", response_model=HouseholdDetail)
async def join_household(payload: JoinRequest, user: CurrentUser, db: DbSession) -> HouseholdDetail:
    try:
        household = await household_service.accept_invite(db, payload.code, user)
    except NotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="That invite code is not valid"
        ) from exc
    except InviteExpired as exc:
        # 410 Gone rather than 404: the code was real, it has simply run out, and the
        # user should ask for a fresh one rather than re-check their typing.
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="That invite has expired"
        ) from exc
    except AlreadyAMember as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already a member of that household",
        ) from exc
    return await _detail(db, household.id, user.id)


@router.get("/{household_id}", response_model=HouseholdDetail)
async def get_household(
    household_id: uuid.UUID, member: Membership, db: DbSession
) -> HouseholdDetail:
    return await _detail(db, household_id, member.user_id)


@router.patch("/{household_id}", response_model=HouseholdDetail)
async def rename_household(
    household_id: uuid.UUID, payload: HouseholdUpdate, owner: Ownership, db: DbSession
) -> HouseholdDetail:
    await household_service.update(db, household_id, payload)
    return await _detail(db, household_id, owner.user_id)


@router.delete("/{household_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_household(household_id: uuid.UUID, owner: Ownership, db: DbSession) -> None:
    await household_service.delete(db, household_id)


@router.delete("/{household_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    household_id: uuid.UUID, user_id: uuid.UUID, member: Membership, db: DbSession
) -> None:
    """An owner may remove anyone; anyone may remove themselves (leaving)."""
    if member.role != "owner" and user_id != member.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a household owner can remove other members",
        )
    try:
        await household_service.remove_member(db, household_id, user_id)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such member") from exc
    except LastOwnerCannotLeave as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "You are the only owner. Make someone else an owner, "
                "or delete the household instead."
            ),
        ) from exc


@router.post("/{household_id}/invites", response_model=Invite, status_code=status.HTTP_201_CREATED)
async def create_invite(
    household_id: uuid.UUID, payload: InviteCreate, owner: Ownership, db: DbSession
) -> Invite:
    invite = await household_service.create_invite(db, household_id, payload, owner.user)
    return Invite.model_validate(invite)


@router.get("/{household_id}/invites", response_model=list[Invite])
async def list_invites(household_id: uuid.UUID, _: Ownership, db: DbSession) -> list[Invite]:
    invites = await household_service.list_invites(db, household_id)
    return [Invite.model_validate(i) for i in invites]


@router.delete("/{household_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(
    household_id: uuid.UUID, invite_id: uuid.UUID, _: Ownership, db: DbSession
) -> None:
    try:
        await household_service.revoke_invite(db, household_id, invite_id)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such invite") from exc
