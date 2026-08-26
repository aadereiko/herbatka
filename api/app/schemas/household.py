import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.catalog import TeaType

MemberRole = Literal["owner", "member"]
StockEventKind = Literal["purchase", "brew", "adjust", "discard"]
# The kinds a client may post directly. `adjust` is excluded on purpose: it has its own
# endpoint because its number means an absolute total, not a magnitude to apply.
MovementKind = Literal["purchase", "brew", "discard"]


class UserRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str
    email: str
    avatar_url: str | None


class Member(BaseModel):
    user: UserRef
    role: MemberRole
    joined_at: datetime


class HouseholdSummary(BaseModel):
    id: uuid.UUID
    name: str
    role: MemberRole
    member_count: int
    stock_item_count: int
    low_stock_count: int
    created_at: datetime


class HouseholdDetail(HouseholdSummary):
    members: list[Member]


class HouseholdCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class HouseholdUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class InviteCreate(BaseModel):
    invited_email: str | None = Field(default=None, max_length=320)
    expires_in_days: int = Field(default=14, ge=1, le=90)


class Invite(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    invited_email: str | None
    expires_at: datetime
    created_at: datetime
    accepted_at: datetime | None


class JoinRequest(BaseModel):
    code: str = Field(min_length=1, max_length=32)


class TeaRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    tea_type: TeaType
    image_url: str | None


class ActorRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str


class StockEvent(BaseModel):
    id: uuid.UUID
    kind: StockEventKind
    delta_grams: float
    note: str | None
    occurred_at: datetime
    actor: ActorRef | None


class StockItem(BaseModel):
    id: uuid.UUID
    tea: TeaRef
    quantity_grams: float
    low_stock_grams: float
    is_low: bool
    location: str | None
    opened_at: date | None
    best_before: date | None
    updated_at: datetime


class StockItemDetail(StockItem):
    notes: str | None
    purchased_at: date | None
    price_paid_minor: int | None
    currency: str | None
    recent_events: list[StockEvent]


class StockItemCreate(BaseModel):
    tea_id: uuid.UUID
    quantity_grams: float = Field(ge=0, le=999999)
    location: str | None = Field(default=None, max_length=120)
    opened_at: date | None = None
    best_before: date | None = None
    purchased_at: date | None = None
    price_paid_minor: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    notes: str | None = None
    low_stock_grams: float = Field(default=10, ge=0, le=999999)

    @model_validator(mode="after")
    def price_needs_a_currency(self) -> "StockItemCreate":
        # Mirrors the ck_stock_price_has_currency CHECK constraint. Enforced here too so
        # the caller gets a 422 naming the field, rather than a 500 from an IntegrityError.
        if self.price_paid_minor is not None and self.currency is None:
            raise ValueError("currency is required when price_paid_minor is given")
        return self


class StockItemUpdate(BaseModel):
    """Metadata only. Quantity is absent by design — it moves through the ledger, and
    a patchable quantity would let the cached total drift from its events."""

    location: str | None = Field(default=None, max_length=120)
    opened_at: date | None = None
    best_before: date | None = None
    purchased_at: date | None = None
    price_paid_minor: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    notes: str | None = None
    low_stock_grams: float | None = Field(default=None, ge=0, le=999999)


class StockEventCreate(BaseModel):
    kind: MovementKind
    # Always a positive magnitude; the server decides the sign from `kind`. Letting the
    # client send a signed delta would make "brew -5" and "brew 5" both plausible.
    grams: float = Field(gt=0, le=999999)
    note: str | None = Field(default=None, max_length=500)


class StockAdjust(BaseModel):
    """ "I actually have 42 g." The server records the difference as an adjust event."""

    quantity_grams: float = Field(ge=0, le=999999)
    note: str | None = Field(default=None, max_length=500)


def stock_event(event: Any) -> StockEvent:
    return StockEvent(
        id=event.id,
        kind=event.kind,
        delta_grams=float(event.delta_grams),
        note=event.note,
        occurred_at=event.occurred_at,
        actor=ActorRef.model_validate(event.user) if event.user else None,
    )


def _stock_fields(item: Any) -> dict[str, Any]:
    quantity = float(item.quantity_grams)
    threshold = float(item.low_stock_grams)
    return {
        "id": item.id,
        "tea": TeaRef.model_validate(item.tea),
        "quantity_grams": quantity,
        "low_stock_grams": threshold,
        # Computed server-side so the shelf list and the "running low" filter can never
        # disagree about what counts as low.
        "is_low": quantity <= threshold,
        "location": item.location,
        "opened_at": item.opened_at,
        "best_before": item.best_before,
        "updated_at": item.updated_at,
    }


def stock_item(item: Any) -> StockItem:
    return StockItem(**_stock_fields(item))


def stock_item_detail(item: Any, events: list[Any]) -> StockItemDetail:
    return StockItemDetail(
        **_stock_fields(item),
        notes=item.notes,
        purchased_at=item.purchased_at,
        price_paid_minor=item.price_paid_minor,
        currency=item.currency,
        recent_events=[stock_event(e) for e in events],
    )
