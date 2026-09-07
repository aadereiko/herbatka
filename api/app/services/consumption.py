"""How fast a shelf gets through its tea.

`StockEvent` was built for this and its docstring says so: signed deltas rather than an
absolute reading, "so the log answers 'who finished the oolong' and *how fast do we get
through this*". The first question the tin page already answers — every event names its
actor. This module is the second one, and the reorder suggester the same comment
anticipates.

It lives apart from `services/stock.py` deliberately. That module *moves* grams and owns
the invariant that `stock_item.quantity_grams` equals `SUM(stock_event.delta_grams)`;
this one only ever reads, and reads across tins and people rather than down one tin. No
migration was needed for any of it — every number below is derived from rows the ledger
has been keeping since M3, which is the whole return on having written it append-only.

## The three judgement calls

**What counts as going out.** For *pace and time-to-empty*, every negative delta counts:
a brew, a discard, and the downward half of a recount. The question is "when will this be
empty", and tea thrown away leaves the tin just as surely as tea drunk. For *who drinks
what*, only `brew` counts — throwing out a stale tin is not drinking it, and a leaderboard
that says otherwise is one nobody will trust twice.

**How far back to look.** `WINDOW_DAYS` at a time. Long enough that one heavy weekend does
not dominate, short enough that a tin you loved in spring and abandoned in June reports
what you are doing *now*.

**When to say nothing at all.** This is the important one. A rate from a single event is
arithmetic, not evidence: brew 5 g an hour after opening a tin and the naive rate is
120 g a day, so a 60 g tin "runs out this afternoon". Both floors below exist to refuse
that. Under `MIN_OUTFLOW_EVENTS` events or `MIN_OBSERVED_DAYS` days of history there is no
answer, and the API returns `null` rather than a confident wrong number — a forecast
nobody can trust is worse than a blank, because the blank is honest.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.catalog import Tea
from app.models.household import HouseholdMember, StockEvent, StockItem
from app.models.user import User

#: Twelve weeks. Everything older is ignored entirely, so a tin's ancient history cannot
#: outvote what is happening now.
WINDOW_DAYS = 84

#: Below these, `pace()` returns None. See the module docstring — this is a refusal to
#: guess, not a tuning knob to lower when the number looks blank in development.
MIN_OBSERVED_DAYS = 7
MIN_OUTFLOW_EVENTS = 2

#: How many tins the household summary forecasts. The page shows what to buy next, and a
#: list of forty is not a shopping list.
RUNNING_OUT_LIMIT = 8


@dataclass(frozen=True)
class Pace:
    """What one tin is being drunk at, and how long that leaves."""

    grams_per_week: float
    #: Over how many days of real history the rate was measured. Shown to the reader,
    #: because "12 g a week" means something different after nine days than after ninety.
    days_observed: int
    events_counted: int
    #: None when the tin is already empty — there is nothing left to run out.
    days_remaining: int | None


def _window_start(now: datetime) -> datetime:
    return now - timedelta(days=WINDOW_DAYS)


def compute_pace(
    *,
    grams_out: float,
    events: int,
    first_at: datetime | None,
    quantity_grams: float,
    now: datetime,
) -> Pace | None:
    """The arithmetic, as a pure function.

    Separated from the queries so that both callers — one tin, and the batch over a whole
    shelf — run the *same* code rather than two implementations that agree until somebody
    edits one of them. It is also the only part of this module worth unit-testing directly,
    and it can be, with no database.

    The span runs from the first outflow in the window to **now**, not to the last event.
    That difference is the whole forecast: measured first-to-last, a tin brewed twice on
    one day two months ago and untouched since reads as 10 g a day and "empty by Friday".
    Measured first-to-now it reads as barely touched, which is what actually happened.
    """
    if first_at is None or events < MIN_OUTFLOW_EVENTS or grams_out <= 0:
        return None

    observed_days = (now - first_at).total_seconds() / 86_400
    if observed_days < MIN_OBSERVED_DAYS:
        return None

    per_day = grams_out / observed_days
    if per_day <= 0:
        return None

    return Pace(
        grams_per_week=round(per_day * 7, 1),
        days_observed=int(observed_days),
        events_counted=events,
        # Rounded down: "about 3 weeks left" should run out no earlier than it says.
        days_remaining=int(quantity_grams / per_day) if quantity_grams > 0 else None,
    )


def _outflow_query(now: datetime):
    """Negative deltas inside the window, which is the shape both aggregates start from."""
    return select(
        # Negated in SQL so the caller reads a positive "grams that left the tin".
        func.coalesce(func.sum(-StockEvent.delta_grams), 0).label("grams_out"),
        func.count().label("events"),
        func.min(StockEvent.occurred_at).label("first_at"),
    ).where(
        StockEvent.delta_grams < 0,
        StockEvent.occurred_at >= _window_start(now),
    )


async def pace_for_item(db: AsyncSession, item: StockItem) -> Pace | None:
    """One tin's pace, for the tin page."""
    now = datetime.now(UTC)
    row = (await db.execute(_outflow_query(now).where(StockEvent.stock_item_id == item.id))).one()
    return compute_pace(
        grams_out=float(row.grams_out),
        events=row.events,
        first_at=row.first_at,
        quantity_grams=float(item.quantity_grams),
        now=now,
    )


async def pace_for_items(
    db: AsyncSession, item_ids: list[uuid.UUID]
) -> dict[uuid.UUID, tuple[float, int, datetime | None]]:
    """The same outflow figures for many tins, in one grouped query.

    One round trip rather than one per tin: the home page asks about every tin on every
    shelf you share, and the household summary about every tin on one. Returns the raw
    figures rather than `Pace` objects because the caller holds the quantities.
    """
    if not item_ids:
        return {}

    now = datetime.now(UTC)
    rows = (
        await db.execute(
            _outflow_query(now)
            .add_columns(StockEvent.stock_item_id.label("item_id"))
            .where(StockEvent.stock_item_id.in_(item_ids))
            .group_by(StockEvent.stock_item_id)
        )
    ).all()
    return {r.item_id: (float(r.grams_out), r.events, r.first_at) for r in rows}


@dataclass(frozen=True)
class DrinkerShare:
    """One person's brewing on one shelf, over the window."""

    user: User | None
    grams: float
    brews: int


@dataclass(frozen=True)
class TeaShare:
    tea: Tea
    grams: float
    brews: int


@dataclass(frozen=True)
class Forecast:
    item: StockItem
    pace: Pace


@dataclass(frozen=True)
class HouseholdConsumption:
    window_days: int
    #: Everything that left the shelf: brewed, discarded and recounted away.
    grams_out: float
    grams_per_week: float
    #: Brewing only. `sum(d.grams for d in drinkers)` is therefore *less* than `grams_out`
    #: wherever anything was thrown out, and that gap is honest rather than a bug.
    drinkers: list[DrinkerShare]
    teas: list[TeaShare]
    running_out: list[Forecast]


def _brewed_in_window(household_id: uuid.UUID, now: datetime):
    """Brews only, on this shelf, inside the window.

    `brew` rather than every outflow, because these two aggregates answer "who drinks
    what" and "which tea do we drink". Counting a discard as drinking would credit
    whoever cleared out a stale tin with having finished it.
    """
    return (
        select(StockEvent)
        .join(StockItem, StockItem.id == StockEvent.stock_item_id)
        .where(
            StockItem.household_id == household_id,
            StockEvent.kind == "brew",
            StockEvent.occurred_at >= _window_start(now),
        )
    )


async def household_summary(db: AsyncSession, household_id: uuid.UUID) -> HouseholdConsumption:
    """Everything the consumption page shows, in four queries.

    Four rather than one big join, because the four are genuinely different shapes —
    a scalar, two groupings on different columns, and a per-tin forecast — and a single
    query producing all of them would be a cross join nobody could read or index.
    """
    now = datetime.now(UTC)
    shelf = select(StockItem.id).where(StockItem.household_id == household_id).scalar_subquery()

    # 1. Everything that left the shelf, for the headline rate.
    totals = (
        await db.execute(_outflow_query(now).where(StockEvent.stock_item_id.in_(shelf)))
    ).one()
    grams_out = float(totals.grams_out)
    # The headline divides by the *window*, not by observed history: a shelf's pace is
    # "how much this household gets through in a week", and a quiet fortnight is part of
    # that answer rather than a gap to be normalised away.
    grams_per_week = round(grams_out / WINDOW_DAYS * 7, 1)

    # 2. Who brewed. Grouped in SQL, then the users loaded in one batch.
    drinker_rows = (
        await db.execute(
            _brewed_in_window(household_id, now)
            .with_only_columns(
                StockEvent.user_id,
                func.coalesce(func.sum(-StockEvent.delta_grams), 0).label("grams"),
                func.count().label("brews"),
            )
            .group_by(StockEvent.user_id)
            .order_by(func.sum(-StockEvent.delta_grams).desc())
        )
    ).all()
    user_ids = [r.user_id for r in drinker_rows if r.user_id is not None]
    users = (
        {u.id: u for u in await db.scalars(select(User).where(User.id.in_(user_ids)))}
        if user_ids
        else {}
    )
    drinkers = [
        # `user_id` is nullable — the ledger keeps a departed member's events with the
        # actor set to NULL rather than erasing history the rest of the shelf shares. It
        # surfaces as an unnamed row, the same way the feed says "Somebody".
        DrinkerShare(user=users.get(r.user_id), grams=float(r.grams), brews=r.brews)
        for r in drinker_rows
    ]

    # 3. Which teas. Same grouping, one join further out.
    tea_rows = (
        await db.execute(
            _brewed_in_window(household_id, now)
            .with_only_columns(
                StockItem.tea_id,
                func.coalesce(func.sum(-StockEvent.delta_grams), 0).label("grams"),
                func.count().label("brews"),
            )
            .group_by(StockItem.tea_id)
            .order_by(func.sum(-StockEvent.delta_grams).desc())
        )
    ).all()
    tea_ids = [r.tea_id for r in tea_rows]
    teas = (
        {t.id: t for t in await db.scalars(select(Tea).where(Tea.id.in_(tea_ids)))}
        if tea_ids
        else {}
    )
    tea_shares = [
        TeaShare(tea=teas[r.tea_id], grams=float(r.grams), brews=r.brews)
        for r in tea_rows
        if r.tea_id in teas
    ]

    # 4. What to buy next: every tin with enough history to forecast, soonest first.
    items = list(
        await db.scalars(
            select(StockItem)
            .options(selectinload(StockItem.tea))
            .where(StockItem.household_id == household_id, StockItem.quantity_grams > 0)
        )
    )
    outflow = await pace_for_items(db, [i.id for i in items])
    forecasts: list[Forecast] = []
    for item in items:
        grams, events, first_at = outflow.get(item.id, (0.0, 0, None))
        measured = compute_pace(
            grams_out=grams,
            events=events,
            first_at=first_at,
            quantity_grams=float(item.quantity_grams),
            now=now,
        )
        # Tins with too little history are simply absent. They are not "fine" — nothing
        # is known about them — and a forecast list padded with unknowns is one nobody
        # can read at a glance.
        if measured is not None and measured.days_remaining is not None:
            forecasts.append(Forecast(item=item, pace=measured))
    forecasts.sort(key=lambda f: f.pace.days_remaining or 0)

    return HouseholdConsumption(
        window_days=WINDOW_DAYS,
        grams_out=round(grams_out, 1),
        grams_per_week=grams_per_week,
        drinkers=drinkers,
        teas=tea_shares,
        running_out=forecasts[:RUNNING_OUT_LIMIT],
    )


@dataclass(frozen=True)
class WeekBucket:
    """One week of one tea, for the plot on its page."""

    #: Monday of the week, as a date. The x-axis label.
    week_start: date
    grams: float
    brews: int


#: How many weeks the tea plot covers. Twelve columns is about as many as fit legibly
#: across a card on a phone, and it matches `WINDOW_DAYS` so the plot and the pace figures
#: on the same screen are never describing different stretches of time.
SERIES_WEEKS = WINDOW_DAYS // 7


async def tea_series(db: AsyncSession, user_id: uuid.UUID, tea_id: uuid.UUID) -> list[WeekBucket]:
    """Weekly grams of one tea, brewed on any shelf the viewer belongs to.

    **Scoped to the viewer, not to the tea.** A tea page is public — anyone can read what
    is in a blend — but how much of it *you* drink is household business, and the same
    rule the feed follows applies here: only shelves the viewer is a member of. A
    signed-out reader gets no series at all rather than an aggregate over strangers.

    **Every week in the window is returned, including the empty ones.** The database only
    has rows for weeks something happened, and plotting just those would space three
    scattered brews evenly across the axis and draw a picture of steady drinking. Gaps
    are data — a fortnight of nothing is the most informative thing a consumption plot
    can show — so the range is generated here and the query fills it in.
    """
    now = datetime.now(UTC)
    my_shelves = (
        select(HouseholdMember.household_id)
        .where(HouseholdMember.user_id == user_id)
        .scalar_subquery()
    )

    # Monday of the current week, then back `SERIES_WEEKS - 1` more.
    this_monday = (now - timedelta(days=now.weekday())).date()
    starts = [this_monday - timedelta(weeks=n) for n in range(SERIES_WEEKS - 1, -1, -1)]

    rows = (
        await db.execute(
            select(
                func.date_trunc("week", StockEvent.occurred_at).label("week"),
                func.coalesce(func.sum(-StockEvent.delta_grams), 0).label("grams"),
                func.count().label("brews"),
            )
            .join(StockItem, StockItem.id == StockEvent.stock_item_id)
            .where(
                StockItem.tea_id == tea_id,
                StockItem.household_id.in_(my_shelves),
                StockEvent.kind == "brew",
                StockEvent.occurred_at >= datetime.combine(starts[0], time.min, tzinfo=UTC),
            )
            .group_by("week")
        )
    ).all()

    found = {r.week.date(): (float(r.grams), r.brews) for r in rows}
    return [
        WeekBucket(
            week_start=start,
            grams=found.get(start, (0.0, 0))[0],
            brews=found.get(start, (0.0, 0))[1],
        )
        for start in starts
    ]
