from collections.abc import AsyncGenerator
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.main import app
from app.models.catalog import Ingredient, Tea
from app.models.household import StockItem
from app.models.shop import Shop, ShopListing
from app.services.stock import ledger_total
from tests.conftest import Account


def stock_url(household_id: str) -> str:
    return f"/api/v1/households/{household_id}/stock"


async def _count(db: AsyncSession, model: type, *where: object) -> int:
    return await db.scalar(select(func.count()).select_from(model).where(*where)) or 0  # type: ignore[arg-type]


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


class TestAddTinWithANewTea:
    """Putting a tin on the shelf when the catalog has never heard of the tea.

    The alternative this replaces was a dead end: the picker said "add it under Teas
    first", which meant abandoning a half-filled form, going somewhere else, and starting
    over. `new_tea` carries the whole `TeaCreate` body instead, and the tea and the tin
    are written in one request.
    """

    async def test_the_tea_and_the_tin_arrive_together(
        self, client: AsyncClient, owner: Account, household: dict
    ) -> None:
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "new_tea": {"name": "Yuzu Sencha", "tea_type": "green"},
                "quantity_grams": 50,
            },
        )

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["tea"]["name"] == "Yuzu Sencha"
        assert body["quantity_grams"] == 50.0
        # The ledger still explains the grams, exactly as it does for a catalog tea.
        assert [e["kind"] for e in body["recent_events"]] == ["purchase"]

        # And it is a real catalog entry, not a private label on one household's tin.
        in_catalog = await client.get(f"/api/v1/catalog/teas/{body['tea']['slug']}")
        assert in_catalog.status_code == 200
        assert in_catalog.json()["name"] == "Yuzu Sencha"

    async def test_a_tea_shelved_by_a_user_lands_unapproved(
        self, client: AsyncClient, owner: Account, household: dict
    ) -> None:
        """The permission matrix says a user *submits* a tea; only an admin approves one.

        Which form it was typed into is not one of the inputs to that rule, so this has to
        match `POST /catalog/teas` exactly.
        """
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={"new_tea": {"name": "Shelf Blend", "tea_type": "blend"}, "quantity_grams": 20},
        )

        slug = response.json()["tea"]["slug"]
        detail = await client.get(f"/api/v1/catalog/teas/{slug}")
        assert detail.json()["is_approved"] is False

    async def test_an_admin_shelving_a_tea_gets_an_unapproved_one_too(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        """`POST /admin/teas` is how an admin adds an approved tea. Being an admin who
        happens to be standing at a shelf is not."""
        made = await client.post(
            "/api/v1/households", headers=admin_headers, json={"name": "Boss Flat"}
        )
        response = await client.post(
            stock_url(made.json()["id"]),
            headers=admin_headers,
            json={"new_tea": {"name": "Boss Oolong", "tea_type": "oolong"}, "quantity_grams": 10},
        )

        assert response.status_code == 201, response.text
        slug = response.json()["tea"]["slug"]
        detail = await client.get(f"/api/v1/catalog/teas/{slug}")
        assert detail.json()["is_approved"] is False

    async def test_a_blend_brings_its_new_ingredients_with_it(
        self, client: AsyncClient, owner: Account, household: dict, db: AsyncSession
    ) -> None:
        """The same `new_ingredients` the Teas page sends, because it is the same service
        call — a blend typed at the shelf must not lose half its recipe."""
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "new_tea": {
                    "name": "Yuzu Rooibos",
                    "tea_type": "rooibos",
                    "new_ingredients": [
                        {"name": "Yuzu peel", "category": "peel", "is_primary": True},
                        {"name": "Rooibos leaf", "category": "leaf"},
                    ],
                },
                "quantity_grams": 30,
            },
        )

        assert response.status_code == 201, response.text
        slug = response.json()["tea"]["slug"]
        detail = await client.get(f"/api/v1/catalog/teas/{slug}")
        names = [row["ingredient"]["name"] for row in detail.json()["ingredients"]]
        assert names == ["Yuzu peel", "Rooibos leaf"]
        # Unapproved, like the tea that named them.
        assert await _count(db, Ingredient, Ingredient.name == "Yuzu peel") == 1
        assert detail.json()["ingredients"][0]["ingredient"]["is_approved"] is False

    async def test_an_unknown_ingredient_refuses_the_whole_tin(
        self, client: AsyncClient, owner: Account, household: dict, db: AsyncSession
    ) -> None:
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "new_tea": {
                    "name": "Ghost Blend",
                    "tea_type": "blend",
                    "ingredients": [{"ingredient_id": "00000000-0000-0000-0000-000000000000"}],
                },
                "quantity_grams": 30,
            },
        )

        assert response.status_code == 400
        assert "ingredient" in response.json()["detail"]
        assert await _count(db, Tea, Tea.name == "Ghost Blend") == 0

    async def test_a_tin_needs_exactly_one_of_the_two(
        self, client: AsyncClient, owner: Account, household: dict, tea
    ) -> None:
        """Neither is a tin of nothing; both is two answers to one question."""
        neither = await client.post(
            stock_url(household["id"]), headers=owner.headers, json={"quantity_grams": 10}
        )
        both = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "tea_id": str(tea.id),
                "new_tea": {"name": "Both Ways", "tea_type": "green"},
                "quantity_grams": 10,
            },
        )

        assert neither.status_code == 422
        assert both.status_code == 422

    async def test_a_refused_tin_takes_its_brand_new_tea_with_it(
        self, client: AsyncClient, owner: Account, household: dict, db: AsyncSession
    ) -> None:
        """One request, one transaction.

        `TeaCreate` already promises a blend is never saved with half its recipe; a tea
        left in the catalog with no tin to explain it is the same failure one level up.
        The tin is refused *after* the tea has been inserted — an unknown `shop_id` is
        resolved once the tea exists, because a proposed shop needs it for the listing —
        so this is the window where an orphan could survive, and nothing is committed in
        it.

        The `client` fixture's `get_db` override deliberately has only the commit half, so
        this test brings the rollback that production's `get_db` does. Without it the
        assertion below would pass on flushed-but-uncommitted rows still sitting in the
        session, and prove nothing.
        """

        async def rolling_back_db() -> AsyncGenerator[AsyncSession]:
            try:
                yield db
                await db.commit()
            except Exception:
                await db.rollback()
                raise

        app.dependency_overrides[get_db] = rolling_back_db

        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "new_tea": {"name": "Orphan Oolong", "tea_type": "oolong"},
                "shop_id": "00000000-0000-0000-0000-000000000000",
                "quantity_grams": 40,
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "No such shop"
        assert await _count(db, Tea, Tea.name == "Orphan Oolong") == 0
        assert await _count(db, StockItem, StockItem.household_id == household["id"]) == 0


class TestAddTinWithANewShop:
    """The softer dead end beside the tea: "no shop matches that".

    Separable from the tea half on purpose — the two fields are independent, and a tin of
    a catalog tea from a shop nobody has listed is the commoner case of the pair.
    """

    async def test_the_shop_is_created_listed_and_landed_on_the_tin(
        self, client: AsyncClient, owner: Account, household: dict, tea, db: AsyncSession
    ) -> None:
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "tea_id": str(tea.id),
                "new_shop": {"name": "Czajnik na Rogu", "city": "Gdańsk"},
                "quantity_grams": 60,
            },
        )

        assert response.status_code == 201, response.text
        assert response.json()["shop"]["name"] == "Czajnik na Rogu"

        # Not just the shop: the listing that says it sells this tea is the half that
        # answers "where do we get this again?" when the tin runs out.
        shop_id = response.json()["shop"]["id"]
        assert await _count(db, Shop, Shop.name == "Czajnik na Rogu") == 1
        assert (
            await _count(
                db, ShopListing, ShopListing.shop_id == shop_id, ShopListing.tea_id == tea.id
            )
            == 1
        )

    async def test_a_proposed_shop_lands_unapproved(
        self, client: AsyncClient, owner: Account, household: dict, tea, db: AsyncSession
    ) -> None:
        await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "tea_id": str(tea.id),
                "new_shop": {"name": "Unvouched", "city": "Kraków"},
                "quantity_grams": 60,
            },
        )

        shop = await db.scalar(select(Shop).where(Shop.name == "Unvouched"))
        assert shop is not None
        assert shop.is_approved is False

    async def test_a_new_tea_and_a_new_shop_in_one_request(
        self, client: AsyncClient, owner: Account, household: dict, db: AsyncSession
    ) -> None:
        """The whole dead end, both halves, one POST."""
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "new_tea": {"name": "Corner Shop Sencha", "tea_type": "green"},
                "new_shop": {"name": "Corner Shop", "website": "https://corner.example"},
                "quantity_grams": 100,
            },
        )

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["tea"]["name"] == "Corner Shop Sencha"
        assert body["shop"]["name"] == "Corner Shop"
        # The listing points at the tea this same request created.
        tea_row = await db.scalar(select(Tea).where(Tea.name == "Corner Shop Sencha"))
        assert tea_row is not None
        assert await _count(db, ShopListing, ShopListing.tea_id == tea_row.id) == 1

    async def test_a_shop_needs_a_city_or_a_website(
        self, client: AsyncClient, owner: Account, household: dict, tea
    ) -> None:
        """Mirrors `NewShopIn` and the CHECK behind it: a shop with neither cannot be
        found by anybody."""
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "tea_id": str(tea.id),
                "new_shop": {"name": "Nowhere"},
                "quantity_grams": 60,
            },
        )

        assert response.status_code == 422

    async def test_the_shop_is_proposed_on_the_tin_not_on_the_tea(
        self, client: AsyncClient, owner: Account, household: dict
    ) -> None:
        """`TeaCreate.new_shop` is the Teas page's field. Honouring both would create the
        same shop twice, under two slugs, from one form."""
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "new_tea": {
                    "name": "Double Shop",
                    "tea_type": "green",
                    "new_shop": {"name": "Twice Over", "city": "Kraków"},
                },
                "quantity_grams": 60,
            },
        )

        assert response.status_code == 422

    async def test_a_shop_and_a_shop_id_are_two_answers_to_one_question(
        self, client: AsyncClient, owner: Account, household: dict, tea, shop: dict
    ) -> None:
        response = await client.post(
            stock_url(household["id"]),
            headers=owner.headers,
            json={
                "tea_id": str(tea.id),
                "shop_id": shop["id"],
                "new_shop": {"name": "Also This", "city": "Kraków"},
                "quantity_grams": 60,
            },
        )

        assert response.status_code == 422


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
