from typing import Any

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import Ingredient, Tea

CATALOG = "/api/v1/catalog"


class TestPublicTeaList:
    async def test_lists_suggested_teas_too_marked_rather_than_hidden(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        """The catalog used to answer with approved teas only.

        Hiding a suggestion is worse in both directions: the person who made it submits a
        form and then cannot find what they added, and everybody else browses a catalog
        that quietly knows about teas it will not admit to. Every row carries
        `is_approved` and the client marks the ones nobody has vouched for.
        """
        response = await client.get(f"{CATALOG}/teas")

        assert response.status_code == 200
        body = response.json()
        assert sorted(t["name"] for t in body["items"]) == ["Mint Green", "Secret Blend"]
        assert {t["name"]: t["is_approved"] for t in body["items"]} == {
            "Mint Green": True,
            "Secret Blend": False,
        }

    async def test_needs_no_account(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        """Browsing the catalog signed out is a product decision, not an oversight."""
        response = await client.get(f"{CATALOG}/teas")

        assert response.status_code == 200

    async def test_summary_carries_brand_and_primary_ingredients(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        item = (await client.get(f"{CATALOG}/teas")).json()["items"][0]

        assert item["brand"]["slug"] == "test-brand"
        assert item["primary_ingredients"] == ["Green leaf", "Mint"]

    async def test_filters_by_type(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        assert (await client.get(f"{CATALOG}/teas?tea_type=green")).json()["total"] == 1
        assert (await client.get(f"{CATALOG}/teas?tea_type=oolong")).json()["total"] == 0

    async def test_rejects_an_unknown_type(self, client: AsyncClient) -> None:
        assert (await client.get(f"{CATALOG}/teas?tea_type=coffee")).status_code == 422

    async def test_filters_by_ingredient(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        assert (await client.get(f"{CATALOG}/teas?ingredient=mint")).json()["total"] == 1
        assert (await client.get(f"{CATALOG}/teas?ingredient=rooibos")).json()["total"] == 0

    async def test_ingredient_filter_does_not_duplicate_teas(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        """A join would return the tea once per matching ingredient; EXISTS does not."""
        body = (await client.get(f"{CATALOG}/teas?ingredient=mint")).json()

        assert body["total"] == 1
        assert len(body["items"]) == 1

    async def test_searches_by_name(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        assert (await client.get(f"{CATALOG}/teas?q=mint")).json()["total"] == 1
        assert (await client.get(f"{CATALOG}/teas?q=MINT")).json()["total"] == 1
        assert (await client.get(f"{CATALOG}/teas?q=zzz")).json()["total"] == 0

    async def test_caps_the_page_size(self, client: AsyncClient) -> None:
        """An unbounded size is a denial-of-service switch, so the cap is a 422."""
        assert (await client.get(f"{CATALOG}/teas?size=100000")).status_code == 422

    async def test_reports_pages_for_an_empty_result(self, client: AsyncClient) -> None:
        body = (await client.get(f"{CATALOG}/teas?q=nothing-matches")).json()

        assert body["total"] == 0
        assert body["pages"] == 1  # not 0 — there is still one (empty) page to render


class TestPublicTeaDetail:
    async def test_returns_the_full_recipe_in_order(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        body = (await client.get(f"{CATALOG}/teas/mint-green")).json()

        assert [i["ingredient"]["name"] for i in body["ingredients"]] == ["Green leaf", "Mint"]
        assert body["ingredients"][0]["percentage"] == 70.0

    async def test_an_unapproved_tea_is_readable_and_says_so(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        """It used to 404. A suggestion you cannot open is one nobody can check."""
        response = await client.get(f"{CATALOG}/teas/secret-blend")

        assert response.status_code == 200
        assert response.json()["is_approved"] is False

    async def test_unknown_slug_is_404(self, client: AsyncClient) -> None:
        assert (await client.get(f"{CATALOG}/teas/nope")).status_code == 404


class TestSubmitTea:
    async def test_requires_an_account(self, client: AsyncClient) -> None:
        response = await client.post(f"{CATALOG}/teas", json={"name": "X", "tea_type": "green"})

        assert response.status_code == 401

    async def test_arrives_unapproved_and_invisible(
        self, client: AsyncClient, user_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        response = await client.post(
            f"{CATALOG}/teas",
            headers=user_headers,
            json={"name": "My Blend", "tea_type": "blend"},
        )

        assert response.status_code == 201
        assert response.json()["is_approved"] is False

        # And it is in the catalog immediately, carrying the mark. The old behaviour was
        # a 0-result search for the tea the reader had just successfully created.
        found = (await client.get(f"{CATALOG}/teas?q=My Blend")).json()
        assert found["total"] == 1
        assert found["items"][0]["is_approved"] is False

    async def test_records_the_submitter(
        self, client: AsyncClient, user_headers: dict[str, str], db: AsyncSession
    ) -> None:
        await client.post(
            f"{CATALOG}/teas", headers=user_headers, json={"name": "Mine", "tea_type": "white"}
        )

        tea = await db.scalar(select(Tea).where(Tea.slug == "mine"))
        assert tea is not None
        assert tea.created_by_id is not None

    async def test_rejects_an_unknown_ingredient(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            f"{CATALOG}/teas",
            headers=user_headers,
            json={
                "name": "Ghost",
                "tea_type": "green",
                "ingredients": [{"ingredient_id": "00000000-0000-0000-0000-000000000000"}],
            },
        )

        assert response.status_code == 400

    async def test_rejects_an_impossible_percentage(
        self, client: AsyncClient, user_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        response = await client.post(
            f"{CATALOG}/teas",
            headers=user_headers,
            json={
                "name": "Too Much",
                "tea_type": "green",
                "ingredients": [
                    {"ingredient_id": str(catalog_fixtures["mint"].id), "percentage": 150}
                ],
            },
        )

        assert response.status_code == 422

    async def test_duplicate_names_get_distinct_slugs(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        """Two vendors really do both sell a 'Breakfast Blend'."""
        first = await client.post(
            f"{CATALOG}/teas",
            headers=user_headers,
            json={"name": "Breakfast Blend", "tea_type": "black"},
        )
        second = await client.post(
            f"{CATALOG}/teas",
            headers=user_headers,
            json={"name": "Breakfast Blend", "tea_type": "black"},
        )

        assert first.json()["slug"] == "breakfast-blend"
        assert second.json()["slug"] == "breakfast-blend-2"


class TestIngredientsAndBrands:
    async def test_lists_ingredients(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        body = (await client.get(f"{CATALOG}/ingredients")).json()

        assert [i["name"] for i in body["items"]] == ["Green leaf", "Mint"]

    async def test_filters_ingredients_by_category(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        assert (await client.get(f"{CATALOG}/ingredients?category=herb")).json()["total"] == 1

    async def test_a_read_carries_the_picture_and_the_description(
        self, client: AsyncClient, db: AsyncSession, catalog_fixtures: dict[str, Any]
    ) -> None:
        """Both read shapes, because there are two of them and they are separate models.

        `/ingredients` serialises through `IngredientTaste` and a tea's recipe rows
        through the same class nested inside `TeaIngredientOut`; a field added to
        `IngredientOut` and forgotten on one of the two paths is exactly the kind of gap
        that only shows up as a missing picture on one page.
        """
        mint = catalog_fixtures["mint"]
        mint.description = "Sharp menthol that cools the whole mouth."
        mint.image_url = "/media/mint.jpg"
        await db.flush()

        listed = (await client.get(f"{CATALOG}/ingredients?q=Mint")).json()["items"][0]
        assert listed["description"] == "Sharp menthol that cools the whole mouth."
        assert listed["image_url"] == "/media/mint.jpg"

        detail = (await client.get(f"{CATALOG}/teas/mint-green")).json()
        row = next(i for i in detail["ingredients"] if i["ingredient"]["slug"] == "mint")
        assert row["ingredient"]["image_url"] == "/media/mint.jpg"

    async def test_lists_brands(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        assert (await client.get(f"{CATALOG}/brands")).json()["total"] == 1


class TestSuggestIngredient:
    """Anybody signed in can propose a word for the shared vocabulary.

    It exists for one specific moment: somebody is typing out a blend's recipe, the herb
    in it is not in the list, and without this the only options are to lie about the
    recipe or abandon the form.
    """

    async def test_requires_an_account(self, client: AsyncClient) -> None:
        response = await client.post(
            f"{CATALOG}/ingredients", json={"name": "Yuzu peel", "category": "peel"}
        )
        assert response.status_code == 401

    async def test_arrives_unapproved_but_immediately_listed(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            f"{CATALOG}/ingredients",
            headers=user_headers,
            json={"name": "Yuzu peel", "category": "peel"},
        )

        assert response.status_code == 201
        assert response.json()["is_approved"] is False

        # Listed straight away, marked. A suggestion that vanishes until an admin notices
        # is a form that appears to have failed.
        found = (await client.get(f"{CATALOG}/ingredients?q=Yuzu")).json()
        assert found["total"] == 1
        assert found["items"][0]["is_approved"] is False

    async def test_records_who_suggested_it(
        self, client: AsyncClient, user_headers: dict[str, str], db: AsyncSession
    ) -> None:
        await client.post(
            f"{CATALOG}/ingredients",
            headers=user_headers,
            json={"name": "Yuzu peel", "category": "peel"},
        )

        row = await db.scalar(select(Ingredient).where(Ingredient.slug == "yuzu-peel"))
        assert row is not None
        assert row.created_by_id is not None

    async def test_an_admin_can_vouch_for_it(
        self, client: AsyncClient, user_headers: dict[str, str], admin_headers: dict[str, str]
    ) -> None:
        suggested = (
            await client.post(
                f"{CATALOG}/ingredients",
                headers=user_headers,
                json={"name": "Yuzu peel", "category": "peel"},
            )
        ).json()

        approved = await client.post(
            f"/api/v1/admin/ingredients/{suggested['id']}/approve", headers=admin_headers
        )

        assert approved.status_code == 200
        assert approved.json()["is_approved"] is True

    async def test_a_plain_user_cannot_approve(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        suggested = (
            await client.post(
                f"{CATALOG}/ingredients",
                headers=user_headers,
                json={"name": "Yuzu peel", "category": "peel"},
            )
        ).json()

        response = await client.post(
            f"/api/v1/admin/ingredients/{suggested['id']}/approve", headers=user_headers
        )
        assert response.status_code == 403

    async def test_the_widened_vocabulary_is_accepted(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        """The categories that opened up when "spice" stopped holding bark, root and seed
        at once. `extract` is the one that matters most here: it is seven characters, and
        the column was a VARCHAR(6) sized for "flower" until the migration widened it."""
        for index, category in enumerate(
            ("berry", "peel", "root", "bark", "seed", "grain", "nut", "extract")
        ):
            response = await client.post(
                f"{CATALOG}/ingredients",
                headers=user_headers,
                json={"name": f"Test {category} {index}", "category": category},
            )
            assert response.status_code == 201, f"{category}: {response.text}"
            assert response.json()["category"] == category


class TestSuggestingAlongsideATea:
    """A tea, plus the ingredients and the shop the catalog did not have yet.

    All of it in one request, because the alternative is the browser making four calls and
    the blend landing with half its recipe when the third one fails.
    """

    async def test_new_ingredients_are_created_and_attached(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            f"{CATALOG}/teas",
            headers=user_headers,
            json={
                "name": "Yuzu Sencha",
                "tea_type": "green",
                "new_ingredients": [
                    {"name": "Yuzu peel", "category": "peel", "is_primary": True},
                    {"name": "Lemon myrtle leaf", "category": "leaf"},
                ],
            },
        )

        assert response.status_code == 201, response.text
        body = response.json()
        names = [e["ingredient"]["name"] for e in body["ingredients"]]
        assert names == ["Yuzu peel", "Lemon myrtle leaf"]
        # They inherit the tea's approval state: a reader suggesting a blend is suggesting
        # the herb in it too.
        assert all(e["ingredient"]["is_approved"] is False for e in body["ingredients"])
        assert body["ingredients"][0]["is_primary"] is True

    async def test_new_ingredients_keep_the_order_they_were_sent_in(
        self, client: AsyncClient, user_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        """Mixed with existing ones: "green tea leaf, yuzu peel" must not come back
        alphabetised into something that reads like a different recipe."""
        mint = catalog_fixtures["mint"]
        response = await client.post(
            f"{CATALOG}/teas",
            headers=user_headers,
            json={
                "name": "Mint and Yuzu",
                "tea_type": "blend",
                "ingredients": [{"ingredient_id": str(mint.id)}],
                "new_ingredients": [{"name": "Yuzu peel", "category": "peel"}],
            },
        )

        names = [e["ingredient"]["name"] for e in response.json()["ingredients"]]
        assert names == [mint.name, "Yuzu peel"]

    async def test_a_new_shop_arrives_with_a_listing_for_the_tea(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        """Both facts or neither. "This shop exists" without "it sells this" drops the
        half that answers the question the tea's page actually asks."""
        created = await client.post(
            f"{CATALOG}/teas",
            headers=user_headers,
            json={
                "name": "Gdańsk Breakfast",
                "tea_type": "black",
                "new_shop": {"name": "Czajnik na Rogu", "city": "Gdańsk"},
            },
        )
        assert created.status_code == 201, created.text
        slug = created.json()["slug"]

        where = (await client.get(f"{CATALOG}/teas/{slug}/shops")).json()
        assert where["total"] == 1
        assert where["items"][0]["shop"]["name"] == "Czajnik na Rogu"
        assert where["items"][0]["shop"]["is_approved"] is False

    async def test_an_unreachable_shop_is_refused_before_anything_is_written(
        self, client: AsyncClient, user_headers: dict[str, str], db: AsyncSession
    ) -> None:
        """No website and no city means nobody can find it. The 422 has to arrive before
        the tea is written, or a rejected shop leaves a tea behind."""
        response = await client.post(
            f"{CATALOG}/teas",
            headers=user_headers,
            json={
                "name": "Ghost Tea",
                "tea_type": "black",
                "new_shop": {"name": "Nowhere"},
            },
        )

        assert response.status_code == 422
        assert await db.scalar(select(Tea).where(Tea.slug == "ghost-tea")) is None

    async def test_an_admin_adding_a_tea_vouches_for_what_they_name(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            "/api/v1/admin/teas",
            headers=admin_headers,
            json={
                "name": "House Blend",
                "tea_type": "blend",
                "new_ingredients": [{"name": "Yuzu peel", "category": "peel"}],
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["is_approved"] is True
        assert body["ingredients"][0]["ingredient"]["is_approved"] is True
