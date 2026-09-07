import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.catalog import TeaType
from app.schemas.common import Country
from app.schemas.household import TeaRef

FriendState = Literal["none", "incoming", "outgoing", "friends", "blocked", "self"]


class ProfilePerson(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str
    avatar_url: str | None


class ProfileHousehold(BaseModel):
    id: uuid.UUID
    name: str
    image_url: str | None
    # True when the viewer is a member too. False means the viewer may see the name and
    # nothing else — GET /households/{id} will 404 for them — so the client must not
    # render it as a link.
    shared: bool


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
    status: str | None
    city: str | None
    country: Country | None
    favourite_tea_type: TeaType | None
    member_since: datetime

    review_count: int
    average_score_given: float | None
    # Both counts mean "how many the viewer may see", not the person's true totals.
    # A true total beside a filtered list would leak exactly the number the rule hides:
    # "1 of 5 households" tells a stranger there are four more.
    household_count: int
    friend_count: int

    # How the viewer relates to this person; null when nobody is signed in.
    friend_state: FriendState | None
    recent_reviews: list[ProfileReview]

    # Filtered server-side. The viewer never receives what they may not see, so there is
    # nothing for a client to get wrong.
    households: list[ProfileHousehold]
    friends: list[ProfilePerson]
