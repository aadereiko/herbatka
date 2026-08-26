from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.stock import ledger_total
from tests.conftest import Account


def stock_url(household_id: str) -> str:
    return f"/api/v1/households/{household_id}/stock"


class TestAddTin:
    async def test_opening_amount_is_recorded_as_a_purchase_event(
        self, client: AsyncClient, owner: Account, household: dict, tea
    ) -> None:
        """Not written straight into quantity_grams: the ledger has to explain every
        gram in the tin from the moment it exists."""
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={"tea_id": str(tea.id), "quantity_grams": 100},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["quantity_grams"] == 100.0
        assert [e["kind"] for e in body["recent_events"]] == ["purchase"]
        assert body["recent_events"][0]["delta_grams"] == 100.0

    async def test_a_zero_gram_tin_has_no_events(
        self, client: AsyncClient, owner: Account, household: dict, tea
    ) -> None:
        """A zero-delta event would record nothing, and the CHECK constraint forbids it."""
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={"tea_id": str(tea.id), "quantity_grams": 0},
        )

        assert response.json()["recent_events"] == []

    async def test_rejects_an_unknown_tea(
        self, client: AsyncClient, owner: Account, household: dict
    ) -> None:
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "tea_id": "00000000-0000-0000-0000-000000000000",
                "quantity_grams": 10,
            },
        )

        assert response.status_code == 400

    async def test_a_price_requires_a_currency(
        self, client: AsyncClient, owner: Account, household: dict, tea
    ) -> None:
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={"tea_id": str(tea.id), "quantity_grams": 10, "price_paid_minor": 450},
        )

        assert response.status_code >= 400


class TestBrewing:
    async def test_one_tap_brew_subtracts(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        response = await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/events",
            headers=owner.headers,
            json={"kind": "brew", "grams": 5},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["quantity_grams"] == 95.0
        assert body["recent_events"][0]["kind"] == "brew"
        assert body["recent_events"][0]["delta_grams"] == -5.0

    async def test_the_client_sends_a_magnitude_and_the_server_picks_the_sign(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        """A signed delta from the client would make "brew -5" and "brew 5" both
        plausible readings of the same intent."""
        response = await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/events",
            headers=owner.headers,
            json={"kind": "brew", "grams": -5},
        )

        assert response.status_code == 422

    async def test_purchase_adds(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        response = await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/events",
            headers=owner.headers,
            json={"kind": "purchase", "grams": 50},
        )

        assert response.json()["quantity_grams"] == 150.0

    async def test_brewing_more_than_is_left_is_refused(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        """Refused rather than clamped to zero: clamping would leave the ledger
        describing something that did not happen."""
        response = await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/events",
            headers=owner.headers,
            json={"kind": "brew", "grams": 500},
        )

        assert response.status_code == 409
        assert "100" in response.json()["detail"]

    async def test_a_refused_brew_leaves_nothing_behind(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict, db: AsyncSession
    ) -> None:
        await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/events",
            headers=owner.headers,
            json={"kind": "brew", "grams": 500},
        )

        current = await client.get(
            f"{stock_url(household['id'])}/{tin['id']}", headers=owner.headers
        )
        assert current.json()["quantity_grams"] == 100.0
        assert [e["kind"] for e in current.json()["recent_events"]] == ["purchase"]

    async def test_brewing_the_tin_empty_is_allowed(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        response = await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/events",
            headers=owner.headers,
            json={"kind": "brew", "grams": 100},
        )

        assert response.json()["quantity_grams"] == 0.0

    async def test_records_who_brewed_it(
        self, client: AsyncClient, flatmate: Account, shared_household: dict, tin: dict
    ) -> None:
        """ "Who finished the oolong" is the question the ledger exists to answer."""
        response = await client.post(
            f"{stock_url(shared_household['id'])}/{tin['id']}/events",
            headers=flatmate.headers,
            json={"kind": "brew", "grams": 5},
        )

        assert response.json()["recent_events"][0]["actor"]["display_name"] == "Flatmate"


class TestLedgerInvariant:
    async def test_the_cached_total_always_equals_the_sum_of_events(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict, db: AsyncSession
    ) -> None:
        """The single most important property in this milestone: quantity_grams is a
        cache, and a cache that can drift from its source is worse than no cache."""
        events = [
            {"kind": "brew", "grams": 5},
            {"kind": "brew", "grams": 2.5},
            {"kind": "purchase", "grams": 30},
            {"kind": "discard", "grams": 1.25},
            {"kind": "brew", "grams": 8},
        ]
        for event in events:
            response = await client.post(
                f"{stock_url(household['id'])}/{tin['id']}/events",
                headers=owner.headers,
                json=event,
            )
            assert response.status_code == 200, response.text

        final = await client.get(f"{stock_url(household['id'])}/{tin['id']}", headers=owner.headers)
        cached = Decimal(str(final.json()["quantity_grams"]))
        assert cached == await ledger_total(db, tin["id"])
        assert cached == Decimal("113.25")

    async def test_an_adjust_records_the_difference_not_the_target(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict, db: AsyncSession
    ) -> None:
        response = await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/adjust",
            headers=owner.headers,
            json={"quantity_grams": 42, "note": "weighed it"},
        )

        body = response.json()
        assert body["quantity_grams"] == 42.0
        assert body["recent_events"][0]["kind"] == "adjust"
        assert body["recent_events"][0]["delta_grams"] == -58.0
        assert Decimal("42") == await ledger_total(db, tin["id"])

    async def test_adjusting_to_the_same_number_records_nothing(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        response = await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/adjust",
            headers=owner.headers,
            json={"quantity_grams": 100},
        )

        assert [e["kind"] for e in response.json()["recent_events"]] == ["purchase"]

    async def test_fractional_grams_do_not_drift(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict, db: AsyncSession
    ) -> None:
        """Numeric, not float: 0.1 is not representable in binary floating point, and
        thirty brews of 0.1 g would visibly diverge."""
        for _ in range(30):
            await client.post(
                f"{stock_url(household['id'])}/{tin['id']}/events",
                headers=owner.headers,
                json={"kind": "brew", "grams": 0.1},
            )

        assert await ledger_total(db, tin["id"]) == Decimal("97.00")


class TestShelf:
    async def test_lists_the_household_stock(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        response = await client.get(stock_url(household["id"]), headers=owner.headers)

        assert response.json()["total"] == 1
        assert response.json()["items"][0]["tea"]["name"] == "Test Sencha"

    async def test_is_low_uses_each_tins_own_threshold(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        """10 g of matcha is a fortnight; 10 g of herbal is one pot. A global constant
        would be wrong for both."""
        before = await client.get(
            f"{stock_url(household['id'])}/{tin['id']}", headers=owner.headers
        )
        assert before.json()["is_low"] is False

        await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/adjust",
            headers=owner.headers,
            json={"quantity_grams": 15},
        )

        after = await client.get(f"{stock_url(household['id'])}/{tin['id']}", headers=owner.headers)
        assert after.json()["is_low"] is True  # threshold is 20 on this tin

    async def test_low_only_filter(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        assert (
            await client.get(f"{stock_url(household['id'])}?low_only=true", headers=owner.headers)
        ).json()["total"] == 0

        await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/adjust",
            headers=owner.headers,
            json={"quantity_grams": 5},
        )

        assert (
            await client.get(f"{stock_url(household['id'])}?low_only=true", headers=owner.headers)
        ).json()["total"] == 1

    async def test_low_stock_count_shows_on_the_household(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/adjust",
            headers=owner.headers,
            json={"quantity_grams": 1},
        )

        response = await client.get(f"/api/v1/households/{household['id']}", headers=owner.headers)

        assert response.json()["low_stock_count"] == 1
        assert response.json()["stock_item_count"] == 1

    async def test_searches_by_tea_name(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        assert (
            await client.get(f"{stock_url(household['id'])}?q=sencha", headers=owner.headers)
        ).json()["total"] == 1
        assert (
            await client.get(f"{stock_url(household['id'])}?q=rooibos", headers=owner.headers)
        ).json()["total"] == 0

    async def test_quantity_is_not_patchable(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        """Quantity moves only through the ledger. A patchable quantity is exactly how
        the cached total would come loose from its events."""
        response = await client.patch(
            f"{stock_url(household['id'])}/{tin['id']}",
            headers=owner.headers,
            json={"quantity_grams": 9999, "location": "kitchen shelf"},
        )

        assert response.status_code == 200
        assert response.json()["quantity_grams"] == 100.0
        assert response.json()["location"] == "kitchen shelf"


class TestSharedAccess:
    async def test_both_members_see_the_same_tin(
        self,
        client: AsyncClient,
        owner: Account,
        flatmate: Account,
        shared_household: dict,
        tin: dict,
    ) -> None:
        await client.post(
            f"{stock_url(shared_household['id'])}/{tin['id']}/events",
            headers=flatmate.headers,
            json={"kind": "brew", "grams": 10},
        )

        as_owner = await client.get(
            f"{stock_url(shared_household['id'])}/{tin['id']}", headers=owner.headers
        )
        assert as_owner.json()["quantity_grams"] == 90.0

    async def test_an_outsider_cannot_brew_from_it(
        self, client: AsyncClient, outsider: Account, household: dict, tin: dict
    ) -> None:
        response = await client.post(
            f"{stock_url(household['id'])}/{tin['id']}/events",
            headers=outsider.headers,
            json={"kind": "brew", "grams": 5},
        )

        assert response.status_code == 404
