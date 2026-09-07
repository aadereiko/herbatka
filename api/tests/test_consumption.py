"""Pace, forecasts, and who drank what.

Split across two levels on purpose. `TestPaceArithmetic` drives `compute_pace` directly
with no database at all — it is a pure function precisely so that the judgement calls in
it (the floors, and measuring to *now* rather than to the last event) can be pinned down
one at a time. Everything below it exercises the same function through HTTP, where the
interesting part is no longer the arithmetic but the wiring and the visibility rules.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.household import StockEvent
from app.services.consumption import MIN_OBSERVED_DAYS, WINDOW_DAYS, compute_pace
from tests.conftest import Account
from tests.test_friends import befriend

#: A fixed clock for the pure-arithmetic tests, which pass their own `now` and so need
#: no relationship to the real one.
FIXED_NOW = datetime(2026, 6, 1, 12, 0, tzinfo=UTC)


def fixed_days_ago(days: float) -> datetime:
    return FIXED_NOW - timedelta(days=days)


def days_ago(days: float) -> datetime:
    """Backdating for the HTTP tests, measured from the *real* clock.

    It has to be the real one: the service reads `datetime.now(UTC)` and ignores anything
    older than `WINDOW_DAYS`, so events dated from a hardcoded 2026-06-01 fall outside the
    window the moment the calendar moves past August and every forecast quietly becomes
    null. Which is exactly how this was found.
    """
    return datetime.now(UTC) - timedelta(days=days)


async def backdate_brew(
    db: AsyncSession, item_id: str, actor: Account, *, grams: float, days: float
) -> None:
    """Write a brew straight into the ledger with a chosen date.

    The API always stamps `occurred_at` with the current time, and a pace needs a week of
    history before it will say anything — so every test here that wants a forecast has to
    reach past the endpoint. It writes only the event, not the cached quantity: these
    tests are about what the *ledger* says, and the tin's head is set up through the API
    where it matters.
    """
    db.add(
        StockEvent(
            stock_item_id=uuid.UUID(item_id),
            user_id=uuid.UUID(actor.id),
            kind="brew",
            delta_grams=-grams,
            occurred_at=days_ago(days),
        )
    )
    await db.flush()


class TestPaceArithmetic:
    def test_a_steady_week_gives_a_weekly_rate(self) -> None:
        pace = compute_pace(
            grams_out=28.0,
            events=14,
            first_at=fixed_days_ago(14),
            quantity_grams=56.0,
            now=FIXED_NOW,
        )
        assert pace is not None
        assert pace.grams_per_week == 14.0
        # 56 g left at 2 g a day.
        assert pace.days_remaining == 28
        assert pace.days_observed == 14

    def test_one_event_is_never_enough(self) -> None:
        """Arithmetic, not evidence. A single brew an hour after opening a tin would
        otherwise forecast the whole thing gone by teatime."""
        assert (
            compute_pace(
                grams_out=5.0,
                events=1,
                first_at=fixed_days_ago(30),
                quantity_grams=100.0,
                now=FIXED_NOW,
            )
            is None
        )

    def test_a_few_days_of_history_is_never_enough(self) -> None:
        assert (
            compute_pace(
                grams_out=20.0,
                events=6,
                first_at=fixed_days_ago(MIN_OBSERVED_DAYS - 1),
                quantity_grams=100.0,
                now=FIXED_NOW,
            )
            is None
        )

    def test_the_span_runs_to_now_not_to_the_last_event(self) -> None:
        """The single most important line in the module.

        A tin brewed hard for two days and then abandoned for two months is not being
        drunk at the two-day rate. Measured first-to-last it reads 10 g a day and "empty
        this week"; measured first-to-now it reads as barely touched, which is what
        actually happened.
        """
        pace = compute_pace(
            grams_out=20.0,
            events=4,
            first_at=fixed_days_ago(60),
            quantity_grams=80.0,
            now=FIXED_NOW,
        )
        assert pace is not None
        assert pace.grams_per_week == pytest.approx(2.3, abs=0.05)
        assert pace.days_remaining == 240

    def test_an_empty_tin_has_a_rate_but_no_deadline(self) -> None:
        pace = compute_pace(
            grams_out=100.0,
            events=20,
            first_at=fixed_days_ago(50),
            quantity_grams=0.0,
            now=FIXED_NOW,
        )
        assert pace is not None
        assert pace.grams_per_week > 0
        # Nothing left to run out. None rather than 0, so a client can tell "already
        # empty" apart from "empties today".
        assert pace.days_remaining is None

    def test_nothing_going_out_is_not_a_rate_of_zero(self) -> None:
        assert (
            compute_pace(grams_out=0.0, events=0, first_at=None, quantity_grams=50.0, now=FIXED_NOW)
            is None
        )


class TestTinPace:
    async def test_a_tin_with_no_history_reports_no_pace(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        """Null, not zero. A tin nobody has brewed twice is not one being drunk at
        0 g a week — nothing is known about it, and the client has to say so."""
        response = await client.get(
            f"/api/v1/households/{household['id']}/stock/{tin['id']}", headers=owner.headers
        )

        assert response.status_code == 200
        assert response.json()["pace"] is None

    async def test_a_brewed_tin_reports_its_pace_and_a_deadline(
        self,
        client: AsyncClient,
        db: AsyncSession,
        owner: Account,
        household: dict,
        tin: dict,
    ) -> None:
        for day in (30, 20, 10):
            await backdate_brew(db, tin["id"], owner, grams=10, days=day)

        response = await client.get(
            f"/api/v1/households/{household['id']}/stock/{tin['id']}", headers=owner.headers
        )

        pace = response.json()["pace"]
        assert pace is not None
        assert pace["events_counted"] == 3
        assert pace["grams_per_week"] > 0
        assert pace["days_remaining"] > 0

    async def test_events_older_than_the_window_are_ignored(
        self,
        client: AsyncClient,
        db: AsyncSession,
        owner: Account,
        household: dict,
        tin: dict,
    ) -> None:
        """Last spring's habit is not this month's pace."""
        for day in (WINDOW_DAYS + 5, WINDOW_DAYS + 10, WINDOW_DAYS + 20):
            await backdate_brew(db, tin["id"], owner, grams=50, days=day)

        response = await client.get(
            f"/api/v1/households/{household['id']}/stock/{tin['id']}", headers=owner.headers
        )

        assert response.json()["pace"] is None


class TestHouseholdConsumption:
    def url(self, household_id: str) -> str:
        return f"/api/v1/households/{household_id}/consumption"

    async def test_reports_who_brewed_and_which_teas(
        self,
        client: AsyncClient,
        db: AsyncSession,
        owner: Account,
        flatmate: Account,
        shared_household: dict,
        tea,
    ) -> None:
        created = await client.post(
            f"/api/v1/households/{shared_household['id']}/stock",
            headers=owner.headers,
            json={"tea_id": str(tea.id), "quantity_grams": 200},
        )
        item_id = created.json()["id"]

        await backdate_brew(db, item_id, owner, grams=30, days=20)
        await backdate_brew(db, item_id, flatmate, grams=10, days=10)

        body = (await client.get(self.url(shared_household["id"]), headers=owner.headers)).json()

        assert body["grams_out"] == 40.0
        by_name = {d["user"]["display_name"]: d["grams"] for d in body["drinkers"]}
        assert by_name["Owner"] == 30.0
        assert by_name["Flatmate"] == 10.0
        # Ordered by who drank most, so the page reads as a ranking without the client
        # having to sort it.
        assert body["drinkers"][0]["user"]["display_name"] == "Owner"
        assert [t["tea"]["name"] for t in body["teas"]] == [tea.name]

    async def test_discards_count_against_the_shelf_but_not_against_a_person(
        self,
        client: AsyncClient,
        db: AsyncSession,
        owner: Account,
        household: dict,
        tin: dict,
    ) -> None:
        """The two totals are meant to disagree.

        `grams_out` answers "what emptied the tin" and counts tea thrown away.
        `drinkers` answers "who drank it" and does not — crediting somebody with
        finishing a tin they poured down the sink is how a leaderboard loses its
        readers.
        """
        await backdate_brew(db, tin["id"], owner, grams=10, days=20)
        await backdate_brew(db, tin["id"], owner, grams=10, days=10)
        await client.post(
            f"/api/v1/households/{household['id']}/stock/{tin['id']}/events",
            headers=owner.headers,
            json={"kind": "discard", "grams": 25},
        )

        body = (await client.get(self.url(household["id"]), headers=owner.headers)).json()

        assert body["grams_out"] == 45.0
        assert sum(d["grams"] for d in body["drinkers"]) == 20.0

    async def test_forecasts_the_tin_running_out_soonest_first(
        self,
        client: AsyncClient,
        db: AsyncSession,
        owner: Account,
        household: dict,
        tea,
        tin: dict,
    ) -> None:
        from app.models.catalog import Tea

        other = Tea(
            slug="test-hojicha",
            name="Test Hojicha",
            tea_type="green",
            caffeine_level="low",
            is_approved=True,
        )
        db.add(other)
        await db.flush()
        second = (
            await client.post(
                f"/api/v1/households/{household['id']}/stock",
                headers=owner.headers,
                json={"tea_id": str(other.id), "quantity_grams": 100},
            )
        ).json()

        # The first tin: drunk hard. The second: the same history, a tenth of the pace.
        for day in (30, 20, 10):
            await backdate_brew(db, tin["id"], owner, grams=25, days=day)
            await backdate_brew(db, second["id"], owner, grams=2, days=day)

        body = (await client.get(self.url(household["id"]), headers=owner.headers)).json()

        names = [f["item"]["tea"]["name"] for f in body["running_out"]]
        assert names[0] == tea.name
        assert set(names) == {tea.name, other.name}

    async def test_a_non_member_cannot_read_it(
        self, client: AsyncClient, outsider: Account, household: dict
    ) -> None:
        """The most private thing the app computes: who has been drinking what."""
        response = await client.get(self.url(household["id"]), headers=outsider.headers)
        assert response.status_code in (403, 404)


class TestBrewsInTheFeed:
    async def test_a_flatmate_sees_your_brew(
        self,
        client: AsyncClient,
        db: AsyncSession,
        owner: Account,
        flatmate: Account,
        shared_household: dict,
        tea,
    ) -> None:
        created = await client.post(
            f"/api/v1/households/{shared_household['id']}/stock",
            headers=owner.headers,
            json={"tea_id": str(tea.id), "quantity_grams": 100},
        )
        await client.post(
            f"/api/v1/households/{shared_household['id']}/stock/{created.json()['id']}/events",
            headers=owner.headers,
            json={"kind": "brew", "grams": 6, "note": "first of the morning"},
        )

        feed = (await client.get("/api/v1/feed", headers=flatmate.headers)).json()

        brews = [i for i in feed["items"] if i["kind"] == "brewed"]
        assert len(brews) == 1
        assert brews[0]["actor"]["display_name"] == "Owner"
        assert brews[0]["tea"]["name"] == tea.name
        # Stored negative, shown positive: "brewed -6 g" is not a sentence.
        assert brews[0]["grams"] == 6.0
        assert brews[0]["note"] == "first of the morning"

    async def test_a_friend_outside_the_household_does_not(
        self,
        client: AsyncClient,
        owner: Account,
        outsider: Account,
        household: dict,
        tin: dict,
    ) -> None:
        """The rule this whole source hangs on.

        "Show me what my friends are drinking" is the tempting version of this feature and
        it is a leak: a brew says what is on a household's shelf, who was in the house and
        when. Reviews are public and follow the friend rule; brews are household business
        and follow the household rule. Being friends must not change that by one item.
        """
        await befriend(client, owner, outsider)
        await client.post(
            f"/api/v1/households/{household['id']}/stock/{tin['id']}/events",
            headers=owner.headers,
            json={"kind": "brew", "grams": 5},
        )

        feed = (await client.get("/api/v1/feed", headers=outsider.headers)).json()

        assert [i for i in feed["items"] if i["kind"] == "brewed"] == []


class TestRunningLowForecast:
    async def test_a_tin_above_its_threshold_still_warns_when_it_is_going_fast(
        self,
        client: AsyncClient,
        db: AsyncSession,
        owner: Account,
        household: dict,
        tin: dict,
    ) -> None:
        """The reason the forecast was worth adding.

        The tin holds 100 g against a 20 g threshold, so the old rule says nothing at all.
        The ledger says it is going at 70 g a week and has about a week left.
        """
        for day in (28, 21, 14, 7):
            await backdate_brew(db, tin["id"], owner, grams=70, days=day)

        body = (await client.get("/api/v1/home", headers=owner.headers)).json()

        low = body["low_stock"]
        assert [t["item"]["id"] for t in low] == [tin["id"]]
        assert low[0]["item"]["is_low"] is False
        assert low[0]["pace"]["days_remaining"] <= 14

    async def test_a_tin_below_its_threshold_still_warns_with_no_forecast(
        self,
        client: AsyncClient,
        owner: Account,
        household: dict,
        tin: dict,
    ) -> None:
        """The original rule, untouched. `pace` is null and the client must not read that
        as a deadline."""
        await client.post(
            f"/api/v1/households/{household['id']}/stock/{tin['id']}/adjust",
            headers=owner.headers,
            json={"quantity_grams": 5},
        )

        body = (await client.get("/api/v1/home", headers=owner.headers)).json()

        assert [t["item"]["id"] for t in body["low_stock"]] == [tin["id"]]
        assert body["low_stock"][0]["pace"] is None


class TestHouseholdActivity:
    def url(self, household_id: str) -> str:
        return f"/api/v1/households/{household_id}/stock/activity"

    async def test_the_shelf_timeline_names_the_tea_on_every_row(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict, tea
    ) -> None:
        """A tin's own log can leave the tea implicit — the page heading says it. A
        shelf's cannot, and a timeline of "brewed 5 g" with no subject is unreadable."""
        await client.post(
            f"/api/v1/households/{household['id']}/stock/{tin['id']}/events",
            headers=owner.headers,
            json={"kind": "brew", "grams": 5},
        )

        body = (await client.get(self.url(household["id"]), headers=owner.headers)).json()

        kinds = [e["kind"] for e in body["items"]]
        assert kinds == ["brew", "purchase"]  # newest first
        assert all(e["tea"]["name"] == tea.name for e in body["items"])
        assert all(e["item_id"] == tin["id"] for e in body["items"])
        assert body["items"][0]["actor"]["display_name"] == "Owner"

    async def test_activity_is_not_parsed_as_a_tin_id(
        self, client: AsyncClient, owner: Account, household: dict
    ) -> None:
        """The route sits under `/stock/{item_id}`, whose parameter is a UUID. Declared in
        the wrong order this path is a malformed UUID and answers 422."""
        response = await client.get(self.url(household["id"]), headers=owner.headers)
        assert response.status_code == 200

    async def test_a_non_member_cannot_read_the_timeline(
        self, client: AsyncClient, outsider: Account, household: dict
    ) -> None:
        response = await client.get(self.url(household["id"]), headers=outsider.headers)
        assert response.status_code in (403, 404)


class TestTeaSeries:
    def url(self, slug: str) -> str:
        return f"/api/v1/catalog/teas/{slug}/consumption"

    async def test_every_week_in_the_window_is_returned_including_the_empty_ones(
        self,
        client: AsyncClient,
        db: AsyncSession,
        owner: Account,
        household: dict,
        tin: dict,
        tea,
    ) -> None:
        """Gaps are the data.

        The database only has rows for weeks something happened. Returning just those
        would space three scattered cups evenly across the axis and draw a picture of
        steady drinking — so the range is generated server-side and the query fills it in.
        """
        await backdate_brew(db, tin["id"], owner, grams=8, days=3)
        await backdate_brew(db, tin["id"], owner, grams=6, days=25)

        body = (await client.get(self.url(tea.slug), headers=owner.headers)).json()

        assert len(body["weeks"]) == 12
        assert body["total_grams"] == 14.0
        assert body["total_brews"] == 2
        # Contiguous, oldest first, with real zeroes rather than absent weeks.
        assert sum(1 for w in body["weeks"] if w["grams"] == 0) == 10
        assert [w["week_start"] for w in body["weeks"]] == sorted(
            w["week_start"] for w in body["weeks"]
        )

    async def test_a_tea_the_viewer_has_never_brewed_reports_nothing(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        """Zero total, not twelve empty columns — the client is expected to draw no plot
        at all rather than an empty one."""
        body = (await client.get(self.url(tea.slug), headers=owner.headers)).json()

        assert body["total_grams"] == 0
        assert len(body["weeks"]) == 12

    async def test_another_household_s_brewing_is_not_counted(
        self,
        client: AsyncClient,
        db: AsyncSession,
        owner: Account,
        outsider: Account,
        household: dict,
        tin: dict,
        tea,
    ) -> None:
        """The tea page is public; how much of it *you* drink is not.

        The outsider is looking at the same public tea page and must see their own
        history — which is none — rather than an aggregate over strangers' shelves.
        """
        await backdate_brew(db, tin["id"], owner, grams=40, days=10)

        mine = (await client.get(self.url(tea.slug), headers=owner.headers)).json()
        theirs = (await client.get(self.url(tea.slug), headers=outsider.headers)).json()

        assert mine["total_grams"] == 40.0
        assert theirs["total_grams"] == 0

    async def test_signed_out_readers_get_nothing_at_all(self, client: AsyncClient, tea) -> None:
        assert (await client.get(self.url(tea.slug))).status_code == 401

    async def test_an_unknown_tea_is_a_404_not_an_empty_series(
        self, client: AsyncClient, owner: Account
    ) -> None:
        response = await client.get(self.url("no-such-tea"), headers=owner.headers)
        assert response.status_code == 404
