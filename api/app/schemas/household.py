import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.catalog import NewShopIn, TeaCreate, TeaType

if TYPE_CHECKING:
    from app.schemas.shop import ShopRef

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
    image_url: str | None
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
    name: str | None = Field(default=None, min_length=1, max_length=120)
    image_url: str | None = Field(default=None, max_length=500)


class HouseholdBrief(BaseModel):
    """A household as it looks to somebody who is not in it yet.

    Name and picture and nothing else: an invitation has to say *which* shelf is being
    offered, and "Flat 3B" next to a photograph is how somebody recognises it. Counts are
    absent on purpose — how many tins are in a household is a members-only fact, and an
    invitation is not membership.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    image_url: str | None


class InviteCreate(BaseModel):
    invited_email: str | None = Field(default=None, max_length=320)
    expires_in_days: int = Field(default=14, ge=1, le=90)


class FriendInviteCreate(BaseModel):
    """Invite one named friend. `user_id` only — an email here would be a second way to
    name a recipient and would reopen exactly the "invite an arbitrary stranger" door the
    friendship check exists to close."""

    user_id: uuid.UUID
    expires_in_days: int = Field(default=14, ge=1, le=90)


class Invite(BaseModel):
    """One outstanding offer, as the household's owner sees it.

    `code` and `invited_user` are the two flavours and exactly one is ever populated — the
    `ck_household_invite_code_xor_recipient` CHECK guarantees it — so a client renders
    whichever is not null and never has to decide which wins.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str | None
    invited_email: str | None
    invited_user: UserRef | None
    expires_at: datetime
    created_at: datetime
    accepted_at: datetime | None
    # Set means they said no. The owner is shown it rather than left watching a row that
    # will never move; see `decline_invitation`.
    declined_at: datetime | None


class Invitation(BaseModel):
    """One offer, as the invited person sees it.

    Shaped after `FriendRequest` rather than after `Invite`, because it answers the same
    question on the same kind of screen: something is waiting on you, here is who it is
    from, accept or decline. It carries no code — a named invite has none — and no member
    list, because you are not a member yet.
    """

    id: uuid.UUID
    household: HouseholdBrief
    # Nullable because `created_by_id` is ON DELETE SET NULL: the household outlives the
    # owner who sent the invitation, and so does the invitation.
    invited_by: UserRef | None
    created_at: datetime
    expires_at: datetime


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


class HouseholdEvent(StockEvent):
    """A ledger row on the household timeline.

    `StockEvent` plus the tea, because on a single tin's page the heading already says
    which tea it is and here it does not — a shelf's activity is unreadable without it.
    """

    tea: TeaRef
    item_id: uuid.UUID


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
    # Forward-referenced: schemas.shop imports TeaRef from here, so importing it back at
    # runtime would be a cycle. schemas.shop calls the model_rebuild below.
    shop: "ShopRef | None"


class StockPace(BaseModel):
    """How fast one tin is going, and how long that leaves.

    Nullable on the tin it describes, and that is the contract: below the floors in
    `services.consumption` there is no honest answer, and `null` says so. A client must
    render the absence as "not enough history yet" rather than as zero — a tin nobody has
    touched twice is not a tin being drunk at 0 g a week.
    """

    grams_per_week: float
    #: How much real history the rate is measured over. Surfaced because "12 g a week"
    #: deserves different confidence after nine days than after ninety.
    days_observed: int
    events_counted: int
    #: None when the tin is already empty: there is nothing left to run out.
    days_remaining: int | None


class StockItemDetail(StockItem):
    notes: str | None
    purchased_at: date | None
    price_paid_minor: int | None
    currency: str | None
    recent_events: list[StockEvent]
    #: None until the ledger has enough to say. See `StockPace`.
    pace: StockPace | None


class StockItemCreate(BaseModel):
    #: The catalog's tea. Optional only because `new_tea` is the other way to answer the
    #: same question — see `one_tea_and_only_one`.
    tea_id: uuid.UUID | None = None
    #: A tea the catalog does not have yet, proposed while the shopping is being unpacked.
    #:
    #: The whole `TeaCreate` body, and the same schema `POST /catalog/teas` takes, because
    #: the two ways of submitting a tea must not drift: one service call creates it — slug,
    #: the unapproved default, any new ingredients — inside this request's transaction. The
    #: alternative was telling somebody mid-form to go to Teas, add it there and start
    #: again, which is how a half-filled form gets abandoned instead of finished.
    new_tea: TeaCreate | None = None
    # Optional, and settable when adding a tin by hand — not only when the buy flow
    # sets it. A tin bought in a shop is a tin bought in a shop either way.
    shop_id: uuid.UUID | None = None
    #: The shop half of the same problem: a tin came from wherever it came from, and the
    #: catalog not knowing the place is not a reason to record nothing. Creating it also
    #: creates a listing for this tin's tea — see `NewShopIn`.
    new_shop: NewShopIn | None = None
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

    @model_validator(mode="after")
    def one_tea_and_only_one(self) -> "StockItemCreate":
        # Neither is a tin of nothing. Both is two answers to one question, and choosing
        # one of them on the caller's behalf is guessing which tin they meant to shelve.
        if (self.tea_id is None) == (self.new_tea is None):
            raise ValueError("give either tea_id or new_tea, not both")
        return self

    @model_validator(mode="after")
    def one_shop_at_most(self) -> "StockItemCreate":
        # Unlike the tea, neither is fine: a gift came from nowhere the catalog can name.
        if self.shop_id is not None and self.new_shop is not None:
            raise ValueError("give either shop_id or new_shop, not both")
        # `TeaCreate.new_shop` exists for the Teas page, where the tea is the only thing
        # being written and a listing is all a shop can be attached to. A tin has its own
        # `shop_id` to fill in as well, so here the shop is proposed at this level —
        # honouring both fields would create the same shop twice under two slugs.
        if self.new_tea is not None and self.new_tea.new_shop is not None:
            raise ValueError("put the shop on the tin's new_shop, not on new_tea")
        return self


class StockItemUpdate(BaseModel):
    """Metadata only. Quantity is absent by design — it moves through the ledger, and
    a patchable quantity would let the cached total drift from its events."""

    shop_id: uuid.UUID | None = None

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


def household_event(event: Any) -> HouseholdEvent:
    return HouseholdEvent(
        **stock_event(event).model_dump(),
        tea=TeaRef.model_validate(event.stock_item.tea),
        item_id=event.stock_item_id,
    )


class TeaWeek(BaseModel):
    """One column of the plot on a tea's page."""

    week_start: date
    grams: float
    brews: int


class TeaSeries(BaseModel):
    """Weekly grams of one tea on the viewer's own shelves.

    Always exactly `weeks` entries, oldest first, including the weeks in which nothing
    happened. A plot that silently drops empty weeks spaces the remaining ones evenly and
    draws steady drinking out of three scattered cups — the gaps are the most informative
    part of a consumption series, so they are transmitted rather than inferred.

    `total_grams` of 0 means the viewer has genuinely brewed none of it: the client shows
    nothing at all rather than twelve empty columns.
    """

    weeks: list[TeaWeek]
    total_grams: float
    total_brews: int


def tea_series(buckets: list[Any]) -> TeaSeries:
    return TeaSeries(
        weeks=[
            TeaWeek(week_start=b.week_start, grams=round(b.grams, 1), brews=b.brews)
            for b in buckets
        ],
        total_grams=round(sum(b.grams for b in buckets), 1),
        total_brews=sum(b.brews for b in buckets),
    )


def _stock_fields(item: Any) -> dict[str, Any]:
    from app.schemas.shop import ShopRef

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
        "shop": ShopRef.model_validate(item.shop) if item.shop else None,
    }


def stock_item(item: Any) -> StockItem:
    return StockItem(**_stock_fields(item))


def stock_pace(pace: Any) -> StockPace:
    return StockPace(
        grams_per_week=pace.grams_per_week,
        days_observed=pace.days_observed,
        events_counted=pace.events_counted,
        days_remaining=pace.days_remaining,
    )


def stock_item_detail(item: Any, events: list[Any], pace: Any = None) -> StockItemDetail:
    return StockItemDetail(
        **_stock_fields(item),
        notes=item.notes,
        purchased_at=item.purchased_at,
        price_paid_minor=item.price_paid_minor,
        currency=item.currency,
        recent_events=[stock_event(e) for e in events],
        pace=stock_pace(pace) if pace is not None else None,
    )


class DrinkerShare(BaseModel):
    """One person's brewing on one shelf.

    `user` is nullable for the same reason the feed's actor is: `stock_event.user_id` is
    ON DELETE SET NULL, so a departed member's brews stay in the ledger the rest of the
    household still shares, with nobody's name on them.
    """

    user: ActorRef | None
    grams: float
    brews: int


class TeaShare(BaseModel):
    tea: TeaRef
    grams: float
    brews: int


class TinForecast(BaseModel):
    item: StockItem
    pace: StockPace


class HouseholdConsumption(BaseModel):
    """What a shelf gets through, and what to buy next.

    Two totals that deliberately do not match: `grams_out` counts everything that left
    the shelf, including tea thrown away, because that is what empties a tin; the
    `drinkers` and `teas` breakdowns count brewing only, because throwing out a stale tin
    is not drinking it. Where they differ, something was discarded.
    """

    window_days: int
    grams_out: float
    grams_per_week: float
    drinkers: list[DrinkerShare]
    teas: list[TeaShare]
    #: Soonest-empty first, and only tins the ledger can actually forecast.
    running_out: list[TinForecast]


def household_consumption(summary: Any) -> HouseholdConsumption:
    return HouseholdConsumption(
        window_days=summary.window_days,
        grams_out=summary.grams_out,
        grams_per_week=summary.grams_per_week,
        drinkers=[
            DrinkerShare(
                user=ActorRef.model_validate(d.user) if d.user else None,
                grams=round(d.grams, 1),
                brews=d.brews,
            )
            for d in summary.drinkers
        ],
        teas=[
            TeaShare(tea=TeaRef.model_validate(t.tea), grams=round(t.grams, 1), brews=t.brews)
            for t in summary.teas
        ],
        running_out=[
            TinForecast(item=stock_item(f.item), pace=stock_pace(f.pace))
            for f in summary.running_out
        ],
    )
