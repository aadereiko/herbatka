from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.review import Review
from tests.conftest import Account

CATALOG = "/api/v1/catalog"
SLUG = "test-sencha"


def review_url(slug: str = SLUG) -> str:
    return f"{CATALOG}/teas/{slug}/review"


class TestWriting:
    async def test_creates_a_review(self, client: AsyncClient, owner: Account, tea) -> None:
        response = await client.put(
            review_url(),
            headers=owner.headers,
            json={"score": 9, "aroma": 8, "flavour": 9, "aftertaste": 7, "body": "Grassy."},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["score"] == 9
        assert body["aroma"] == 8
        assert body["author"]["display_name"] == "Owner"

    async def test_writing_twice_replaces_rather_than_duplicates(
        self, client: AsyncClient, owner: Account, tea, db: AsyncSession
    ) -> None:
        """A review is an opinion you revise, not an event log — hence PUT and a unique
        (user_id, tea_id)."""
        first = await client.put(review_url(), headers=owner.headers, json={"score": 6})
        second = await client.put(review_url(), headers=owner.headers, json={"score": 9})

        assert first.json()["id"] == second.json()["id"]
        assert second.json()["score"] == 9
        assert await db.scalar(select(func.count()).select_from(Review)) == 1

    async def test_a_full_replace_can_clear_a_subscore(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        """Omitting a field means "clear it", which is why the write is a replace: a
        merge-patch would make "remove the aroma score I gave" inexpressible."""
        await client.put(review_url(), headers=owner.headers, json={"score": 8, "aroma": 7})

        response = await client.put(review_url(), headers=owner.headers, json={"score": 8})

        assert response.json()["aroma"] is None

    async def test_two_people_each_keep_their_own(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea
    ) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 4})
        await client.put(review_url(), headers=flatmate.headers, json={"score": 10})

        listed = await client.get(f"{CATALOG}/teas/{SLUG}/reviews")
        assert sorted(r["score"] for r in listed.json()["items"]) == [4, 10]

    async def test_requires_an_account(self, client: AsyncClient, tea) -> None:
        assert (await client.put(review_url(), json={"score": 5})).status_code == 401

    async def test_rejects_a_score_out_of_range(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        for score in (0, 11, -3):
            response = await client.put(review_url(), headers=owner.headers, json={"score": score})
            assert response.status_code == 422, score

    async def test_rejects_a_subscore_out_of_range(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        response = await client.put(
            review_url(), headers=owner.headers, json={"score": 5, "flavour": 99}
        )

        assert response.status_code == 422

    async def test_cannot_review_an_unapproved_tea(
        self, client: AsyncClient, owner: Account, catalog_fixtures
    ) -> None:
        response = await client.put(
            review_url("secret-blend"), headers=owner.headers, json={"score": 5}
        )

        assert response.status_code == 404


class TestReading:
    async def test_the_list_is_public(self, client: AsyncClient, owner: Account, tea) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 7})

        response = await client.get(f"{CATALOG}/teas/{SLUG}/reviews")

        assert response.status_code == 200
        assert response.json()["total"] == 1

    async def test_newest_first(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea, db: AsyncSession
    ) -> None:
        """created_at is backdated explicitly: func.now() is transaction time in
        Postgres, so rows written in one test transaction would otherwise tie and prove
        nothing about ordering."""
        from datetime import UTC, datetime, timedelta

        await client.put(review_url(), headers=owner.headers, json={"score": 1})
        await client.put(review_url(), headers=flatmate.headers, json={"score": 2})

        older = await db.scalar(select(Review).where(Review.score == 1))
        older.created_at = datetime.now(UTC) - timedelta(days=1)
        await db.flush()

        items = (await client.get(f"{CATALOG}/teas/{SLUG}/reviews")).json()["items"]

        assert [r["score"] for r in items] == [2, 1]

    async def test_paging_is_stable_when_timestamps_tie(
        self, client: AsyncClient, owner: Account, flatmate: Account, outsider: Account, tea
    ) -> None:
        """All three share a created_at here. Without a deterministic tiebreak the two
        pages could overlap or skip a review."""
        for account, score in ((owner, 1), (flatmate, 2), (outsider, 3)):
            await client.put(review_url(), headers=account.headers, json={"score": score})

        first = (await client.get(f"{CATALOG}/teas/{SLUG}/reviews?page=1&size=2")).json()
        second = (await client.get(f"{CATALOG}/teas/{SLUG}/reviews?page=2&size=2")).json()

        ids = [r["id"] for r in first["items"]] + [r["id"] for r in second["items"]]
        assert len(set(ids)) == 3


class TestAggregates:
    async def test_an_unrated_tea_reports_null_not_zero(self, client: AsyncClient, tea) -> None:
        """0.0 reads as a terrible tea; null reads as an unrated one, and the card has
        to be able to tell them apart."""
        body = (await client.get(f"{CATALOG}/teas/{SLUG}")).json()

        assert body["average_score"] is None
        assert body["review_count"] == 0

    async def test_average_and_count_on_the_detail(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea
    ) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 8})
        await client.put(review_url(), headers=flatmate.headers, json={"score": 9})

        body = (await client.get(f"{CATALOG}/teas/{SLUG}")).json()

        assert body["average_score"] == 8.5
        assert body["review_count"] == 2

    async def test_the_average_is_rounded_to_one_decimal(
        self, client: AsyncClient, owner: Account, flatmate: Account, outsider: Account, tea
    ) -> None:
        for account, score in ((owner, 8), (flatmate, 9), (outsider, 9)):
            await client.put(review_url(), headers=account.headers, json={"score": score})

        assert (await client.get(f"{CATALOG}/teas/{SLUG}")).json()["average_score"] == 8.7

    async def test_subscore_averages_ignore_blanks(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea
    ) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 8, "aroma": 6})
        await client.put(review_url(), headers=flatmate.headers, json={"score": 8})

        body = (await client.get(f"{CATALOG}/teas/{SLUG}")).json()

        assert body["average_aroma"] == 6.0  # averaged over the one person who gave it
        assert body["average_flavour"] is None

    async def test_the_average_reaches_the_catalog_list(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 7})

        item = (await client.get(f"{CATALOG}/teas?q=Test Sencha")).json()["items"][0]

        assert item["average_score"] == 7.0
        assert item["review_count"] == 1

    async def test_a_rating_does_not_duplicate_the_tea_in_the_list(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea
    ) -> None:
        """The rating join must not multiply rows the way the ingredient join would."""
        await client.put(review_url(), headers=owner.headers, json={"score": 7})
        await client.put(review_url(), headers=flatmate.headers, json={"score": 8})

        body = (await client.get(f"{CATALOG}/teas?q=Test Sencha")).json()

        assert body["total"] == 1
        assert len(body["items"]) == 1


class TestYourOwnScore:
    async def test_my_score_is_null_when_signed_out(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 9})

        body = (await client.get(f"{CATALOG}/teas/{SLUG}")).json()

        assert body["my_score"] is None
        assert body["my_review"] is None
        assert body["average_score"] == 9.0  # the crowd average is still public

    async def test_my_score_is_separate_from_the_average(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea
    ) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 10})
        await client.put(review_url(), headers=flatmate.headers, json={"score": 4})

        body = (await client.get(f"{CATALOG}/teas/{SLUG}", headers=owner.headers)).json()

        assert body["my_score"] == 10
        assert body["average_score"] == 7.0

    async def test_my_score_appears_on_the_catalog_list(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 6})

        item = (await client.get(f"{CATALOG}/teas?q=Test Sencha", headers=owner.headers)).json()[
            "items"
        ][0]

        assert item["my_score"] == 6

    async def test_someone_elses_rating_is_not_mine(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea
    ) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 9})

        body = (await client.get(f"{CATALOG}/teas/{SLUG}", headers=flatmate.headers)).json()

        assert body["my_score"] is None
        assert body["average_score"] == 9.0

    async def test_an_expired_token_degrades_to_the_anonymous_view(
        self, client: AsyncClient, tea
    ) -> None:
        """A stale token must not turn the public catalog into a 401."""
        response = await client.get(
            f"{CATALOG}/teas/{SLUG}", headers={"Authorization": "Bearer nonsense"}
        )

        assert response.status_code == 200
        assert response.json()["my_score"] is None

    async def test_my_review_is_returned_on_the_detail(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 9, "body": "Lovely."})

        body = (await client.get(f"{CATALOG}/teas/{SLUG}", headers=owner.headers)).json()

        assert body["my_review"]["body"] == "Lovely."


class TestDeleting:
    async def test_removes_your_review_and_the_average(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 9})

        response = await client.delete(review_url(), headers=owner.headers)

        assert response.status_code == 204
        body = (await client.get(f"{CATALOG}/teas/{SLUG}")).json()
        assert body["average_score"] is None
        assert body["review_count"] == 0

    async def test_deleting_when_you_have_none_is_404(
        self, client: AsyncClient, owner: Account, tea
    ) -> None:
        assert (await client.delete(review_url(), headers=owner.headers)).status_code == 404


class TestMyReviews:
    async def test_lists_only_your_own_with_their_teas(
        self, client: AsyncClient, owner: Account, flatmate: Account, tea
    ) -> None:
        await client.put(review_url(), headers=owner.headers, json={"score": 9})
        await client.put(review_url(), headers=flatmate.headers, json={"score": 3})

        body = (await client.get("/api/v1/reviews/mine", headers=owner.headers)).json()

        assert body["total"] == 1
        assert body["items"][0]["score"] == 9
        assert body["items"][0]["tea"]["slug"] == SLUG

    async def test_requires_an_account(self, client: AsyncClient) -> None:
        assert (await client.get("/api/v1/reviews/mine")).status_code == 401
