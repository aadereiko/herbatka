import uuid

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DbSession, OptionalUser
from app.schemas.auth import ProfileUpdate, UserOut, country_ref, user_out
from app.schemas.household import TeaRef
from app.schemas.profile import ProfileHousehold, ProfilePerson, ProfileReview, PublicProfile
from app.services import friend as friend_service
from app.services import profile as profile_service
from app.services.errors import NotFound

router = APIRouter(tags=["profile"])


@router.get("/users/{user_id}/profile", response_model=PublicProfile)
async def get_profile(user_id: uuid.UUID, db: DbSession, viewer: OptionalUser) -> PublicProfile:
    """Public, like the reviews it shows. Signed out, friend_state is simply null."""
    try:
        person = await profile_service.get_public(db, user_id)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such person") from exc

    if viewer is None:
        state = None
    elif viewer.id == person.id:
        state = "self"
    else:
        state = friend_service.state_of(
            await friend_service.get_pair(db, viewer.id, person.id), viewer.id
        )

    # Blocked counts as a stranger here: whoever did the blocking, neither should be
    # showing the other their households or their friends. The overlap still shows,
    # because it is already visible elsewhere.
    are_friends = state == "friends"
    households = await profile_service.visible_households(
        db, viewer, person, are_friends=are_friends
    )
    friends = await profile_service.visible_friends(db, viewer, person, are_friends=are_friends)
    stats = await profile_service.stats(db, person.id)

    return PublicProfile(
        id=person.id,
        display_name=person.display_name,
        avatar_url=person.avatar_url,
        pronouns=person.pronouns,
        bio=person.bio,
        status=person.status,
        city=person.city,
        country=country_ref(person.country_code),
        favourite_tea_type=person.favourite_tea_type,  # type: ignore[arg-type]
        member_since=person.created_at,
        review_count=stats["review_count"],  # type: ignore[arg-type]
        average_score_given=stats["average_score_given"],  # type: ignore[arg-type]
        # Both counts describe the filtered lists, never the person's true totals.
        household_count=len(households),
        friend_count=len(friends),
        friend_state=state,  # type: ignore[arg-type]
        households=[
            ProfileHousehold(
                id=household.id, name=household.name, image_url=household.image_url, shared=shared
            )
            for household, shared in households
        ],
        friends=[ProfilePerson.model_validate(friend) for friend in friends],
        recent_reviews=[
            ProfileReview(
                id=review.id,
                tea=TeaRef.model_validate(review.tea),
                score=review.score,
                body=review.body,
                created_at=review.created_at,
            )
            for review in await profile_service.recent_reviews(db, person.id)
        ],
    )


@router.patch("/auth/me", response_model=UserOut)
async def update_me(payload: ProfileUpdate, user: CurrentUser, db: DbSession) -> UserOut:
    return user_out(await profile_service.update_own(db, user, payload))
