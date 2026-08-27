import uuid

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from tests.conftest import Account

ME = "/api/v1/auth/me"


def profile_url(user_id: str) -> str:
    return f"/api/v1/users/{user_id}/profile"


class TestPublicProfile:
    async def test_a_stranger_can_read_it(self, client: AsyncClient, owner: Account) -> None:
        response = await client.get(profile_url(owner.id))

        assert response.status_code == 200
        assert response.json()["display_name"] == "Owner"

    async def test_it_never_carries_an_email(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        """An email appears in friend and household contexts, where the two of you are
        already connected. A profile is reachable by anyone holding the id."""
        signed_out = await client.get(profile_url(owner.id))
        as_a_friend = await client.get(profile_url(owner.id), headers=flatmate.headers)

        for response in (signed_out, as_a_friend):
            assert "email" not in response.json()
            assert "example.com" not in response.text

    async def test_friend_state_is_null_when_signed_out(
        self, client: AsyncClient, owner: Account
    ) -> None:
        assert (await client.get(profile_url(owner.id))).json()["friend_state"] is None

    async def test_your_own_profile_says_self(self, client: AsyncClient, owner: Account) -> None:
        response = await client.get(profile_url(owner.id), headers=owner.headers)

        assert response.json()["friend_state"] == "self"

    async def test_a_friend_is_reported_as_one(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        request = await client.post(
            "/api/v1/friends/requests", headers=owner.headers, json={"user_id": flatmate.id}
        )
        await client.post(
            f"/api/v1/friends/requests/{request.json()['id']}/accept", headers=flatmate.headers
        )

        response = await client.get(profile_url(flatmate.id), headers=owner.headers)

        assert response.json()["friend_state"] == "friends"

    async def test_a_pending_request_reads_from_each_side(
        self, client: AsyncClient, owner: Account, flatmate: Account
    ) -> None:
        await client.post(
            "/api/v1/friends/requests", headers=owner.headers, json={"user_id": flatmate.id}
        )

        sender = await client.get(profile_url(flatmate.id), headers=owner.headers)
        recipient = await client.get(profile_url(owner.id), headers=flatmate.headers)

        assert sender.json()["friend_state"] == "outgoing"
        assert recipient.json()["friend_state"] == "incoming"

    async def test_an_unknown_person_is_404(self, client: AsyncClient) -> None:
        assert (await client.get(profile_url(str(uuid.uuid4())))).status_code == 404

    async def test_a_deactivated_account_is_indistinguishable_from_one_that_never_existed(
        self, client: AsyncClient, owner: Account, db: AsyncSession
    ) -> None:
        """Saying "this person left" still tells a stranger they were here."""
        user = await db.scalar(select(User).where(User.email == "owner@example.com"))
        assert user is not None
        user.is_active = False
        await db.flush()

        gone = await client.get(profile_url(owner.id))
        imaginary = await client.get(profile_url(str(uuid.uuid4())))

        assert gone.status_code == imaginary.status_code == 404
        assert gone.json() == imaginary.json()


class TestProfileStats:
    async def test_counts_start_at_zero(self, client: AsyncClient, owner: Account) -> None:
        body = (await client.get(profile_url(owner.id))).json()

        assert body["review_count"] == 0
        assert body["average_score_given"] is None
        assert body["household_count"] == 0
        assert body["recent_reviews"] == []

    async def test_reports_how_generous_a_rater_they_are(
        self, client: AsyncClient, owner: Account, tea, catalog_fixtures
    ) -> None:
        """A 7 from somebody who averages 5 is not a 7 from somebody who averages 9."""
        await client.put(
            f"/api/v1/catalog/teas/{tea.slug}/review", headers=owner.headers, json={"score": 9}
        )
        await client.put(
            "/api/v1/catalog/teas/mint-green/review", headers=owner.headers, json={"score": 6}
        )

        body = (await client.get(profile_url(owner.id))).json()

        assert body["review_count"] == 2
        assert body["average_score_given"] == 7.5

    async def test_recent_reviews_carry_their_tea(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        await client.put(
            f"/api/v1/catalog/teas/{tea.slug}/review",
            headers=owner.headers,
            json={"score": 8, "body": "Grassy."},
        )

        review = (await client.get(profile_url(owner.id))).json()["recent_reviews"][0]

        assert review["tea"]["slug"] == tea.slug
        assert review["score"] == 8
        assert review["body"] == "Grassy."

    async def test_counts_the_households_they_belong_to(
        self, client: AsyncClient, owner: Account, household: dict
    ) -> None:
        assert (await client.get(profile_url(owner.id))).json()["household_count"] == 1


class TestEditingYourOwn:
    async def test_sets_the_personal_fields(self, client: AsyncClient, owner: Account) -> None:
        response = await client.patch(
            ME,
            headers=owner.headers,
            json={
                "pronouns": "they/them",
                "bio": "Mostly oolong, occasionally persuaded otherwise.",
                "location": "Kraków",
                "favourite_tea_type": "oolong",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["pronouns"] == "they/them"
        assert body["location"] == "Kraków"
        assert body["favourite_tea_type"] == "oolong"

    async def test_a_partial_edit_leaves_the_rest_alone(
        self, client: AsyncClient, owner: Account
    ) -> None:
        await client.patch(ME, headers=owner.headers, json={"bio": "Tea.", "location": "Kraków"})

        response = await client.patch(ME, headers=owner.headers, json={"location": "Warsaw"})

        assert response.json()["location"] == "Warsaw"
        assert response.json()["bio"] == "Tea."
        assert response.json()["display_name"] == "Owner"

    async def test_null_clears_a_field(self, client: AsyncClient, owner: Account) -> None:
        await client.patch(ME, headers=owner.headers, json={"bio": "Tea."})

        response = await client.patch(ME, headers=owner.headers, json={"bio": None})

        assert response.json()["bio"] is None

    async def test_rejects_an_unknown_tea_type(self, client: AsyncClient, owner: Account) -> None:
        response = await client.patch(
            ME, headers=owner.headers, json={"favourite_tea_type": "coffee"}
        )

        assert response.status_code == 422

    async def test_rejects_an_overlong_bio(self, client: AsyncClient, owner: Account) -> None:
        response = await client.patch(ME, headers=owner.headers, json={"bio": "x" * 1001})

        assert response.status_code == 422

    async def test_you_cannot_promote_yourself(self, client: AsyncClient, owner: Account) -> None:
        """`role` is absent from ProfileUpdate, so it is ignored rather than obeyed —
        a role you can set yourself is not a role."""
        response = await client.patch(ME, headers=owner.headers, json={"role": "admin"})

        assert response.json()["role"] == "user"

    async def test_you_cannot_change_your_email_here(
        self, client: AsyncClient, owner: Account
    ) -> None:
        """Changing an identity wants its own confirmation flow, not a profile PATCH."""
        response = await client.patch(
            ME, headers=owner.headers, json={"email": "someone.else@example.com"}
        )

        assert response.json()["email"] == "owner@example.com"

    async def test_the_edit_shows_up_on_the_public_profile(
        self, client: AsyncClient, owner: Account
    ) -> None:
        await client.patch(ME, headers=owner.headers, json={"bio": "Mostly oolong."})

        assert (await client.get(profile_url(owner.id))).json()["bio"] == "Mostly oolong."

    async def test_requires_an_account(self, client: AsyncClient) -> None:
        assert (await client.patch(ME, json={"bio": "hello"})).status_code == 401
