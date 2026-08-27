from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.preference import FavouriteTea, IngredientRating
from tests.conftest import Account

CATALOG = "/api/v1/catalog"
SHOPS = "/api/v1/shops"


class TestFavouriteTeas:
    async def test_starring_shows_on_the_tea(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        before = (await client.get(f"{CATALOG}/teas/{tea.slug}", headers=owner.headers)).json()
        assert before["is_favourite"] is False

        assert (
            await client.put(f"{CATALOG}/teas/{tea.slug}/favourite", headers=owner.headers)
        ).status_code == 204

        after = (await client.get(f"{CATALOG}/teas/{tea.slug}", headers=owner.headers)).json()
        assert after["is_favourite"] is True

    async def test_starring_twice_is_not_an_error(
        self, client: AsyncClient, owner: Account, tea, db: AsyncSession
    ) -> None:
        """A double tap on a phone should not be a 409."""
        await client.put(f"{CATALOG}/teas/{tea.slug}/favourite", headers=owner.headers)
        second = await client.put(f"{CATALOG}/teas/{tea.slug}/favourite", headers=owner.headers)

        assert second.status_code == 204
        assert await db.scalar(select(func.count()).select_from(FavouriteTea)) == 1

    async def test_unstarring_something_you_never_starred_is_fine(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        response = await client.delete(
            f"{CATALOG}/teas/{tea.slug}/favourite", headers=owner.headers
        )

        assert response.status_code == 204

    async def test_a_star_is_yours_alone(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea
    ) -> None:
        await client.put(f"{CATALOG}/teas/{tea.slug}/favourite", headers=owner.headers)

        theirs = (await client.get(f"{CATALOG}/teas/{tea.slug}", headers=flatmate.headers)).json()

        assert theirs["is_favourite"] is False

    async def test_signed_out_it_is_always_false(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        await client.put(f"{CATALOG}/teas/{tea.slug}/favourite", headers=owner.headers)

        assert (await client.get(f"{CATALOG}/teas/{tea.slug}")).json()["is_favourite"] is False

    async def test_your_favourites_list(
        self, client: AsyncClient, owner: Account, tea, catalog_fixtures
    ) -> None:
        await client.put(f"{CATALOG}/teas/{tea.slug}/favourite", headers=owner.headers)

        body = (await client.get("/api/v1/favourites/teas", headers=owner.headers)).json()

        assert [t["name"] for t in body["items"]] == ["Test Sencha"]

    async def test_a_star_is_not_a_rating(self, client: AsyncClient, owner: Account, tea) -> None:
        """You can love a tea you have never got round to scoring."""
        await client.put(f"{CATALOG}/teas/{tea.slug}/favourite", headers=owner.headers)

        body = (await client.get(f"{CATALOG}/teas/{tea.slug}", headers=owner.headers)).json()

        assert body["is_favourite"] is True
        assert body["my_score"] is None

    async def test_requires_an_account(self, client: AsyncClient, tea) -> None:
        assert (await client.put(f"{CATALOG}/teas/{tea.slug}/favourite")).status_code == 401
        assert (await client.get("/api/v1/favourites/teas")).status_code == 401


class TestFavouriteShops:
    async def test_starring_and_listing(
        self, client: AsyncClient, owner: Account, shop: dict
    ) -> None:
        await client.put(f"{SHOPS}/{shop['slug']}/favourite", headers=owner.headers)

        detail = (await client.get(f"{SHOPS}/{shop['slug']}", headers=owner.headers)).json()
        listed = (await client.get("/api/v1/favourites/shops", headers=owner.headers)).json()

        assert detail["is_favourite"] is True
        assert [s["name"] for s in listed["items"]] == ["Czajnik"]


class TestShopReviews:
    async def test_rating_a_shop(self, client: AsyncClient, owner: Account, shop: dict) -> None:
        response = await client.put(
            f"{SHOPS}/{shop['slug']}/review",
            headers=owner.headers,
            json={"score": 9, "body": "Patient staff, good samples."},
        )

        assert response.status_code == 200
        assert response.json()["score"] == 9
        assert response.json()["author"]["display_name"] == "Owner"

    async def test_one_rating_per_person_per_shop(
        self, client: AsyncClient, owner: Account, shop: dict
    ) -> None:
        first = await client.put(
            f"{SHOPS}/{shop['slug']}/review", headers=owner.headers, json={"score": 5}
        )
        second = await client.put(
            f"{SHOPS}/{shop['slug']}/review", headers=owner.headers, json={"score": 8}
        )

        assert first.json()["id"] == second.json()["id"]
        assert (await client.get(f"{SHOPS}/{shop['slug']}/reviews")).json()["total"] == 1

    async def test_the_average_and_your_own_score_are_separate(
        self, client: AsyncClient, owner: Account, flatmate: Account, shop: dict
    ) -> None:
        await client.put(
            f"{SHOPS}/{shop['slug']}/review", headers=owner.headers, json={"score": 10}
        )
        await client.put(
            f"{SHOPS}/{shop['slug']}/review", headers=flatmate.headers, json={"score": 4}
        )

        body = (await client.get(f"{SHOPS}/{shop['slug']}", headers=owner.headers)).json()

        assert body["average_score"] == 7.0
        assert body["my_score"] == 10
        assert body["my_review"]["score"] == 10

    async def test_an_unrated_shop_reports_null_not_zero(
        self, client: AsyncClient, shop: dict
    ) -> None:
        body = (await client.get(f"{SHOPS}/{shop['slug']}")).json()

        assert body["average_score"] is None
        assert body["review_count"] == 0

    async def test_the_average_reaches_the_shop_list(
        self, client: AsyncClient, owner: Account, shop: dict
    ) -> None:
        await client.put(f"{SHOPS}/{shop['slug']}/review", headers=owner.headers, json={"score": 8})

        item = (await client.get(SHOPS)).json()["items"][0]

        assert item["average_score"] == 8.0
        assert item["review_count"] == 1

    async def test_a_rating_does_not_duplicate_the_shop_in_the_list(
        self, client: AsyncClient, owner: Account, flatmate: Account, shop: dict
    ) -> None:
        await client.put(f"{SHOPS}/{shop['slug']}/review", headers=owner.headers, json={"score": 7})
        await client.put(
            f"{SHOPS}/{shop['slug']}/review", headers=flatmate.headers, json={"score": 8}
        )

        body = (await client.get(SHOPS)).json()

        assert body["total"] == 1
        assert len(body["items"]) == 1

    async def test_reviews_are_public(
        self, client: AsyncClient, owner: Account, shop: dict
    ) -> None:
        await client.put(f"{SHOPS}/{shop['slug']}/review", headers=owner.headers, json={"score": 7})

        assert (await client.get(f"{SHOPS}/{shop['slug']}/reviews")).status_code == 200

    async def test_deleting_yours(self, client: AsyncClient, owner: Account, shop: dict) -> None:
        await client.put(f"{SHOPS}/{shop['slug']}/review", headers=owner.headers, json={"score": 7})

        assert (
            await client.delete(f"{SHOPS}/{shop['slug']}/review", headers=owner.headers)
        ).status_code == 204
        assert (await client.get(f"{SHOPS}/{shop['slug']}")).json()["average_score"] is None

    async def test_deleting_one_you_never_wrote_is_404(
        self, client: AsyncClient, owner: Account, shop: dict
    ) -> None:
        assert (
            await client.delete(f"{SHOPS}/{shop['slug']}/review", headers=owner.headers)
        ).status_code == 404

    async def test_rejects_a_score_out_of_range(
        self, client: AsyncClient, owner: Account, shop: dict
    ) -> None:
        for score in (0, 11):
            response = await client.put(
                f"{SHOPS}/{shop['slug']}/review", headers=owner.headers, json={"score": score}
            )
            assert response.status_code == 422, score


class TestBrewingNotes:
    async def test_your_figures_sit_beside_the_catalog_s(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        """Yours do not overwrite the packet's — the detail carries both, and the UI
        decides which to lead with."""
        await client.put(
            f"{CATALOG}/teas/{tea.slug}/brewing",
            headers=owner.headers,
            json={"brew_temp_c": 80, "brew_seconds": 90, "note": "Second steep is the good one."},
        )

        body = (await client.get(f"{CATALOG}/teas/{tea.slug}", headers=owner.headers)).json()

        assert body["my_brewing"]["brew_temp_c"] == 80
        assert body["my_brewing"]["note"] == "Second steep is the good one."
        assert body["brew_temp_c"] is None  # this fixture has no catalog figures

    async def test_writing_twice_replaces(self, client: AsyncClient, owner: Account, tea) -> None:
        await client.put(
            f"{CATALOG}/teas/{tea.slug}/brewing", headers=owner.headers, json={"brew_temp_c": 80}
        )
        await client.put(
            f"{CATALOG}/teas/{tea.slug}/brewing", headers=owner.headers, json={"brew_temp_c": 85}
        )

        body = (await client.get(f"{CATALOG}/teas/{tea.slug}", headers=owner.headers)).json()

        assert body["my_brewing"]["brew_temp_c"] == 85

    async def test_only_one_field_is_enough(self, client: AsyncClient, owner: Account, tea) -> None:
        """Somebody who only ever changes the temperature should not have to restate
        the dose to say so."""
        response = await client.put(
            f"{CATALOG}/teas/{tea.slug}/brewing", headers=owner.headers, json={"brew_temp_c": 80}
        )

        assert response.status_code == 200
        assert response.json()["grams_per_100ml"] is None

    async def test_an_entirely_blank_note_is_refused(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        response = await client.put(
            f"{CATALOG}/teas/{tea.slug}/brewing", headers=owner.headers, json={}
        )

        assert response.status_code == 422

    async def test_removing_yours_falls_back(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        await client.put(
            f"{CATALOG}/teas/{tea.slug}/brewing", headers=owner.headers, json={"brew_temp_c": 80}
        )

        assert (
            await client.delete(f"{CATALOG}/teas/{tea.slug}/brewing", headers=owner.headers)
        ).status_code == 204
        body = (await client.get(f"{CATALOG}/teas/{tea.slug}", headers=owner.headers)).json()
        assert body["my_brewing"] is None

    async def test_yours_is_yours_alone(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea
    ) -> None:
        await client.put(
            f"{CATALOG}/teas/{tea.slug}/brewing", headers=owner.headers, json={"brew_temp_c": 80}
        )

        theirs = (await client.get(f"{CATALOG}/teas/{tea.slug}", headers=flatmate.headers)).json()

        assert theirs["my_brewing"] is None

    async def test_rejects_an_impossible_temperature(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        response = await client.put(
            f"{CATALOG}/teas/{tea.slug}/brewing", headers=owner.headers, json={"brew_temp_c": 250}
        )

        assert response.status_code == 422

    async def test_requires_an_account(self, client: AsyncClient, tea) -> None:
        assert (
            await client.put(f"{CATALOG}/teas/{tea.slug}/brewing", json={"brew_temp_c": 80})
        ).status_code == 401


class TestTinFromAShop:
    async def test_a_hand_added_tin_can_name_its_shop(
        self, client: AsyncClient, owner: Account, household: dict, tea, shop: dict
    ) -> None:
        """Not only the buy flow: a tin bought in a shop is a tin bought in a shop
        however it got onto the shelf."""
        response = await client.post(
            f"/api/v1/households/{household['id']}/stock",
            headers=owner.headers,
            json={"tea_id": str(tea.id), "quantity_grams": 50, "shop_id": shop["id"]},
        )

        assert response.status_code == 201
        assert response.json()["shop"]["name"] == "Czajnik"

    async def test_the_shop_can_be_set_afterwards(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict, shop: dict
    ) -> None:
        response = await client.patch(
            f"/api/v1/households/{household['id']}/stock/{tin['id']}",
            headers=owner.headers,
            json={"shop_id": shop["id"]},
        )

        assert response.json()["shop"]["name"] == "Czajnik"

    async def test_a_tin_with_no_shop_is_fine(self, client: AsyncClient, tin: dict) -> None:
        assert tin["shop"] is None


class TestBlankBrewingLeavesThingsAlone:
    async def test_an_empty_payload_does_not_quietly_delete_what_is_there(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        """A refused request must not change anything. Removing a note is DELETE's job."""
        await client.put(
            f"{CATALOG}/teas/{tea.slug}/brewing", headers=owner.headers, json={"brew_temp_c": 80}
        )

        refused = await client.put(
            f"{CATALOG}/teas/{tea.slug}/brewing", headers=owner.headers, json={}
        )

        assert refused.status_code == 422
        body = (await client.get(f"{CATALOG}/teas/{tea.slug}", headers=owner.headers)).json()
        assert body["my_brewing"]["brew_temp_c"] == 80


class TestIngredientRatings:
    """How much you like an ingredient, as opposed to how good a tea is.

    The whole point of the feature is the join: a blend lists five things, and one of them
    being the clove you rated 2 explains a tea you keep not reaching for. So most of these
    are about the number arriving on the *tea* page, not just on the ingredient list.
    """

    async def test_rating_and_reading_it_back(
        self, client: AsyncClient, owner: Account, catalog_fixtures: dict
    ) -> None:
        response = await client.put(
            f"{CATALOG}/ingredients/mint/rating", headers=owner.headers, json={"score": 9}
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["my_score"] == 9
        assert body["average_score"] == 9.0
        assert body["rating_count"] == 1

    async def test_rating_again_replaces_rather_than_duplicating(
        self, client: AsyncClient, owner: Account, catalog_fixtures: dict, db: AsyncSession
    ) -> None:
        """Changing your mind about clove is the normal case, not a 409."""
        await client.put(
            f"{CATALOG}/ingredients/mint/rating", headers=owner.headers, json={"score": 9}
        )
        second = await client.put(
            f"{CATALOG}/ingredients/mint/rating", headers=owner.headers, json={"score": 4}
        )
        assert second.status_code == 200
        assert second.json()["my_score"] == 4
        assert second.json()["rating_count"] == 1

        rows = await db.scalar(select(func.count()).select_from(IngredientRating))
        assert rows == 1

    async def test_the_average_and_your_own_score_are_separate(
        self,
        client: AsyncClient,
        owner: Account,
        flatmate: Account,
        catalog_fixtures: dict,
    ) -> None:
        await client.put(
            f"{CATALOG}/ingredients/mint/rating", headers=owner.headers, json={"score": 10}
        )
        await client.put(
            f"{CATALOG}/ingredients/mint/rating", headers=flatmate.headers, json={"score": 4}
        )

        mine = await client.get(f"{CATALOG}/ingredients?q=Mint", headers=owner.headers)
        row = mine.json()["items"][0]
        assert row["my_score"] == 10
        assert row["average_score"] == 7.0
        assert row["rating_count"] == 2

    async def test_an_unrated_ingredient_reports_null_not_zero(
        self, client: AsyncClient, owner: Account, catalog_fixtures: dict
    ) -> None:
        """0.0 reads as "everybody hates it" rather than "nobody has said"."""
        row = (await client.get(f"{CATALOG}/ingredients?q=Mint", headers=owner.headers)).json()[
            "items"
        ][0]
        assert row["average_score"] is None
        assert row["my_score"] is None
        assert row["rating_count"] == 0

    async def test_signed_out_sees_the_average_but_no_my_score(
        self, client: AsyncClient, owner: Account, catalog_fixtures: dict
    ) -> None:
        await client.put(
            f"{CATALOG}/ingredients/mint/rating", headers=owner.headers, json={"score": 8}
        )
        row = (await client.get(f"{CATALOG}/ingredients?q=Mint")).json()["items"][0]
        assert row["average_score"] == 8.0
        assert row["my_score"] is None

    async def test_a_rating_is_yours_alone(
        self, client: AsyncClient, owner: Account, flatmate: Account, catalog_fixtures: dict
    ) -> None:
        await client.put(
            f"{CATALOG}/ingredients/mint/rating", headers=owner.headers, json={"score": 2}
        )
        theirs = (
            await client.get(f"{CATALOG}/ingredients?q=Mint", headers=flatmate.headers)
        ).json()["items"][0]
        assert theirs["my_score"] is None

    async def test_your_score_reaches_the_tea_that_contains_it(
        self, client: AsyncClient, owner: Account, catalog_fixtures: dict
    ) -> None:
        """The reason the feature exists. Mint is 30% of Mint Green; rating mint 3 should
        be visible while looking at the tea, without a second request."""
        await client.put(
            f"{CATALOG}/ingredients/mint/rating", headers=owner.headers, json={"score": 3}
        )
        tea = (await client.get(f"{CATALOG}/teas/mint-green", headers=owner.headers)).json()
        scores = {
            row["ingredient"]["slug"]: row["ingredient"]["my_score"] for row in tea["ingredients"]
        }
        assert scores == {"mint": 3, "green-leaf": None}

    async def test_the_tea_page_carries_ratings_when_signed_out(
        self, client: AsyncClient, owner: Account, catalog_fixtures: dict
    ) -> None:
        """Every ingredient on every TeaDetail path has to be attached — the schema has no
        defaults, so a forgotten call is a 500 here rather than a silent zero."""
        await client.put(
            f"{CATALOG}/ingredients/mint/rating", headers=owner.headers, json={"score": 6}
        )
        response = await client.get(f"{CATALOG}/teas/mint-green")
        assert response.status_code == 200, response.text
        rows = {r["ingredient"]["slug"]: r["ingredient"] for r in response.json()["ingredients"]}
        assert rows["mint"]["average_score"] == 6.0
        assert rows["mint"]["my_score"] is None
        assert rows["green-leaf"]["rating_count"] == 0

    async def test_a_submitted_tea_comes_back_with_its_ingredients_rated(
        self, client: AsyncClient, owner: Account, catalog_fixtures: dict
    ) -> None:
        """POST /catalog/teas builds a TeaDetail too, and it was the easiest one to forget."""
        await client.put(
            f"{CATALOG}/ingredients/mint/rating", headers=owner.headers, json={"score": 7}
        )
        response = await client.post(
            f"{CATALOG}/teas",
            headers=owner.headers,
            json={
                "name": "Proposed Mint",
                "tea_type": "herbal",
                "ingredients": [{"ingredient_id": str(catalog_fixtures["mint"].id)}],
            },
        )
        assert response.status_code == 201, response.text
        assert response.json()["ingredients"][0]["ingredient"]["my_score"] == 7

    async def test_removing_your_rating(
        self, client: AsyncClient, owner: Account, catalog_fixtures: dict
    ) -> None:
        """Unrated is a real state: "no opinion on hibiscus" is not "I dislike hibiscus"."""
        await client.put(
            f"{CATALOG}/ingredients/mint/rating", headers=owner.headers, json={"score": 5}
        )
        assert (
            await client.delete(f"{CATALOG}/ingredients/mint/rating", headers=owner.headers)
        ).status_code == 204

        row = (await client.get(f"{CATALOG}/ingredients?q=Mint", headers=owner.headers)).json()[
            "items"
        ][0]
        assert row["my_score"] is None
        assert row["rating_count"] == 0

    async def test_removing_one_you_never_made_is_404(
        self, client: AsyncClient, owner: Account, catalog_fixtures: dict
    ) -> None:
        response = await client.delete(f"{CATALOG}/ingredients/mint/rating", headers=owner.headers)
        assert response.status_code == 404
        assert response.json()["detail"] == "No rating to remove"

    async def test_a_typo_in_the_slug_says_so_rather_than_blaming_the_rating(
        self, client: AsyncClient, owner: Account, catalog_fixtures: dict
    ) -> None:
        """Two different mistakes, two different messages — one 404 for both sends you
        looking in the wrong place."""
        response = await client.delete(f"{CATALOG}/ingredients/mnit/rating", headers=owner.headers)
        assert response.status_code == 404
        assert response.json()["detail"] == "Ingredient not found"

    async def test_rejects_a_score_out_of_range(
        self, client: AsyncClient, owner: Account, catalog_fixtures: dict
    ) -> None:
        for score in (0, 11, -3):
            response = await client.put(
                f"{CATALOG}/ingredients/mint/rating", headers=owner.headers, json={"score": score}
            )
            assert response.status_code == 422, score

    async def test_requires_an_account(self, client: AsyncClient, catalog_fixtures: dict) -> None:
        assert (
            await client.put(f"{CATALOG}/ingredients/mint/rating", json={"score": 5})
        ).status_code == 401
