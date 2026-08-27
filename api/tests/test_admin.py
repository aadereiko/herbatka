from typing import Any

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import Ingredient, Tea

ADMIN = "/api/v1/admin"
CATALOG = "/api/v1/catalog"


class TestAccessControl:
    async def test_anonymous_is_rejected(self, client: AsyncClient) -> None:
        assert (await client.get(f"{ADMIN}/teas")).status_code == 401

    async def test_an_ordinary_user_is_forbidden(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        """401 means "who are you"; 403 means "I know, and no". The difference matters
        to the client, which should not try to refresh a token over a 403."""
        assert (await client.get(f"{ADMIN}/teas", headers=user_headers)).status_code == 403

    async def test_an_admin_is_allowed(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        assert (await client.get(f"{ADMIN}/teas", headers=admin_headers)).status_code == 200

    async def test_every_admin_route_is_guarded(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        """The guard is declared on the router, so a new route cannot forget it."""
        for method, path in [
            ("get", f"{ADMIN}/teas"),
            ("post", f"{ADMIN}/teas"),
            ("post", f"{ADMIN}/ingredients"),
            ("post", f"{ADMIN}/brands"),
        ]:
            response = await client.request(method, path, headers=user_headers, json={})
            assert response.status_code == 403, f"{method} {path} was not guarded"


class TestModerationQueue:
    async def test_lists_pending_teas(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        body = (await client.get(f"{ADMIN}/teas?approved=false", headers=admin_headers)).json()

        assert [t["name"] for t in body["items"]] == ["Secret Blend"]

    async def test_lists_everything_when_unfiltered(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        body = (await client.get(f"{ADMIN}/teas", headers=admin_headers)).json()

        assert body["total"] == 2

    async def test_approving_publishes_the_tea(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        pending = catalog_fixtures["pending"]
        assert (await client.get(f"{CATALOG}/teas/secret-blend")).status_code == 404

        response = await client.post(f"{ADMIN}/teas/{pending.id}/approve", headers=admin_headers)

        assert response.status_code == 200
        assert response.json()["is_approved"] is True
        assert (await client.get(f"{CATALOG}/teas/secret-blend")).status_code == 200


class TestAdminTeas:
    async def test_admin_created_teas_are_published_immediately(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            f"{ADMIN}/teas",
            headers=admin_headers,
            json={"name": "House Blend", "tea_type": "black"},
        )

        assert response.status_code == 201
        assert response.json()["is_approved"] is True

    async def test_patch_replaces_the_recipe(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        tea = catalog_fixtures["approved"]

        response = await client.patch(
            f"{ADMIN}/teas/{tea.id}",
            headers=admin_headers,
            json={"ingredients": [{"ingredient_id": str(catalog_fixtures["mint"].id)}]},
        )

        assert response.status_code == 200
        assert [i["ingredient"]["name"] for i in response.json()["ingredients"]] == ["Mint"]

    async def test_patch_without_ingredients_leaves_the_recipe_alone(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        """`None` means "not mentioned"; `[]` would mean "remove everything"."""
        tea = catalog_fixtures["approved"]

        response = await client.patch(
            f"{ADMIN}/teas/{tea.id}", headers=admin_headers, json={"name": "Renamed"}
        )

        assert len(response.json()["ingredients"]) == 2

    async def test_patch_empty_ingredient_list_clears_the_recipe(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        tea = catalog_fixtures["approved"]

        response = await client.patch(
            f"{ADMIN}/teas/{tea.id}", headers=admin_headers, json={"ingredients": []}
        )

        assert response.json()["ingredients"] == []

    async def test_renaming_updates_the_slug(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        tea = catalog_fixtures["approved"]

        response = await client.patch(
            f"{ADMIN}/teas/{tea.id}", headers=admin_headers, json={"name": "Peppermint Delight"}
        )

        assert response.json()["slug"] == "peppermint-delight"

    async def test_delete_removes_the_tea(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        tea = catalog_fixtures["approved"]

        assert (
            await client.delete(f"{ADMIN}/teas/{tea.id}", headers=admin_headers)
        ).status_code == 204
        assert (await client.get(f"{CATALOG}/teas/mint-green")).status_code == 404

    async def test_unknown_tea_is_404(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        missing = "00000000-0000-0000-0000-000000000000"
        assert (
            await client.delete(f"{ADMIN}/teas/{missing}", headers=admin_headers)
        ).status_code == 404


class TestAdminIngredients:
    async def test_creates_with_a_generated_slug(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            f"{ADMIN}/ingredients",
            headers=admin_headers,
            json={"name": "Lemon Verbena", "category": "herb", "is_caffeinated": False},
        )

        assert response.status_code == 201
        assert response.json()["slug"] == "lemon-verbena"

    async def test_slugifies_non_ascii_names(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        """NFKD decomposition, so "Mięta" becomes "mieta" rather than being stripped."""
        response = await client.post(
            f"{ADMIN}/ingredients",
            headers=admin_headers,
            json={"name": "Mięta", "category": "herb"},
        )

        assert response.json()["slug"] == "mieta"

    async def test_creates_with_a_picture_and_a_description(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        """Both halves of what a card is built from, on the way in and on the way out.

        Asserted on the *values*, not on the keys being present: both fields are
        nullable, so a schema that dropped them would still answer 201 with nulls.
        """
        response = await client.post(
            f"{ADMIN}/ingredients",
            headers=admin_headers,
            json={
                "name": "Osmanthus",
                "category": "flower",
                "description": "Apricot and ripe peach, in tiny golden flowers.",
                "image_url": "/media/osmanthus.jpg",
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["description"] == "Apricot and ripe peach, in tiny golden flowers."
        assert body["image_url"] == "/media/osmanthus.jpg"

    async def test_a_picture_survives_an_edit_that_does_not_mention_it(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        """`exclude_unset` is the whole mechanism, and it has to work in both directions.

        Renaming an ingredient must not quietly discard the photo somebody uploaded, and
        an explicit null must genuinely remove it — otherwise the form's Remove button is
        a lie. An optional-only field could express the first but not the second.
        """
        created = (
            await client.post(
                f"{ADMIN}/ingredients",
                headers=admin_headers,
                json={
                    "name": "Osmanthus",
                    "category": "flower",
                    "image_url": "/media/osmanthus.jpg",
                },
            )
        ).json()

        renamed = await client.patch(
            f"{ADMIN}/ingredients/{created['id']}",
            headers=admin_headers,
            json={"name": "Sweet osmanthus"},
        )
        assert renamed.json()["image_url"] == "/media/osmanthus.jpg"

        cleared = await client.patch(
            f"{ADMIN}/ingredients/{created['id']}",
            headers=admin_headers,
            json={"image_url": None},
        )
        assert cleared.json()["image_url"] is None

    async def test_replacing_a_seeded_photo_takes_its_credit_down_with_it(
        self, client: AsyncClient, admin_headers: dict[str, str], db: AsyncSession
    ) -> None:
        """A credit belongs to *a* photograph, and does not follow the next one in.

        Left behind, "Photo by Jacek Halicki · CC BY-SA 4.0" would sit under an admin's own
        picture of clove — not a missing attribution but a false one, naming somebody who
        has never seen the file. The rename above proves the same thing does not happen
        when the picture is not mentioned: an edit to the name must leave the credit alone.
        """
        seeded = Ingredient(
            slug="clove",
            name="Clove",
            category="spice",
            is_caffeinated=False,
            image_url="/media/seeded.jpg",
            image_attribution="Jacek Halicki",
            image_license="CC BY-SA 4.0",
            image_license_url="https://creativecommons.org/licenses/by-sa/4.0",
            image_source_url="https://commons.wikimedia.org/wiki/File:2023_Go%C5%BAdziki.jpg",
        )
        db.add(seeded)
        await db.flush()

        renamed = await client.patch(
            f"{ADMIN}/ingredients/{seeded.id}", headers=admin_headers, json={"name": "Cloves"}
        )
        assert renamed.json()["image_attribution"] == "Jacek Halicki"

        replaced = await client.patch(
            f"{ADMIN}/ingredients/{seeded.id}",
            headers=admin_headers,
            json={"image_url": "/media/mine.jpg"},
        )

        body = replaced.json()
        assert body["image_url"] == "/media/mine.jpg"
        assert body["image_attribution"] is None
        assert body["image_license"] is None
        assert body["image_license_url"] is None
        assert body["image_source_url"] is None

    async def test_refuses_to_delete_an_ingredient_in_use(
        self, client: AsyncClient, admin_headers: dict[str, str], catalog_fixtures: dict[str, Any]
    ) -> None:
        """409 with a useful message, not a 500 from the FK's ON DELETE RESTRICT."""
        mint = catalog_fixtures["mint"]

        response = await client.delete(f"{ADMIN}/ingredients/{mint.id}", headers=admin_headers)

        assert response.status_code == 409
        assert "1 tea" in response.json()["detail"]

    async def test_deletes_an_unused_ingredient(
        self, client: AsyncClient, admin_headers: dict[str, str], db: AsyncSession
    ) -> None:
        created = (
            await client.post(
                f"{ADMIN}/ingredients",
                headers=admin_headers,
                json={"name": "Unused", "category": "other"},
            )
        ).json()

        response = await client.delete(
            f"{ADMIN}/ingredients/{created['id']}", headers=admin_headers
        )

        assert response.status_code == 204
        assert await db.scalar(select(Ingredient).where(Ingredient.slug == "unused")) is None


class TestAdminBrands:
    async def test_deleting_a_brand_keeps_its_teas(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        catalog_fixtures: dict[str, Any],
        db: AsyncSession,
    ) -> None:
        """ON DELETE SET NULL: the tea still exists on someone's shelf."""
        brand = catalog_fixtures["brand"]

        response = await client.delete(f"{ADMIN}/brands/{brand.id}", headers=admin_headers)

        assert response.status_code == 204
        tea = await db.scalar(select(Tea).where(Tea.slug == "mint-green"))
        assert tea is not None
        assert tea.brand_id is None
