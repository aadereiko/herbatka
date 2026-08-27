import uuid

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession, Membership, Ownership
from app.models.household import Household, HouseholdInvite, HouseholdMember
from app.schemas.household import (
    FriendInviteCreate,
    HouseholdBrief,
    HouseholdCreate,
    HouseholdDetail,
    HouseholdSummary,
    HouseholdUpdate,
    Invitation,
    Invite,
    InviteCreate,
    JoinRequest,
    Member,
    UserRef,
)
from app.services import household as household_service
from app.services.errors import (
    AlreadyAMember,
    AlreadyExists,
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
        image_url=household.image_url,
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


def _invitation(invite: HouseholdInvite) -> Invitation:
    return Invitation(
        id=invite.id,
        household=HouseholdBrief.model_validate(invite.household),
        invited_by=UserRef.model_validate(invite.created_by) if invite.created_by else None,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
    )


# ------------------------------------------------------------ invitations addressed to me
#
# Declared above `/{household_id}` on purpose: FastAPI matches in declaration order, so a
# GET of `/households/invitations` would otherwise be read as a household whose id is the
# word "invitations" and answered with a 422. `/households/join` sits above it for the
# same reason and has since M3.


@router.get("/invitations", response_model=list[Invitation])
async def list_invitations(user: CurrentUser, db: DbSession) -> list[Invitation]:
    """What is waiting on you, the counterpart of `GET /friends/requests`.

    Not owner-scoped and not household-scoped: this is the one household read that is
    answered entirely relative to the caller, which is what lets the invited person see it
    without being a member of anything.
    """
    invites = await household_service.list_invitations(db, user.id)
    return [_invitation(i) for i in invites]


@router.post("/invitations/{invite_id}/accept", response_model=HouseholdDetail)
async def accept_invitation(
    invite_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> HouseholdDetail:
    try:
        household = await household_service.accept_invitation(db, invite_id, user)
    except NotFound as exc:
        # Somebody else's invitation, one already answered, and one that never existed all
        # answer the same. An invitation id is a capability; confirming that one exists to
        # a person it was not addressed to is the same leak as a probeable household id.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No such invitation"
        ) from exc
    except InviteExpired as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="That invitation has expired"
        ) from exc
    except AlreadyAMember as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already a member of that household",
        ) from exc
    return await _detail(db, household.id, user.id)


@router.post("/invitations/{invite_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_invitation(invite_id: uuid.UUID, user: CurrentUser, db: DbSession) -> None:
    """POST rather than DELETE, because declining *writes* something.

    A declined invitation is stamped, not removed — the owner is entitled to know they can
    stop waiting. The verb says so, so nobody reads the route table and assumes the row is
    gone.
    """
    try:
        await household_service.decline_invitation(db, invite_id, user)
    except NotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No such invitation"
        ) from exc


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


@router.post(
    "/{household_id}/invites/friend",
    response_model=Invite,
    status_code=status.HTTP_201_CREATED,
)
async def invite_friend(
    household_id: uuid.UUID, payload: FriendInviteCreate, owner: Ownership, db: DbSession
) -> Invite:
    """Invite somebody you are already friends with, by id rather than by code.

    A sibling of `POST …/invites` under the same collection and behind the same
    `Ownership`, because it is the same act with a named recipient. The code route is
    untouched and stays the answer for somebody who is not on Herbatka yet.
    """
    try:
        invite = await household_service.invite_friend(
            db, household_id, payload.user_id, owner.user, payload.expires_in_days
        )
    except NotFound as exc:
        # Byte-identical for "no such account", "not your friend", "request still pending"
        # and "they blocked you". See `invite_friend` in the service for why.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such friend") from exc
    except AlreadyAMember as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="They are already in this household",
        ) from exc
    except AlreadyExists as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="They have already been invited and have not answered yet",
        ) from exc
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
