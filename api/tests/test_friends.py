import uuid

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.friendship import Friendship
from tests.conftest import Account

FRIENDS = "/api/v1/friends"
REQUESTS = f"{FRIENDS}/requests"


async def send(client: AsyncClient, sender: Account, target: Account) -> dict:
    response = await client.post(REQUESTS, headers=sender.headers, json={"user_id": target.id})
    assert response.status_code == 201, response.text
    return response.json()


async def befriend(client: AsyncClient, a: Account, b: Account) -> None:
    request = await send(client, a, b)
    accepted = await client.post(f"{REQUESTS}/{request['id']}/accept", headers=b.headers)
    assert accepted.status_code == 200, accepted.text


class TestRequesting:
    async def test_a_request_is_outgoing_for_one_and_incoming_for_the_other(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        """The row is symmetric; the reading is not."""
        await send(client, owner, flatmate)

        mine = (await client.get(REQUESTS, headers=owner.headers)).json()
        theirs = (await client.get(REQUESTS, headers=flatmate.headers)).json()

        assert [r["direction"] for r in mine] == ["outgoing"]
        assert [r["direction"] for r in theirs] == ["incoming"]
        assert theirs[0]["user"]["display_name"] == "Owner"

    async def test_you_cannot_befriend_yourself(self, client: AsyncClient, owner: Account) -> None:
        response = await client.post(REQUESTS, headers=owner.headers, json={"user_id": owner.id})

        assert response.status_code == 400

    async def test_only_one_row_exists_per_pair_whichever_way_round(
        self, client: AsyncClient, owner: Account, flatmate: Account, db: AsyncSession
    ) -> None:
        """The canonical ordering is what makes the duplicate unrepresentable."""
        await send(client, owner, flatmate)

        reversed_attempt = await client.post(
            REQUESTS, headers=flatmate.headers, json={"user_id": owner.id}
        )

        assert reversed_attempt.status_code == 409
        assert await db.scalar(select(func.count()).select_from(Friendship)) == 1

    async def test_requesting_twice_is_409(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await send(client, owner, flatmate)

        again = await client.post(REQUESTS, headers=owner.headers, json={"user_id": flatmate.id})

        assert again.status_code == 409

    async def test_requesting_an_existing_friend_is_409(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await befriend(client, owner, flatmate)

        response = await client.post(REQUESTS, headers=owner.headers, json={"user_id": flatmate.id})

        assert response.status_code == 409
        assert "already friends" in response.json()["detail"].lower()

    async def test_an_unknown_user_is_404(self, client: AsyncClient, owner: Account) -> None:
        response = await client.post(
            REQUESTS, headers=owner.headers, json={"user_id": str(uuid.uuid4())}
        )

        assert response.status_code == 404


class TestAccepting:
    async def test_accepting_makes_you_both_friends(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await befriend(client, owner, flatmate)

        mine = (await client.get(FRIENDS, headers=owner.headers)).json()
        theirs = (await client.get(FRIENDS, headers=flatmate.headers)).json()

        assert [f["user"]["display_name"] for f in mine] == ["Flatmate"]
        assert [f["user"]["display_name"] for f in theirs] == ["Owner"]

    async def test_the_sender_cannot_accept_their_own_request(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        request = await send(client, owner, flatmate)

        response = await client.post(f"{REQUESTS}/{request['id']}/accept", headers=owner.headers)

        assert response.status_code == 404

    async def test_a_stranger_cannot_accept_someone_elses_request(
        self, client: AsyncClient, owner: Account, flatmate: Account, outsider: Account
    ) -> None:
        request = await send(client, owner, flatmate)

        response = await client.post(f"{REQUESTS}/{request['id']}/accept", headers=outsider.headers)

        assert response.status_code == 404

    async def test_accepted_requests_leave_the_request_list(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await befriend(client, owner, flatmate)

        assert (await client.get(REQUESTS, headers=owner.headers)).json() == []


class TestDecliningAndCancelling:
    async def test_the_recipient_can_decline(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        request = await send(client, owner, flatmate)

        response = await client.delete(f"{REQUESTS}/{request['id']}", headers=flatmate.headers)

        assert response.status_code == 204
        assert (await client.get(REQUESTS, headers=owner.headers)).json() == []

    async def test_the_sender_can_cancel(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        request = await send(client, owner, flatmate)

        response = await client.delete(f"{REQUESTS}/{request['id']}", headers=owner.headers)

        assert response.status_code == 204

    async def test_declining_leaves_no_trace_so_they_can_ask_again(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        request = await send(client, owner, flatmate)
        await client.delete(f"{REQUESTS}/{request['id']}", headers=flatmate.headers)

        again = await client.post(REQUESTS, headers=owner.headers, json={"user_id": flatmate.id})

        assert again.status_code == 201


class TestUnfriending:
    async def test_removes_the_friendship_for_both(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await befriend(client, owner, flatmate)

        response = await client.delete(f"{FRIENDS}/{flatmate.id}", headers=owner.headers)

        assert response.status_code == 204
        assert (await client.get(FRIENDS, headers=flatmate.headers)).json() == []


class TestBlocking:
    async def test_blocking_removes_an_existing_friendship(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await befriend(client, owner, flatmate)

        response = await client.post(f"{FRIENDS}/{flatmate.id}/block", headers=owner.headers)

        assert response.status_code == 204
        assert (await client.get(FRIENDS, headers=owner.headers)).json() == []
        assert (await client.get(FRIENDS, headers=flatmate.headers)).json() == []

    async def test_a_blocked_person_gets_404_not_a_hint(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        """Telling them "you are blocked" is the one thing a block must not do — it is
        indistinguishable from the user not existing."""
        await client.post(f"{FRIENDS}/{flatmate.id}/block", headers=owner.headers)

        blocked_attempt = await client.post(
            REQUESTS, headers=flatmate.headers, json={"user_id": owner.id}
        )
        unknown_attempt = await client.post(
            REQUESTS, headers=flatmate.headers, json={"user_id": str(uuid.uuid4())}
        )

        assert blocked_attempt.status_code == unknown_attempt.status_code == 404
        assert blocked_attempt.json() == unknown_attempt.json()

    async def test_the_blocked_person_cannot_lift_the_block(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await client.post(f"{FRIENDS}/{flatmate.id}/block", headers=owner.headers)

        response = await client.delete(f"{FRIENDS}/{owner.id}/block", headers=flatmate.headers)

        assert response.status_code == 404

    async def test_the_blocker_can_lift_it(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await client.post(f"{FRIENDS}/{flatmate.id}/block", headers=owner.headers)

        response = await client.delete(f"{FRIENDS}/{flatmate.id}/block", headers=owner.headers)

        assert response.status_code == 204
        assert (
            await client.post(REQUESTS, headers=flatmate.headers, json={"user_id": owner.id})
        ).status_code == 201

    async def test_blocked_people_are_listed_for_the_blocker_only(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await client.post(f"{FRIENDS}/{flatmate.id}/block", headers=owner.headers)

        assert len((await client.get(f"{FRIENDS}/blocked", headers=owner.headers)).json()) == 1
        assert (await client.get(f"{FRIENDS}/blocked", headers=flatmate.headers)).json() == []


class TestSearch:
    async def test_finds_people_by_partial_display_name(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        results = (await client.get("/api/v1/users/search?q=flat", headers=owner.headers)).json()

        assert [r["user"]["display_name"] for r in results] == ["Flatmate"]
        assert results[0]["state"] == "none"

    async def test_reports_the_relationship_state(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await send(client, owner, flatmate)

        as_sender = (await client.get("/api/v1/users/search?q=flat", headers=owner.headers)).json()
        as_recipient = (
            await client.get("/api/v1/users/search?q=owner", headers=flatmate.headers)
        ).json()

        assert as_sender[0]["state"] == "outgoing"
        assert as_recipient[0]["state"] == "incoming"

    async def test_email_matches_only_in_full(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        """A partial email match would turn the box into an address-enumeration tool."""
        partial = (
            await client.get("/api/v1/users/search?q=@example.com", headers=owner.headers)
        ).json()
        exact = (
            await client.get("/api/v1/users/search?q=flatmate@example.com", headers=owner.headers)
        ).json()

        assert partial == []
        assert [r["user"]["display_name"] for r in exact] == ["Flatmate"]

    async def test_never_returns_you(self, client: AsyncClient, owner: Account) -> None:
        results = (await client.get("/api/v1/users/search?q=owner", headers=owner.headers)).json()

        assert results == []

    async def test_a_one_character_query_returns_nothing(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        assert (await client.get("/api/v1/users/search?q=f", headers=owner.headers)).json() == []

    async def test_someone_who_blocked_you_is_simply_absent(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await client.post(f"{FRIENDS}/{flatmate.id}/block", headers=owner.headers)

        results = (
            await client.get("/api/v1/users/search?q=owner", headers=flatmate.headers)
        ).json()

        assert results == []


class TestFeed:
    async def test_is_empty_before_you_have_friends(
        self, client: AsyncClient, owner: Account
    ) -> None:
        body = (await client.get("/api/v1/feed", headers=owner.headers)).json()

        assert body["total"] == 0

    async def test_a_friends_review_appears(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea
    ) -> None:
        """The milestone's acceptance criterion."""
        await client.put(
            f"/api/v1/catalog/teas/{tea.slug}/review",
            headers=flatmate.headers,
            json={"score": 9, "body": "Excellent."},
        )
        assert (await client.get("/api/v1/feed", headers=owner.headers)).json()["total"] == 0

        await befriend(client, owner, flatmate)

        body = (await client.get("/api/v1/feed", headers=owner.headers)).json()
        assert body["total"] == 1
        item = body["items"][0]
        assert item["kind"] == "review"
        assert item["actor"]["display_name"] == "Flatmate"
        assert item["tea"]["slug"] == tea.slug
        assert item["score"] == 9

    async def test_a_strangers_review_does_not(
        self, client: AsyncClient, owner: Account, outsider: Account, tea
    ) -> None:
        await client.put(
            f"/api/v1/catalog/teas/{tea.slug}/review",
            headers=outsider.headers,
            json={"score": 9},
        )

        assert (await client.get("/api/v1/feed", headers=owner.headers)).json()["total"] == 0

    async def test_unfriending_removes_their_reviews_from_the_feed(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea
    ) -> None:
        await client.put(
            f"/api/v1/catalog/teas/{tea.slug}/review", headers=flatmate.headers, json={"score": 7}
        )
        await befriend(client, owner, flatmate)

        await client.delete(f"{FRIENDS}/{flatmate.id}", headers=owner.headers)

        assert (await client.get("/api/v1/feed", headers=owner.headers)).json()["total"] == 0

    async def test_a_tin_added_to_your_household_appears(
        self, client: AsyncClient, owner: Account, household: dict, tin: dict
    ) -> None:
        body = (await client.get("/api/v1/feed", headers=owner.headers)).json()

        assert body["total"] == 1
        item = body["items"][0]
        assert item["kind"] == "stocked"
        assert item["household"]["name"] == "Flat 3B"
        assert item["actor"]["display_name"] == "Owner"
        assert item["grams"] == 100.0

    async def test_a_friends_household_stock_stays_private(
        self, client: AsyncClient, owner: Account, flatmate: Account, household: dict, tin: dict
    ) -> None:
        """Friendship widens what you see of someone's *opinions*, never of their shelf.
        The flatmate here is a friend but not a household member."""
        await befriend(client, owner, flatmate)

        body = (await client.get("/api/v1/feed", headers=flatmate.headers)).json()

        assert body["total"] == 0

    async def test_both_kinds_share_one_ordered_timeline(
        self,
        client: AsyncClient,
        owner: Account,
        flatmate: Account,
        household: dict,
        tin: dict,
        tea,
    ) -> None:
        await client.put(
            f"/api/v1/catalog/teas/{tea.slug}/review", headers=flatmate.headers, json={"score": 8}
        )
        await befriend(client, owner, flatmate)

        body = (await client.get("/api/v1/feed", headers=owner.headers)).json()

        assert body["total"] == 2
        assert {item["kind"] for item in body["items"]} == {"review", "stocked"}

    async def test_requires_an_account(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/feed")).status_code == 401
