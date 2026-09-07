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


class BrewedFeedItem(BaseModel):
    """Somebody on a shelf you share made a cup.

    Visible on exactly the same terms as `StockedFeedItem`, and for the same reason: a
    brew is an event on a *household's* tin, so it follows the household rule rather than
    the friend rule. A friend's reviews are public; what a friend drinks at home is not,
    and the feed keeps it that way — see `services/feed._sources`.

    `note` rides along because it is already in the ledger and it is the most human thing
    in the whole stream. "Last of the tin" is the line that makes a feed worth reading.
    """

    kind: Literal["brewed"] = "brewed"
    at: datetime
    actor: FeedActor | None
    tea: TeaRef
    household: HouseholdRef
    grams: float
    note: str | None


# A discriminated union rather than one wide optional-everything model: the generated
# TypeScript then narrows on `kind`, so a client cannot read `household` off a review.
FeedItem = Annotated[ReviewFeedItem | StockedFeedItem | BrewedFeedItem, Field(discriminator="kind")]
