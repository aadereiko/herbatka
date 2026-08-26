from typing import Any

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import Tea

CATALOG = "/api/v1/catalog"


class TestPublicTeaList:
    async def test_lists_only_approved_teas(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        response = await client.get(f"{CATALOG}/teas")

        assert response.status_code == 200
        body = response.json()
        assert [t["name"] for t in body["items"]] == ["Mint Green"]
        assert body["total"] == 1

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

    async def test_hides_an_unapproved_tea(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        assert (await client.get(f"{CATALOG}/teas/secret-blend")).status_code == 404

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
        assert (await client.get(f"{CATALOG}/teas?q=My Blend")).json()["total"] == 0

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

    async def test_lists_brands(
        self, client: AsyncClient, catalog_fixtures: dict[str, Any]
    ) -> None:
        assert (await client.get(f"{CATALOG}/brands")).json()["total"] == 1
