"""The catalog seed, run for real.

`seed_catalog` takes a session precisely so this can drive it inside the suite's
rolled-back transaction rather than against a scratch database. The interesting question
is not "does a fresh install get thirty-nine rows" — it is what happens on the *second*
run, against a database that already has them, which is the only situation a real user's
laptop is ever in.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.catalog import Ingredient
from app.seed import seed_catalog
from app.seed.data import INGREDIENTS


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
