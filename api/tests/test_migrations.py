"""Guards over the migration files themselves.

Autogenerate has produced an unnamed foreign key twice now (0e13d0e50a82 and
f64a3ed243f0). The failure is nasty because it is silent: Postgres auto-names the
constraint on creation, so `upgrade` succeeds, and only `downgrade` breaks — it raises,
the transaction rolls back, the schema is left untouched, and the *next* upgrade is a
no-op that appears to do nothing at all. A grep over the sources catches it in a second;
noticing it by hand takes considerably longer.
"""

import re
from pathlib import Path

import pytest

VERSIONS = sorted((Path(__file__).resolve().parents[1] / "alembic" / "versions").glob("*.py"))

UNNAMED = re.compile(r"op\.(create_foreign_key|create_unique_constraint|drop_constraint)\(\s*None")


def test_there_are_migrations() -> None:
    """Guards the guard: a glob that matches nothing would pass every test below."""
    assert VERSIONS


@pytest.mark.parametrize("path", VERSIONS, ids=lambda p: p.stem)
def test_no_unnamed_constraint_operations(path: Path) -> None:
    offenders = UNNAMED.findall(path.read_text())

    assert not offenders, (
        f"{path.name} passes None as a constraint name to {', '.join(offenders)}. "
        "Postgres will auto-name it on creation, so the matching drop_constraint has "
        "nothing to drop and the migration is silently irreversible. Name it explicitly."
    )


@pytest.mark.parametrize("path", VERSIONS, ids=lambda p: p.stem)
def test_every_migration_has_a_downgrade(path: Path) -> None:
    source = path.read_text()
    body = source[source.index("def downgrade()") :]

    assert "raise NotImplementedError" not in body, f"{path.name} cannot be rolled back"
