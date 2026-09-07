import uuid

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.household import StockEvent, StockItem
from tests.conftest import Account

SHOPS = "/api/v1/shops"
ADMIN_SHOPS = "/api/v1/admin/shops"

PNG = b"\x89PNG\r\n\x1a\n" + b"pretend this is pixels" * 4


class TestBrowsing:
    async def test_shops_are_public(self, client: AsyncClient, shop: dict) -> None:
        response = await client.get(SHOPS)

        assert response.status_code == 200
        assert [s["name"] for s in response.json()["items"]] == ["Czajnik"]

    async def test_a_summary_carries_its_listing_count(
        self, client: AsyncClient, shop: dict, listing: dict
    ) -> None:
        item = (await client.get(SHOPS)).json()["items"][0]

        assert item["listing_count"] == 1

    async def test_filters_by_city(self, client: AsyncClient, shop: dict) -> None:
        assert (await client.get(f"{SHOPS}?city=krakow")).json()["total"] == 0
        assert (await client.get(f"{SHOPS}?city=Kraków")).json()["total"] == 1

    async def test_a_suggested_shop_is_listed_and_marked_rather_than_hidden(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        """It used to be invisible until approved, which meant the person who suggested it
        submitted a form and then could not find the shop they had just added."""
        await client.post(
            SHOPS, headers=user_headers, json={"name": "Secret Shop", "city": "Nowhere"}
        )

        listing = (await client.get(SHOPS)).json()
        assert listing["total"] == 1
        assert listing["items"][0]["is_approved"] is False

        detail = await client.get(f"{SHOPS}/secret-shop")
        assert detail.status_code == 200
        assert detail.json()["is_approved"] is False

    async def test_a_shop_needs_some_way_to_be_found(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        """No website and no location means nobody can go there — a 422 naming the
        problem, not a 500 from the CHECK constraint."""
        response = await client.post(SHOPS, headers=user_headers, json={"name": "Ghost Shop"})

        assert response.status_code == 422


class TestListings:
    async def test_lists_what_a_shop_sells(
        self, client: AsyncClient, shop: dict, listing: dict
    ) -> None:
        body = (await client.get(f"{SHOPS}/{shop['slug']}/listings")).json()

        assert body["total"] == 1
        assert body["items"][0]["price_minor"] == 2400
        assert body["items"][0]["currency"] == "PLN"
        assert body["items"][0]["pack_grams"] == 50.0

    async def test_a_price_needs_a_currency(
        self, client: AsyncClient, admin_headers: dict[str, str], shop: dict, tea
    ) -> None:
        response = await client.post(
            f"{ADMIN_SHOPS}/{shop['id']}/listings",
            headers=admin_headers,
            json={"tea_id": str(tea.id), "price_minor": 500},
        )

        assert response.status_code == 422

    async def test_the_same_tea_at_two_pack_sizes_is_fine(
        self, client: AsyncClient, admin_headers: dict[str, str], shop: dict, tea, listing: dict
    ) -> None:
        response = await client.post(
            f"{ADMIN_SHOPS}/{shop['id']}/listings",
            headers=admin_headers,
            json={"tea_id": str(tea.id), "pack_grams": 100},
        )

        assert response.status_code == 201

    async def test_the_same_tea_at_the_same_pack_size_is_not(
        self, client: AsyncClient, admin_headers: dict[str, str], shop: dict, tea, listing: dict
    ) -> None:
        response = await client.post(
            f"{ADMIN_SHOPS}/{shop['id']}/listings",
            headers=admin_headers,
            json={"tea_id": str(tea.id), "pack_grams": 50},
        )

        assert response.status_code >= 400

    async def test_where_to_buy_a_tea(
        self, client: AsyncClient, shop: dict, listing: dict, tea
    ) -> None:
        body = (await client.get(f"/api/v1/catalog/teas/{tea.slug}/shops")).json()

        assert body["total"] == 1
        assert body["items"][0]["shop"]["name"] == "Czajnik"
        assert body["items"][0]["product_url"] == "https://czajnik.example/sencha"

    async def test_an_unapproved_shop_does_appear_in_where_to_buy_marked(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        user_headers: dict[str, str],
        tea,
    ) -> None:
        """A suggested shop is part of the catalog now, so its listings are too.

        This used to assert the opposite, on the argument that pointing people at an
        unreviewed shop sidesteps the queue. That went with the change: a listing that
        exists but is invisible on the one page it answers a question for is worse than a
        marked one, and "where can I buy this" is the question."""
        pending = (
            await client.post(
                SHOPS, headers=user_headers, json={"name": "Unreviewed", "city": "Gdańsk"}
            )
        ).json()
        await client.post(
            f"{ADMIN_SHOPS}/{pending['id']}/listings",
            headers=admin_headers,
            json={"tea_id": str(tea.id)},
        )

        where = (await client.get(f"/api/v1/catalog/teas/{tea.slug}/shops")).json()
        assert where["total"] == 1
        assert where["items"][0]["shop"]["is_approved"] is False


class TestBuying:
    async def test_puts_the_tea_on_your_shelf_tagged_with_the_shop(
        self, client: AsyncClient, owner: Account, household: dict, shop: dict, listing: dict
    ) -> None:
        """The milestone's acceptance criterion."""
        response = await client.post(
            f"{SHOPS}/{shop['slug']}/listings/{listing['id']}/buy",
            headers=owner.headers,
            json={
                "household_id": household["id"],
                "grams": 50,
                "price_paid_minor": 2400,
                "currency": "PLN",
            },
        )

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["quantity_grams"] == 50.0
        assert body["shop"]["name"] == "Czajnik"
        assert body["tea"]["slug"] == "test-sencha"

    async def test_the_purchase_lands_in_the_ledger_with_shop_and_price(
        self,
        client: AsyncClient,
        owner: Account,
        household: dict,
        shop: dict,
        listing: dict,
        db: AsyncSession,
    ) -> None:
        await client.post(
            f"{SHOPS}/{shop['slug']}/listings/{listing['id']}/buy",
            headers=owner.headers,
            json={
                "household_id": household["id"],
                "grams": 50,
                "price_paid_minor": 2400,
                "currency": "PLN",
            },
        )

        event = await db.scalar(select(StockEvent).where(StockEvent.kind == "purchase"))
        assert event is not None
        assert event.price_paid_minor == 2400
        assert event.currency == "PLN"
        assert event.shop_id is not None

    async def test_buying_twice_tops_up_the_same_tin(
        self,
        client: AsyncClient,
        owner: Account,
        household: dict,
        shop: dict,
        listing: dict,
        db: AsyncSession,
    ) -> None:
        url = f"{SHOPS}/{shop['slug']}/listings/{listing['id']}/buy"
        body = {"household_id": household["id"], "grams": 50}

        await client.post(url, headers=owner.headers, json=body)
        second = await client.post(url, headers=owner.headers, json=body)

        assert second.json()["quantity_grams"] == 100.0
        tins = (await db.scalars(select(StockItem))).all()
        assert len(tins) == 1

    async def test_the_same_tea_from_a_different_shop_is_a_separate_tin(
        self,
        client: AsyncClient,
        owner: Account,
        admin_headers: dict[str, str],
        household: dict,
        shop: dict,
        listing: dict,
        tea,
        db: AsyncSession,
    ) -> None:
        """Merging them would quietly destroy the answer to "where did this come from",
        which is the whole point of the feature."""
        other = (
            await client.post(
                ADMIN_SHOPS,
                headers=admin_headers,
                json={"name": "Herbaciarnia", "city": "Warsaw"},
            )
        ).json()
        other_listing = (
            await client.post(
                f"{ADMIN_SHOPS}/{other['id']}/listings",
                headers=admin_headers,
                json={"tea_id": str(tea.id), "pack_grams": 50},
            )
        ).json()

        await client.post(
            f"{SHOPS}/{shop['slug']}/listings/{listing['id']}/buy",
            headers=owner.headers,
            json={"household_id": household["id"], "grams": 50},
        )
        await client.post(
            f"{SHOPS}/{other['slug']}/listings/{other_listing['id']}/buy",
            headers=owner.headers,
            json={"household_id": household["id"], "grams": 50},
        )

        tins = (await db.scalars(select(StockItem))).all()
        assert len(tins) == 2

    async def test_you_cannot_buy_into_a_household_you_are_not_in(
        self, client: AsyncClient, outsider: Account, household: dict, shop: dict, listing: dict
    ) -> None:
        response = await client.post(
            f"{SHOPS}/{shop['slug']}/listings/{listing['id']}/buy",
            headers=outsider.headers,
            json={"household_id": household["id"], "grams": 50},
        )

        assert response.status_code == 403

    async def test_requires_an_account(
        self, client: AsyncClient, household: dict, shop: dict, listing: dict
    ) -> None:
        response = await client.post(
            f"{SHOPS}/{shop['slug']}/listings/{listing['id']}/buy",
            json={"household_id": household["id"], "grams": 50},
        )

        assert response.status_code == 401

    async def test_an_unknown_listing_is_404(
        self, client: AsyncClient, owner: Account, household: dict, shop: dict
    ) -> None:
        response = await client.post(
            f"{SHOPS}/{shop['slug']}/listings/{uuid.uuid4()}/buy",
            headers=owner.headers,
            json={"household_id": household["id"], "grams": 50},
        )

        assert response.status_code == 404

    async def test_a_bought_tin_can_still_be_brewed_from(
        self, client: AsyncClient, owner: Account, household: dict, shop: dict, listing: dict
    ) -> None:
        """Buying is just another way to get a tin; everything M3 does still applies."""
        tin = (
            await client.post(
                f"{SHOPS}/{shop['slug']}/listings/{listing['id']}/buy",
                headers=owner.headers,
                json={"household_id": household["id"], "grams": 50},
            )
        ).json()

        brewed = await client.post(
            f"/api/v1/households/{household['id']}/stock/{tin['id']}/events",
            headers=owner.headers,
            json={"kind": "brew", "grams": 5},
        )

        assert brewed.json()["quantity_grams"] == 45.0


class TestImages:
    async def test_stores_an_image_and_returns_its_url(
        self, client: AsyncClient, owner: Account
    ) -> None:
        response = await client.post(
            "/api/v1/uploads/image",
            headers=owner.headers,
            files={"file": ("photo.png", PNG, "image/png")},
        )

        assert response.status_code == 201
        assert response.json()["url"].startswith("/media/")
        assert response.json()["url"].endswith(".png")

    async def test_the_stored_name_ignores_whatever_the_client_called_it(
        self, client: AsyncClient, owner: Account
    ) -> None:
        """The filename is the client's invention. Hashing the contents instead means
        "../../etc/passwd" and "shell.php" are not expressible as names."""
        response = await client.post(
            "/api/v1/uploads/image",
            headers=owner.headers,
            files={"file": ("../../etc/passwd", PNG, "image/png")},
        )

        url = response.json()["url"]
        assert ".." not in url
        assert "passwd" not in url

    async def test_the_extension_comes_from_the_bytes_not_the_claim(
        self, client: AsyncClient, owner: Account
    ) -> None:
        response = await client.post(
            "/api/v1/uploads/image",
            headers=owner.headers,
            files={"file": ("evil.php", PNG, "image/png")},
        )

        assert response.json()["url"].endswith(".png")

    async def test_rejects_something_that_is_not_an_image(
        self, client: AsyncClient, owner: Account
    ) -> None:
        response = await client.post(
            "/api/v1/uploads/image",
            headers=owner.headers,
            files={"file": ("x.png", b"<?php system($_GET[0]); ?>", "image/png")},
        )

        assert response.status_code == 415

    async def test_rejects_something_too_large(self, client: AsyncClient, owner: Account) -> None:
        response = await client.post(
            "/api/v1/uploads/image",
            headers=owner.headers,
            files={
                "file": ("big.png", b"\x89PNG\r\n\x1a\n" + b"x" * (5 * 1024 * 1024), "image/png")
            },
        )

        assert response.status_code == 413

    async def test_requires_an_account(self, client: AsyncClient) -> None:
        """An open upload endpoint is free hosting for whoever finds it."""
        response = await client.post(
            "/api/v1/uploads/image", files={"file": ("photo.png", PNG, "image/png")}
        )

        assert response.status_code == 401

    async def test_identical_images_collapse_onto_one_url(
        self, client: AsyncClient, owner: Account
    ) -> None:
        first = await client.post(
            "/api/v1/uploads/image",
            headers=owner.headers,
            files={"file": ("a.png", PNG, "image/png")},
        )
        second = await client.post(
            "/api/v1/uploads/image",
            headers=owner.headers,
            files={"file": ("b.png", PNG, "image/png")},
        )

        assert first.json()["url"] == second.json()["url"]


class TestHouseholdImages:
    async def test_an_owner_can_set_one(
        self, client: AsyncClient, owner: Account, household: dict
    ) -> None:
        response = await client.patch(
            f"/api/v1/households/{household['id']}",
            headers=owner.headers,
            json={"image_url": "/media/abc.png"},
        )

        assert response.status_code == 200
        assert response.json()["image_url"] == "/media/abc.png"

    async def test_setting_only_the_picture_keeps_the_name(
        self, client: AsyncClient, owner: Account, household: dict
    ) -> None:
        response = await client.patch(
            f"/api/v1/households/{household['id']}",
            headers=owner.headers,
            json={"image_url": "/media/abc.png"},
        )

        assert response.json()["name"] == "Flat 3B"

    async def test_a_member_cannot(
        self, client: AsyncClient, flatmate: Account, shared_household: dict
    ) -> None:
        response = await client.patch(
            f"/api/v1/households/{shared_household['id']}",
            headers=flatmate.headers,
            json={"image_url": "/media/abc.png"},
        )

        assert response.status_code == 403


class TestApproval:
    async def test_an_admin_can_approve_a_suggested_shop(
        self, client: AsyncClient, user_headers: dict[str, str], admin_headers: dict[str, str]
    ) -> None:
        suggested = (
            await client.post(
                SHOPS, headers=user_headers, json={"name": "Pod Herbatą", "city": "Wrocław"}
            )
        ).json()
        before = await client.get(f"{SHOPS}/{suggested['slug']}")
        assert before.status_code == 200
        assert before.json()["is_approved"] is False

        approved = await client.post(
            f"{ADMIN_SHOPS}/{suggested['id']}/approve", headers=admin_headers
        )

        assert approved.status_code == 200
        # Approving is what clears the mark, not what makes it visible.
        assert (await client.get(f"{SHOPS}/{suggested['slug']}")).json()["is_approved"] is True

    async def test_a_plain_user_cannot_reach_the_queue(
        self, client: AsyncClient, user_headers: dict[str, str]
    ) -> None:
        assert (
            await client.get(f"{ADMIN_SHOPS}?approved=false", headers=user_headers)
        ).status_code == 403


class TestAdminShopDetail:
    async def test_an_admin_can_read_an_unapproved_shop(
        self, client: AsyncClient, user_headers: dict[str, str], admin_headers: dict[str, str]
    ) -> None:
        """The admin detail route exists because the moderation queue needs every field to
        build an edit form from — a form built off a summary would PATCH address and
        description to null. It outlived the reason it was added (the public route used to
        hide unapproved shops) and is still the right endpoint for the queue."""
        suggested = (
            await client.post(
                SHOPS,
                headers=user_headers,
                json={
                    "name": "Pending Shop",
                    "city": "Łódź",
                    "address": "ul. Piotrkowska 1",
                    "description": "Worth a look.",
                },
            )
        ).json()

        assert (await client.get(f"{SHOPS}/{suggested['slug']}")).status_code == 200

        response = await client.get(f"{ADMIN_SHOPS}/{suggested['id']}", headers=admin_headers)

        assert response.status_code == 200
        assert response.json()["address"] == "ul. Piotrkowska 1"
        assert response.json()["description"] == "Worth a look."
        assert response.json()["is_approved"] is False

    async def test_a_plain_user_cannot(
        self, client: AsyncClient, user_headers: dict[str, str], shop: dict
    ) -> None:
        assert (
            await client.get(f"{ADMIN_SHOPS}/{shop['id']}", headers=user_headers)
        ).status_code == 403


class TestSlugsWithAwkwardLetters:
    async def test_letters_nfkd_cannot_decompose_still_survive(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        """ø, ł, ß and æ are single characters with no ASCII base to strip back to, so
        NFKD alone turned "Tørret Blad" into "trret-blad"."""
        response = await client.post(
            ADMIN_SHOPS,
            headers=admin_headers,
            json={"name": "Tørret Blad", "city": "Copenhagen"},
        )

        assert response.json()["slug"] == "torret-blad"


class TestNearby:
    KRAKOW = (50.0617, 19.9392)

    async def _shop_at(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        name: str,
        lat: float | None,
        lng: float | None,
    ) -> dict:
        body: dict = {"name": name, "city": "Somewhere"}
        if lat is not None:
            body |= {"latitude": lat, "longitude": lng}
        response = await client.post(ADMIN_SHOPS, headers=admin_headers, json=body)
        assert response.status_code == 201, response.text
        return response.json()

    async def test_sorts_nearest_first(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        await self._shop_at(client, admin_headers, "Warsaw shop", 52.2496, 21.0123)
        await self._shop_at(client, admin_headers, "Kraków shop", 50.0617, 19.9392)
        await self._shop_at(client, admin_headers, "Wrocław shop", 51.1098, 17.0327)

        lat, lng = self.KRAKOW
        body = (await client.get(f"{SHOPS}?near_lat={lat}&near_lng={lng}")).json()

        assert [s["name"] for s in body["items"]] == [
            "Kraków shop",
            "Wrocław shop",
            "Warsaw shop",
        ]

    async def test_reports_the_distance(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        """Kraków to Warsaw is about 252 km as the crow flies."""
        await self._shop_at(client, admin_headers, "Warsaw shop", 52.2496, 21.0123)

        lat, lng = self.KRAKOW
        item = (await client.get(f"{SHOPS}?near_lat={lat}&near_lng={lng}")).json()["items"][0]

        assert 250 < item["distance_km"] < 256

    async def test_distance_is_null_without_a_position(
        self, client: AsyncClient, shop: dict
    ) -> None:
        """null, not 0 — 0 would read as "you are standing in it"."""
        item = (await client.get(SHOPS)).json()["items"][0]

        assert item["distance_km"] is None

    async def test_a_radius_excludes_what_is_beyond_it(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        await self._shop_at(client, admin_headers, "Warsaw shop", 52.2496, 21.0123)
        await self._shop_at(client, admin_headers, "Kraków shop", 50.0617, 19.9392)

        lat, lng = self.KRAKOW
        body = (await client.get(f"{SHOPS}?near_lat={lat}&near_lng={lng}&radius_km=50")).json()

        assert [s["name"] for s in body["items"]] == ["Kraków shop"]
        assert body["total"] == 1

    async def test_a_shop_with_no_pin_is_left_out_of_a_nearest_first_list(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        """ "Nearest shops" that includes ones whose location nobody knows is a worse
        answer than a shorter list."""
        await self._shop_at(client, admin_headers, "Online only", None, None)
        await self._shop_at(client, admin_headers, "Kraków shop", 50.0617, 19.9392)

        lat, lng = self.KRAKOW
        near = (await client.get(f"{SHOPS}?near_lat={lat}&near_lng={lng}")).json()
        plain = (await client.get(SHOPS)).json()

        assert [s["name"] for s in near["items"]] == ["Kraków shop"]
        assert plain["total"] == 2  # still listed the ordinary way

    async def test_half_a_position_is_rejected(self, client: AsyncClient) -> None:
        assert (await client.get(f"{SHOPS}?near_lat=50")).status_code == 422
        assert (await client.get(f"{SHOPS}?near_lng=20")).status_code == 422

    async def test_an_impossible_latitude_is_rejected(self, client: AsyncClient) -> None:
        assert (await client.get(f"{SHOPS}?near_lat=999&near_lng=20")).status_code == 422


class TestPins:
    async def test_half_a_pin_is_rejected(
        self, client: AsyncClient, admin_headers: dict[str, str], shop: dict
    ) -> None:
        response = await client.patch(
            f"{ADMIN_SHOPS}/{shop['id']}", headers=admin_headers, json={"latitude": 50.0}
        )

        assert response.status_code == 422

    async def test_an_admin_can_drop_a_pin(
        self, client: AsyncClient, admin_headers: dict[str, str], shop: dict
    ) -> None:
        response = await client.patch(
            f"{ADMIN_SHOPS}/{shop['id']}",
            headers=admin_headers,
            json={"latitude": 50.0617, "longitude": 19.9392},
        )

        assert response.json()["latitude"] == 50.0617
        assert response.json()["longitude"] == 19.9392

    async def test_geocoding_is_off_unless_switched_on(
        self, client: AsyncClient, admin_headers: dict[str, str], shop: dict
    ) -> None:
        """503, not 422: nothing is wrong with the address — the lookup is disabled, and
        the suite must never depend on a third party being reachable."""
        response = await client.post(f"{ADMIN_SHOPS}/{shop['id']}/geocode", headers=admin_headers)

        assert response.status_code == 503
        assert "pin" in response.json()["detail"].lower()

    async def test_a_plain_user_cannot_geocode(
        self, client: AsyncClient, user_headers: dict[str, str], shop: dict
    ) -> None:
        assert (
            await client.post(f"{ADMIN_SHOPS}/{shop['id']}/geocode", headers=user_headers)
        ).status_code == 403
