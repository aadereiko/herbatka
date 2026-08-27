import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.catalog import TeaType
from app.schemas.household import TeaRef

FriendState = Literal["none", "incoming", "outgoing", "friends", "blocked", "self"]


class ProfileReview(BaseModel):
    id: uuid.UUID
    tea: TeaRef
    score: int
    body: str | None
    created_at: datetime


class PublicProfile(BaseModel):
    """What anyone may see about a person.

    No email. It appears in friend and household contexts, where the two of you are
    already connected and it is how you find each other — but a profile is reachable by
    anyone with the id, and an address is not something to hand out at that distance.
    """

    id: uuid.UUID
    display_name: str
    avatar_url: str | None
    pronouns: str | None
    bio: str | None
    location: str | None
    favourite_tea_type: TeaType | None
    member_since: datetime

    review_count: int
    average_score_given: float | None
    household_count: int

    # How the viewer relates to this person; null when nobody is signed in.
    friend_state: FriendState | None
    recent_reviews: list[ProfileReview]
