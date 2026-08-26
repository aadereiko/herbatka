import uuid

from httpx import AsyncClient

from tests.conftest import Account

HOUSEHOLDS = "/api/v1/households"


class TestCreate:
    async def test_creator_becomes_the_owner(self, client: AsyncClient, owner: Account) -> None:
        response = await client.post(HOUSEHOLDS, headers=owner.headers, json={"name": "Flat 3B"})

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Flat 3B"
        assert body["role"] == "owner"
        assert [m["user"]["id"] for m in body["members"]] == [owner.id]
        assert body["member_count"] == 1

    async def test_requires_an_account(self, client: AsyncClient) -> None:
        assert (await client.post(HOUSEHOLDS, json={"name": "Nope"})).status_code == 401

    async def test_lists_only_your_own(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        mine = await client.get(HOUSEHOLDS, headers=owner.headers)
        theirs = await client.get(HOUSEHOLDS, headers=outsider.headers)

        assert [h["id"] for h in mine.json()] == [household["id"]]
        assert theirs.json() == []


class TestPrivacy:
    async def test_a_non_member_gets_404_not_403(
        self, client: AsyncClient, outsider: Account, household: dict
    ) -> None:
        """403 would confirm the household exists, letting anyone enumerate ids and
        learn who lives with whom. To an outsider it must look simply absent."""
        response = await client.get(f"{HOUSEHOLDS}/{household['id']}", headers=outsider.headers)

        assert response.status_code == 404

    async def test_a_real_and_an_imaginary_household_look_identical(
        self, client: AsyncClient, outsider: Account, household: dict
    ) -> None:
        real = await client.get(f"{HOUSEHOLDS}/{household['id']}", headers=outsider.headers)
        imaginary = await client.get(f"{HOUSEHOLDS}/{uuid.uuid4()}", headers=outsider.headers)

        assert real.status_code == imaginary.status_code == 404
        assert real.json() == imaginary.json()

    async def test_a_non_member_cannot_see_the_stock(
        self, client: AsyncClient, outsider: Account, household: dict, tin: dict
    ) -> None:
        response = await client.get(
            f"{HOUSEHOLDS}/{household['id']}/stock", headers=outsider.headers
        )

        assert response.status_code == 404


class TestInvites:
    async def test_only_an_owner_can_invite(
        self, client: AsyncClient, flatmate: Account, shared_household: dict
    ) -> None:
        """The flatmate is a member, so the household is not a secret from them — this
        is a missing permission, which is a 403."""
        response = await client.post(
            f"{HOUSEHOLDS}/{shared_household['id']}/invites", headers=flatmate.headers, json={}
        )

        assert response.status_code == 403

    async def test_joining_with_a_code_adds_you_as_a_member(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites", headers=owner.headers, json={}
        )
        code = invite.json()["code"]

        response = await client.post(
            f"{HOUSEHOLDS}/join", headers=outsider.headers, json={"code": code}
        )

        assert response.status_code == 200
        assert response.json()["role"] == "member"
        assert response.json()["member_count"] == 2

    async def test_codes_avoid_ambiguous_characters(
        self, client: AsyncClient, owner: Account, household: dict
    ) -> None:
        """Codes get read aloud and retyped from a phone; O/0 and I/1/l are excluded."""
        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites", headers=owner.headers, json={}
        )

        code = invite.json()["code"]
        assert not set(code) & set("O0Il1")

    async def test_a_bad_code_is_404(self, client: AsyncClient, outsider: Account) -> None:
        response = await client.post(
            f"{HOUSEHOLDS}/join", headers=outsider.headers, json={"code": "NOTREAL2"}
        )

        assert response.status_code == 404

    async def test_an_expired_invite_is_410(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict, db
    ) -> None:
        """410 Gone, not 404: the code was real, so the user should ask for a fresh one
        rather than re-check their typing."""
        from datetime import UTC, datetime, timedelta

        from sqlalchemy import select

        from app.models.household import HouseholdInvite

        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites", headers=owner.headers, json={}
        )
        code = invite.json()["code"]
        row = await db.scalar(select(HouseholdInvite).where(HouseholdInvite.code == code))
        row.expires_at = datetime.now(UTC) - timedelta(days=1)
        await db.flush()

        response = await client.post(
            f"{HOUSEHOLDS}/join", headers=outsider.headers, json={"code": code}
        )

        assert response.status_code == 410

    async def test_an_invite_cannot_be_reused(
        self,
        client: AsyncClient,
        owner: Account,
        outsider: Account,
        flatmate: Account,
        household: dict,
    ) -> None:
        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites", headers=owner.headers, json={}
        )
        code = invite.json()["code"]
        await client.post(f"{HOUSEHOLDS}/join", headers=outsider.headers, json={"code": code})

        second = await client.post(
            f"{HOUSEHOLDS}/join", headers=flatmate.headers, json={"code": code}
        )

        assert second.status_code == 404

    async def test_joining_twice_is_409(
        self, client: AsyncClient, owner: Account, flatmate: Account, shared_household: dict
    ) -> None:
        invite = await client.post(
            f"{HOUSEHOLDS}/{shared_household['id']}/invites", headers=owner.headers, json={}
        )

        response = await client.post(
            f"{HOUSEHOLDS}/join",
            headers=flatmate.headers,
            json={"code": invite.json()["code"]},
        )

        assert response.status_code == 409

    async def test_accepted_invites_drop_off_the_pending_list(
        self, client: AsyncClient, owner: Account, shared_household: dict
    ) -> None:
        response = await client.get(
            f"{HOUSEHOLDS}/{shared_household['id']}/invites", headers=owner.headers
        )

        assert response.json() == []

    async def test_an_owner_can_revoke_an_invite(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites", headers=owner.headers, json={}
        )
        body = invite.json()

        revoked = await client.delete(
            f"{HOUSEHOLDS}/{household['id']}/invites/{body['id']}", headers=owner.headers
        )

        assert revoked.status_code == 204
        used = await client.post(
            f"{HOUSEHOLDS}/join", headers=outsider.headers, json={"code": body["code"]}
        )
        assert used.status_code == 404


class TestMembership:
    async def test_an_owner_can_remove_a_member(
        self, client: AsyncClient, owner: Account, flatmate: Account, shared_household: dict
    ) -> None:
        response = await client.delete(
            f"{HOUSEHOLDS}/{shared_household['id']}/members/{flatmate.id}", headers=owner.headers
        )

        assert response.status_code == 204
        assert (
            await client.get(f"{HOUSEHOLDS}/{shared_household['id']}", headers=flatmate.headers)
        ).status_code == 404

    async def test_a_member_can_leave(
        self, client: AsyncClient, flatmate: Account, shared_household: dict
    ) -> None:
        response = await client.delete(
            f"{HOUSEHOLDS}/{shared_household['id']}/members/{flatmate.id}",
            headers=flatmate.headers,
        )

        assert response.status_code == 204

    async def test_a_member_cannot_remove_someone_else(
        self, client: AsyncClient, owner: Account, flatmate: Account, shared_household: dict
    ) -> None:
        response = await client.delete(
            f"{HOUSEHOLDS}/{shared_household['id']}/members/{owner.id}", headers=flatmate.headers
        )

        assert response.status_code == 403

    async def test_the_last_owner_cannot_leave(
        self, client: AsyncClient, owner: Account, shared_household: dict
    ) -> None:
        """Otherwise the household is left with nobody able to invite, rename or delete
        it, and no way for the remaining members to promote themselves."""
        response = await client.delete(
            f"{HOUSEHOLDS}/{shared_household['id']}/members/{owner.id}", headers=owner.headers
        )

        assert response.status_code == 409
        assert "only owner" in response.json()["detail"].lower()


class TestRenameAndDelete:
    async def test_an_owner_can_rename(
        self, client: AsyncClient, owner: Account, household: dict
    ) -> None:
        response = await client.patch(
            f"{HOUSEHOLDS}/{household['id']}", headers=owner.headers, json={"name": "The Tea Room"}
        )

        assert response.json()["name"] == "The Tea Room"

    async def test_a_member_cannot_rename(
        self, client: AsyncClient, flatmate: Account, shared_household: dict
    ) -> None:
        response = await client.patch(
            f"{HOUSEHOLDS}/{shared_household['id']}",
            headers=flatmate.headers,
            json={"name": "Mine Now"},
        )

        assert response.status_code == 403

    async def test_deleting_takes_the_stock_with_it(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        response = await client.delete(f"{HOUSEHOLDS}/{household['id']}", headers=owner.headers)

        assert response.status_code == 204
        assert (await client.get(HOUSEHOLDS, headers=owner.headers)).json() == []
