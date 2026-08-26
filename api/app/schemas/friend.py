import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.household import TeaRef, UserRef

FriendState = Literal["none", "incoming", "outgoing", "friends", "blocked"]
RequestDirection = Literal["incoming", "outgoing"]


class Friend(BaseModel):
    user: UserRef
    friends_since: datetime


class FriendRequest(BaseModel):
    id: uuid.UUID
    user: UserRef
    direction: RequestDirection
    created_at: datetime


class SearchResult(BaseModel):
    user: UserRef
    state: FriendState


class FriendTarget(BaseModel):
    user_id: uuid.UUID


class FeedActor(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str
    avatar_url: str | None


class HouseholdRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class ReviewFeedItem(BaseModel):
    kind: Literal["review"] = "review"
    at: datetime
    actor: FeedActor
    tea: TeaRef
    score: int
    body: str | None


class StockedFeedItem(BaseModel):
    kind: Literal["stocked"] = "stocked"
    at: datetime
    actor: FeedActor | None
    tea: TeaRef
    household: HouseholdRef
    grams: float


# A discriminated union rather than one wide optional-everything model: the generated
# TypeScript then narrows on `kind`, so a client cannot read `household` off a review.
FeedItem = Annotated[ReviewFeedItem | StockedFeedItem, Field(discriminator="kind")]
