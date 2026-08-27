from httpx import AsyncClient

from tests.conftest import Account

HOME = "/api/v1/home"


class TestSignedIn:
    async def test_a_brand_new_account_gets_zeroes_not_an_error(
        self, client: AsyncClient, owner: Account
    ) -> None:
        """The emptiest possible state is the one every new user sees first."""
        body = (await client.get(HOME, headers=owner.headers)).json()

        assert body["display_name"] == "Owner"
        assert body["household_count"] == 0
        assert body["tin_count"] == 0
        assert body["low_stock"] == []
        assert body["recent_activity"] == []
        assert body["unrated"] == []

    async def test_counts_what_you_have(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        body = (await client.get(HOME, headers=owner.headers)).json()

        assert body["household_count"] == 1
        assert body["tin_count"] == 1

    async def test_a_low_tin_says_which_shelf_it_is_on(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        """Across every household you share, so the page is useful with more than one."""
        await client.post(
            f"/api/v1/households/{household['id']}/stock/{tin['id']}/adjust",
            headers=owner.headers,
            json={"quantity_grams": 5},
        )

        body = (await client.get(HOME, headers=owner.headers)).json()

        assert len(body["low_stock"]) == 1
        assert body["low_stock"][0]["item"]["tea"]["name"] == "Test Sencha"
        assert body["low_stock"][0]["household"]["name"] == "Flat 3B"

    async def test_a_full_tin_is_not_low(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        assert (await client.get(HOME, headers=owner.headers)).json()["low_stock"] == []

    async def test_suggests_teas_you_own_but_have_not_rated(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        body = (await client.get(HOME, headers=owner.headers)).json()

        assert [t["name"] for t in body["unrated"]] == ["Test Sencha"]

    async def test_a_tea_you_have_rated_drops_off_that_list(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict, tea
    ) -> None:
        await client.put(
            f"/api/v1/catalog/teas/{tea.slug}/review", headers=owner.headers, json={"score": 8}
        )

        body = (await client.get(HOME, headers=owner.headers)).json()

        assert body["unrated"] == []
        assert body["review_count"] == 1

    async def test_counts_friends_and_the_requests_waiting_on_you(
        self, client: AsyncClient, owner: Account, flatmate: Account, outsider: Account
    ) -> None:
        """Only incoming ones: a request you sent is not waiting on you."""
        await client.post(
            "/api/v1/friends/requests", headers=flatmate.headers, json={"user_id": owner.id}
        )
        await client.post(
            "/api/v1/friends/requests", headers=owner.headers, json={"user_id": outsider.id}
        )

        body = (await client.get(HOME, headers=owner.headers)).json()

        assert body["pending_requests"] == 1
        assert body["friend_count"] == 0

    async def test_shows_the_start_of_the_feed(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        body = (await client.get(HOME, headers=owner.headers)).json()

        assert [i["kind"] for i in body["recent_activity"]] == ["stocked"]

    async def test_requires_an_account(self, client: AsyncClient) -> None:
        assert (await client.get(HOME)).status_code == 401


class TestSignedOut:
    async def test_public_summary_needs_no_account(
        self, client: AsyncClient, catalog_fixtures
    ) -> None:
        response = await client.get(f"{HOME}/public")

        assert response.status_code == 200
        body = response.json()
        assert body["tea_count"] == 1  # only the approved one
        assert body["ingredient_count"] == 2

    async def test_featured_teas_are_approved_only(
        self, client: AsyncClient, catalog_fixtures
    ) -> None:
        body = (await client.get(f"{HOME}/public")).json()

        assert [t["name"] for t in body["featured"]] == ["Mint Green"]

    async def test_best_rated_first(
        self,
        client: AsyncClient,
        owner: Account,
        admin_headers: dict[str, str],
        tea,
        catalog_fixtures,
    ) -> None:
        """A shop window of things nobody has an opinion about is a poor shop window."""
        await client.put(
            f"/api/v1/catalog/teas/{tea.slug}/review", headers=owner.headers, json={"score": 10}
        )

        featured = (await client.get(f"{HOME}/public")).json()["featured"]

        assert featured[0]["name"] == "Test Sencha"
        assert featured[0]["average_score"] == 10.0

    async def test_says_nothing_about_anybody(self, client: AsyncClient, owner: Account) -> None:
        body = (await client.get(f"{HOME}/public")).json()

        assert set(body) == {"tea_count", "shop_count", "ingredient_count", "featured"}
