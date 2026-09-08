from pydantic import BaseModel

from app.schemas.catalog import TeaSummary
from app.schemas.friend import FeedItem, HouseholdRef
from app.schemas.household import StockItem, StockPace


class LowTin(BaseModel):
    """A tin worth reordering, which shelf it is on, and how long it has left.

    `pace` is None when the ledger cannot forecast this tin yet — it is on the list
    because it fell below its hand-set threshold, and the client has to say exactly that
    rather than imply a deadline nobody computed.
    """

    item: StockItem
    household: HouseholdRef
    pace: StockPace | None


class HomeSummary(BaseModel):
    """Everything the signed-in home page needs, in one request.

    Assembled server-side rather than by the client firing one call per household:
    the page's whole job is to be the first thing you see, and a waterfall of five
    requests is exactly what that must not be.
    """

    display_name: str
    household_count: int
    tin_count: int
    low_stock: list[LowTin]
    friend_count: int
    pending_requests: int
    review_count: int
    recent_activity: list[FeedItem]
    unrated: list[TeaSummary]


class PublicSummary(BaseModel):
    """What a signed-out visitor is shown. Public counts only — nothing about anyone."""

    tea_count: int
    shop_count: int
    ingredient_count: int
    featured: list[TeaSummary]
