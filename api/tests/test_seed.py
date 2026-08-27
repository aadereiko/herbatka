"""The catalog seed, run for real.

`seed_catalog` takes a session precisely so this can drive it inside the suite's
rolled-back transaction rather than against a scratch database. The interesting question
is not "does a fresh install get thirty-nine rows" — it is what happens on the *second*
run, against a database that already has them, which is the only situation a real user's
laptop is ever in.
"""

from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.slug import slugify
from app.models.catalog import Ingredient
from app.seed import seed_catalog
from app.seed.data import INGREDIENTS
from app.seed.photos import PHOTOS


@pytest.fixture(autouse=True)
def _seed_writes_somewhere_disposable(media_tmp: Path) -> Path:
    """Every test in this module runs the real seed, which now writes real files.

    Autouse rather than a parameter on each test, because the requirement is a property of
    the module — *any* test in here that calls `seed_catalog` copies thirty-nine JPEGs
    somewhere, and the one that forgets to ask for the fixture is the one that quietly
    starts filling up a developer's `api/media/`.
    """
    return media_tmp


def test_every_seeded_ingredient_says_something() -> None:
    """The gap this closes: thirty-nine rows shipped with `description = NULL`, so
    /ingredients was a wall of bare names. Adding a fortieth without one puts it back."""
    silent = [name for name, _category, _caffeinated, description in INGREDIENTS if not description]

    assert not silent, f"no description for: {', '.join(silent)}"


async def _chamomile(db: AsyncSession) -> Ingredient | None:
    return await db.scalar(select(Ingredient).where(Ingredient.slug == "chamomile"))


class TestDescriptionBackfill:
    async def test_fills_in_an_ingredient_that_already_exists_without_one(
        self, db: AsyncSession
    ) -> None:
        """The whole point of the exception to "skip what exists".

        A seed that only writes descriptions on creation is useless to anybody whose
        database is already populated — which is everybody who has run it once.
        """
        db.add(
            Ingredient(slug="chamomile", name="Chamomile", category="herb", is_caffeinated=False)
        )
        await db.flush()

        created = await seed_catalog(db)

        found = await _chamomile(db)
        assert found is not None
        assert found.description is not None and "honey" in found.description
        assert created["descriptions"] >= 1
        # Filled in, not duplicated: the row it wrote to is the row that was already there.
        assert (
            await db.scalar(
                select(func.count()).select_from(Ingredient).where(Ingredient.slug == "chamomile")
            )
            == 1
        )

    async def test_leaves_a_description_somebody_typed_alone(self, db: AsyncSession) -> None:
        """Backfilling is not overwriting. An admin's own words survive every re-run,
        including the one in a deploy step they did not know was happening."""
        db.add(
            Ingredient(
                slug="chamomile",
                name="Chamomile",
                category="herb",
                is_caffeinated=False,
                description="Tastes like a nap.",
            )
        )
        await db.flush()

        await seed_catalog(db)

        found = await _chamomile(db)
        assert found is not None
        assert found.description == "Tastes like a nap."

    async def test_a_second_run_has_nothing_left_to_do(self, db: AsyncSession) -> None:
        """Idempotence, now that one branch of the seed *writes to existing rows*. If the
        backfill counted every row every time, `make seed` would report work forever."""
        await seed_catalog(db)

        again = await seed_catalog(db)

        assert sum(again.values()) == 0, again


# --------------------------------------------------------------------------- photographs

#: Public Domain, CC0, CC BY and CC BY-SA, and nothing else. Non-commercial and
#: no-derivatives licences are not usable here whatever the intention, and "unknown" is the
#: worst of the lot — it looks exactly like a licence until somebody asks.
USABLE_LICENCES = {
    "CC0",
    "Public domain",
    "CC BY 2.0",
    "CC BY 2.5",
    "CC BY 3.0",
    "CC BY 4.0",
    "CC BY-SA 3.0",
    "CC BY-SA 4.0",
}


def test_every_photo_file_the_seed_names_is_actually_on_disk() -> None:
    """The failure nothing else catches.

    A slug typo or a file that never got committed does not break the seed, the API or any
    other test — `store()` would raise on a missing file, but only when somebody runs
    `make seed`, and a *renamed* file simply produces a card with a broken picture on it.
    This is the cheap check that turns "every ingredient has a photograph" from a claim in
    a docstring into something the suite knows.
    """
    missing = [slug for slug, photo in PHOTOS.items() if not photo.path.is_file()]
    assert not missing, f"no image file for: {', '.join(sorted(missing))}"

    # Non-empty as well as present: a zero-byte placeholder passes `is_file()` and then
    # fails content-type sniffing in `store()` halfway through the seed.
    empty = [slug for slug, photo in PHOTOS.items() if photo.path.stat().st_size == 0]
    assert not empty, f"empty image file for: {', '.join(sorted(empty))}"


def test_every_photo_belongs_to_an_ingredient_the_seed_creates() -> None:
    """A key that matches no slug is silently ignored by `_attach_photos` — the file is
    committed, the credit is written down, and no card ever shows either."""
    slugs = {slugify(name) for name, _category, _caffeinated, _description in INGREDIENTS}

    assert not set(PHOTOS) - slugs, f"no such ingredient: {', '.join(sorted(set(PHOTOS) - slugs))}"


def test_every_photo_is_under_a_licence_we_may_actually_use() -> None:
    """The one constraint in this feature that is not about looks.

    A non-commercial or no-derivatives file is not usable here however good the photograph
    is, and the way one gets in is somebody adding a fortieth row in a hurry. Checking the
    string is crude, but it is the same string the card prints, so a licence this test has
    never heard of is one nobody has thought about.
    """
    wrong = {
        slug: photo.licence
        for slug, photo in PHOTOS.items()
        if photo.licence not in USABLE_LICENCES
    }

    assert not wrong, f"unusable licence: {wrong}"


def test_every_photo_credits_somebody_and_says_where_it_came_from() -> None:
    """CC BY and CC BY-SA are satisfied by *showing* this, so a blank here is a licence
    breach rendered as a tidy-looking card."""
    incomplete = [
        slug
        for slug, photo in PHOTOS.items()
        if not (photo.author and photo.licence and photo.licence_url and photo.source_url)
    ]

    assert not incomplete, f"incomplete credit for: {', '.join(sorted(incomplete))}"


class TestPhotoBackfill:
    async def test_gives_an_existing_ingredient_its_photograph_and_the_credit_with_it(
        self, db: AsyncSession, media_tmp: Path
    ) -> None:
        """The same backfill shape as descriptions, for the same reason: the rows are
        already there on every laptop that has run this once."""
        db.add(
            Ingredient(slug="chamomile", name="Chamomile", category="herb", is_caffeinated=False)
        )
        await db.flush()

        created = await seed_catalog(db)

        found = await _chamomile(db)
        assert found is not None
        assert found.image_url is not None and found.image_url.startswith("/media/")
        assert found.image_attribution == PHOTOS["chamomile"].author
        assert found.image_license == PHOTOS["chamomile"].licence
        assert found.image_source_url == PHOTOS["chamomile"].source_url
        assert created["photos"] == len(PHOTOS)

        # And the bytes really landed where the URL says they did — an `image_url` pointing
        # at nothing is the broken card this whole exercise exists to avoid.
        assert (media_tmp / found.image_url.removeprefix("/media/")).is_file()

    async def test_never_touches_a_picture_an_admin_uploaded(self, db: AsyncSession) -> None:
        """Not just "does not overwrite the file" — does not *credit* it either.

        An admin's own photograph of chamomile needs nobody's permission, so the card shows
        no credit for it. Attaching a Commons photographer's name to it would be a false
        statement about a stranger, which is worse than the missing credit it was trying
        to avoid.
        """
        db.add(
            Ingredient(
                slug="chamomile",
                name="Chamomile",
                category="herb",
                is_caffeinated=False,
                image_url="/media/mine.jpg",
            )
        )
        await db.flush()

        created = await seed_catalog(db)

        found = await _chamomile(db)
        assert found is not None
        assert found.image_url == "/media/mine.jpg"
        assert found.image_attribution is None
        assert found.image_license is None
        assert found.image_source_url is None
        # Everything else still got one, so this is a skip of one row and not of the step.
        assert created["photos"] == len(PHOTOS) - 1
