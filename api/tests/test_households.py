import uuid

from httpx import AsyncClient

from tests.conftest import Account

# Reused rather than re-rolled: "is a friend" is the whole authorisation rule for a named
# invite, and a local fixture that inserted the `friendship` row by hand would be testing
# a friendship the application never made.
from tests.test_friends import befriend, send

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


class TestInvitingAFriend:
    """M6h: the same invite, addressed to somebody instead of to whoever holds a string.

    Every test here goes through `befriend` rather than poking `friendship` directly,
    because "is a friend" is the entire authorisation rule and a fixture that fabricated
    the row would be testing a different rule from the one the app enforces.
    """

    async def test_only_an_owner_can_invite_a_friend(
        self,
        client: AsyncClient,
        owner: Account,
        flatmate: Account,
        outsider: Account,
        shared_household: dict,
    ) -> None:
        """The same 403 the code route gives a member: they can see the household, so its
        existence is not the secret — only the permission is missing."""
        await befriend(client, flatmate, outsider)

        response = await client.post(
            f"{HOUSEHOLDS}/{shared_household['id']}/invites/friend",
            headers=flatmate.headers,
            json={"user_id": outsider.id},
        )

        assert response.status_code == 403

    async def test_a_non_member_gets_the_same_404_as_for_the_household_itself(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        await befriend(client, owner, outsider)

        response = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=outsider.headers,
            json={"user_id": owner.id},
        )

        assert response.status_code == 404

    async def test_you_cannot_invite_somebody_who_is_not_your_friend(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        """Without this the endpoint takes any uuid, and a household invite becomes a way
        to put your household's name in a stranger's list."""
        response = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )

        assert response.status_code == 404

    async def test_a_pending_request_is_not_yet_a_friendship(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        """ "I asked them" is not "they said yes", and only the second one may be invited."""
        await send(client, owner, outsider)

        response = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )

        assert response.status_code == 404

    async def test_a_stranger_a_blocker_and_a_ghost_are_byte_identical(
        self,
        client: AsyncClient,
        owner: Account,
        flatmate: Account,
        outsider: Account,
        household: dict,
    ) -> None:
        """Somebody who blocked you must not be distinguishable from somebody who never
        existed. If the refusals differ, blocking announces itself by which error the
        blocked person collects."""
        await befriend(client, owner, flatmate)
        blocked = await client.post(f"/api/v1/friends/{owner.id}/block", headers=flatmate.headers)
        assert blocked.status_code == 204

        async def invite(user_id: str):
            return await client.post(
                f"{HOUSEHOLDS}/{household['id']}/invites/friend",
                headers=owner.headers,
                json={"user_id": user_id},
            )

        blocker = await invite(flatmate.id)
        stranger = await invite(outsider.id)
        ghost = await invite(str(uuid.uuid4()))

        assert blocker.status_code == stranger.status_code == ghost.status_code == 404
        assert blocker.json() == stranger.json() == ghost.json()

    async def test_an_invited_friend_gets_a_named_invite_and_no_code(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        """No code, deliberately. A code on a named invite would be forwardable, which is
        exactly the thing "invite my flatmate" is not supposed to be."""
        await befriend(client, owner, outsider)

        response = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["code"] is None
        assert body["invited_user"]["id"] == outsider.id
        assert body["declined_at"] is None

    async def test_the_invited_person_sees_it_waiting_for_them(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        """An invitation nobody is ever shown is not a feature."""
        await befriend(client, owner, outsider)
        await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )

        waiting = await client.get(f"{HOUSEHOLDS}/invitations", headers=outsider.headers)

        assert waiting.status_code == 200
        rows = waiting.json()
        assert len(rows) == 1
        assert rows[0]["household"]["name"] == "Flat 3B"
        assert rows[0]["invited_by"]["id"] == owner.id
        # Nobody else's business, and nothing to relay.
        assert "code" not in rows[0]

    async def test_nobody_else_sees_somebody_elses_invitation(
        self,
        client: AsyncClient,
        owner: Account,
        flatmate: Account,
        outsider: Account,
        household: dict,
    ) -> None:
        await befriend(client, owner, outsider)
        await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )

        theirs = await client.get(f"{HOUSEHOLDS}/invitations", headers=flatmate.headers)

        assert theirs.json() == []

    async def test_accepting_an_invitation_makes_you_a_member(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        await befriend(client, owner, outsider)
        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )

        joined = await client.post(
            f"{HOUSEHOLDS}/invitations/{invite.json()['id']}/accept", headers=outsider.headers
        )

        assert joined.status_code == 200
        assert joined.json()["role"] == "member"
        assert joined.json()["member_count"] == 2
        # And it stops asking.
        assert (
            await client.get(f"{HOUSEHOLDS}/invitations", headers=outsider.headers)
        ).json() == []

    async def test_only_the_named_person_can_accept_it(
        self,
        client: AsyncClient,
        owner: Account,
        flatmate: Account,
        outsider: Account,
        household: dict,
    ) -> None:
        """The invitation id is a capability. A 403 would confirm it exists to somebody it
        was never addressed to."""
        await befriend(client, owner, outsider)
        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )

        response = await client.post(
            f"{HOUSEHOLDS}/invitations/{invite.json()['id']}/accept", headers=flatmate.headers
        )

        assert response.status_code == 404

    async def test_declining_records_a_refusal_rather_than_deleting_it(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict, db
    ) -> None:
        """The owner is administering a member list and is entitled to stop waiting, so a
        household "no" is stamped where a friend-request "no" is deleted."""
        from sqlalchemy import select

        from app.models.household import HouseholdInvite

        await befriend(client, owner, outsider)
        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )
        invite_id = invite.json()["id"]

        declined = await client.post(
            f"{HOUSEHOLDS}/invitations/{invite_id}/decline", headers=outsider.headers
        )

        assert declined.status_code == 204
        # Gone from their list…
        assert (
            await client.get(f"{HOUSEHOLDS}/invitations", headers=outsider.headers)
        ).json() == []
        # …and still a row, stamped, so the owner can see the answer.
        row = await db.scalar(
            select(HouseholdInvite).where(HouseholdInvite.id == uuid.UUID(invite_id))
        )
        assert row is not None
        assert row.declined_at is not None
        owners_view = await client.get(
            f"{HOUSEHOLDS}/{household['id']}/invites", headers=owner.headers
        )
        assert owners_view.json()[0]["declined_at"] is not None

    async def test_a_declined_invitation_cannot_then_be_accepted(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        await befriend(client, owner, outsider)
        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )
        invite_id = invite.json()["id"]
        await client.post(f"{HOUSEHOLDS}/invitations/{invite_id}/decline", headers=outsider.headers)

        response = await client.post(
            f"{HOUSEHOLDS}/invitations/{invite_id}/accept", headers=outsider.headers
        )

        assert response.status_code == 404

    async def test_somebody_who_declined_can_be_asked_again(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        """A refusal is not a block. People move house, and the partial unique index is
        scoped to *open* invitations precisely so the second ask is possible."""
        await befriend(client, owner, outsider)
        first = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )
        await client.post(
            f"{HOUSEHOLDS}/invitations/{first.json()['id']}/decline", headers=outsider.headers
        )

        second = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )

        assert second.status_code == 201
        assert second.json()["id"] != first.json()["id"]

    async def test_inviting_the_same_friend_twice_is_409(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        await befriend(client, owner, outsider)
        await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )

        second = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )

        assert second.status_code == 409
        # One row, not two: the second ask must not quietly stack up another invitation.
        waiting = await client.get(f"{HOUSEHOLDS}/invitations", headers=outsider.headers)
        assert len(waiting.json()) == 1

    async def test_inviting_somebody_already_in_the_household_is_409(
        self, client: AsyncClient, owner: Account, flatmate: Account, shared_household: dict
    ) -> None:
        await befriend(client, owner, flatmate)

        response = await client.post(
            f"{HOUSEHOLDS}/{shared_household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": flatmate.id},
        )

        assert response.status_code == 409
        assert "already in this household" in response.json()["detail"]

    async def test_membership_is_not_leaked_to_somebody_who_is_not_a_friend(
        self, client: AsyncClient, owner: Account, flatmate: Account, shared_household: dict
    ) -> None:
        """Friendship is checked *before* membership. Answering "they already live here"
        about somebody you are not connected to is the fact the whole household surface
        answers 404 to protect."""
        response = await client.post(
            f"{HOUSEHOLDS}/{shared_household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": flatmate.id},
        )

        assert response.status_code == 404

    async def test_an_invitation_for_a_household_you_already_joined_stops_asking(
        self, client: AsyncClient, owner: Account, flatmate: Account, household: dict
    ) -> None:
        """The race: invited on Tuesday, joined with a code on Wednesday. The button would
        only ever answer 409, so the row stops being offered."""
        await befriend(client, owner, flatmate)
        await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": flatmate.id},
        )
        code_invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites", headers=owner.headers, json={}
        )
        joined = await client.post(
            f"{HOUSEHOLDS}/join",
            headers=flatmate.headers,
            json={"code": code_invite.json()["code"]},
        )
        assert joined.status_code == 200

        waiting = await client.get(f"{HOUSEHOLDS}/invitations", headers=flatmate.headers)

        assert waiting.json() == []

    async def test_an_expired_invitation_is_410(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict, db
    ) -> None:
        from datetime import UTC, datetime, timedelta

        from sqlalchemy import select

        from app.models.household import HouseholdInvite

        await befriend(client, owner, outsider)
        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )
        invite_id = invite.json()["id"]
        row = await db.scalar(
            select(HouseholdInvite).where(HouseholdInvite.id == uuid.UUID(invite_id))
        )
        row.expires_at = datetime.now(UTC) - timedelta(days=1)
        await db.flush()

        response = await client.post(
            f"{HOUSEHOLDS}/invitations/{invite_id}/accept", headers=outsider.headers
        )

        assert response.status_code == 410

    async def test_an_owner_can_revoke_a_named_invite_with_the_same_endpoint(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        """One revoke for both flavours — the whole reason this is one table."""
        await befriend(client, owner, outsider)
        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )
        invite_id = invite.json()["id"]

        revoked = await client.delete(
            f"{HOUSEHOLDS}/{household['id']}/invites/{invite_id}", headers=owner.headers
        )

        assert revoked.status_code == 204
        assert (
            await client.get(f"{HOUSEHOLDS}/invitations", headers=outsider.headers)
        ).json() == []
        accepted = await client.post(
            f"{HOUSEHOLDS}/invitations/{invite_id}/accept", headers=outsider.headers
        )
        assert accepted.status_code == 404


class TestTheTwoFlavoursCannotCross:
    """The M3 code path and the M6h named path share a table and must share nothing else.

    Both directions are asserted, because a bug in either one is a way to join a household
    you were not offered.
    """

    async def test_a_named_invite_carries_nothing_the_join_route_could_redeem(
        self,
        client: AsyncClient,
        owner: Account,
        outsider: Account,
        flatmate: Account,
        household: dict,
        db,
    ) -> None:
        from sqlalchemy import select

        from app.models.household import HouseholdInvite

        await befriend(client, owner, outsider)
        invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )
        invite_id = invite.json()["id"]

        row = await db.scalar(
            select(HouseholdInvite).where(HouseholdInvite.id == uuid.UUID(invite_id))
        )
        assert row.code is None

        # The id is the only string a named invite has, and it is not a code.
        used_as_code = await client.post(
            f"{HOUSEHOLDS}/join", headers=flatmate.headers, json={"code": invite_id[:32]}
        )
        assert used_as_code.status_code == 404

    async def test_a_code_invite_cannot_be_accepted_as_an_invitation(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        """`invited_user_id IS NULL` can never equal a real account id, so the named accept
        path cannot reach a bearer code however it is addressed."""
        code_invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites", headers=owner.headers, json={}
        )

        response = await client.post(
            f"{HOUSEHOLDS}/invitations/{code_invite.json()['id']}/accept",
            headers=outsider.headers,
        )

        assert response.status_code == 404

    async def test_a_code_invite_cannot_be_declined(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        """Nobody is named, so there is no refusal to record — and stamping one would
        silently retire a code other people are still holding."""
        code_invite = await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites", headers=owner.headers, json={}
        )

        response = await client.post(
            f"{HOUSEHOLDS}/invitations/{code_invite.json()['id']}/decline",
            headers=outsider.headers,
        )

        assert response.status_code == 404
        still_works = await client.post(
            f"{HOUSEHOLDS}/join",
            headers=outsider.headers,
            json={"code": code_invite.json()["code"]},
        )
        assert still_works.status_code == 200

    async def test_the_owners_pending_list_carries_both_flavours(
        self, client: AsyncClient, owner: Account, outsider: Account, household: dict
    ) -> None:
        await befriend(client, owner, outsider)
        await client.post(f"{HOUSEHOLDS}/{household['id']}/invites", headers=owner.headers, json={})
        await client.post(
            f"{HOUSEHOLDS}/{household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": outsider.id},
        )

        listed = await client.get(f"{HOUSEHOLDS}/{household['id']}/invites", headers=owner.headers)

        rows = listed.json()
        assert len(rows) == 2
        named = [r for r in rows if r["invited_user"] is not None]
        coded = [r for r in rows if r["code"] is not None]
        assert len(named) == len(coded) == 1
        # Exactly one flavour each, which is the CHECK constraint seen from the outside.
        assert named[0]["code"] is None
        assert coded[0]["invited_user"] is None


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


class TestWhichRefusalComesFirst:
    """The one ordering question `invite_friend` has to answer, pinned.

    An earlier version of the docstring claimed the order was a privacy rule — that
    answering "already a member" to a non-friend would leak who lives with whom. It would
    not: the route is behind `Ownership`, and an owner can read their own member list on
    the same page. Both orders are safe, so this records the one we picked rather than
    defending it as a boundary.
    """

    async def test_a_non_friend_who_is_already_a_member_is_still_answered_as_a_non_friend(
        self, client: AsyncClient, owner: Account, flatmate: Account, shared_household: dict
    ) -> None:
        # flatmate is in the household (shared_household put them there) and is *not* a
        # friend of owner. Friendship is checked first, so this is 404, not 409.
        response = await client.post(
            f"/api/v1/households/{shared_household['id']}/invites/friend",
            headers=owner.headers,
            json={"user_id": flatmate.id},
        )
        assert response.status_code == 404, response.text
        assert response.json()["detail"] == "No such friend"
