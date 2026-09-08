"""Read-only access to the dev database, and the three tables notebook 01 needs.

Why this is not `api/app/db/`: that engine is **async** (`postgresql+asyncpg`), because
FastAPI wants it to be. A notebook does not — every cell would have to be `await`ed, and
pandas' `read_sql` cannot take an async connection at all. So this module keeps its own
sync engine over `psycopg`, built from the same `DATABASE_URL` with the driver swapped.

Two projects, one connection string, no duplicated credentials.
"""

from __future__ import annotations

from functools import lru_cache

import pandas as pd
from sqlalchemy import Engine, create_engine, text

from herbatka_analysis import paths


def _read_env() -> dict[str, str]:
    """Parse the repository-root .env into a dict.

    Deliberately not `python-dotenv` or `pydantic-settings`: one variable is needed and a
    dependency for it would be the larger cost. Deliberately also *not* `os.environ` alone,
    because a Jupyter kernel started from a GUI launcher inherits none of a shell's exports.
    """
    env_file = paths.REPO_ROOT / ".env"
    if not env_file.exists():
        return {}
    values: dict[str, str] = {}
    for raw in env_file.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip("'\"")
    return values


def database_url() -> str:
    """The dev database, with the async driver swapped for the sync one."""
    url = _read_env().get(
        "DATABASE_URL", "postgresql+asyncpg://herbatka:herbatka@localhost:17312/herbatka"
    )
    return url.replace("+asyncpg", "+psycopg")


@lru_cache
def engine() -> Engine:
    """A read-only engine over the dev database.

    `default_transaction_read_only` is set on the connection rather than trusted to
    discipline. A notebook is an environment where `df.to_sql(...)` is one tab-completion
    away from overwriting a table you spent an evening seeding, and Postgres will refuse
    it outright rather than let a stray cell rewrite the catalogue.
    """
    return create_engine(
        database_url(),
        connect_args={"options": "-c default_transaction_read_only=on"},
        future=True,
    )


def query(sql: str, **params: object) -> pd.DataFrame:
    """Run one statement and return a DataFrame."""
    with engine().connect() as conn:
        return pd.read_sql(text(sql), conn, params=params)


def catalogue(approved_only: bool = True) -> dict[str, pd.DataFrame]:
    """The three tables that make a tea × ingredient matrix.

    `approved_only` defaults to True because the catalogue the app *shows* is the approved
    one. Unapproved rows are user submissions awaiting moderation, so including them would
    let one person's half-typed entry shape everybody else's neighbour lists.
    """
    tea_filter = "WHERE t.is_approved" if approved_only else ""

    teas = query(f"""
        SELECT t.id, t.slug, t.name, t.tea_type, t.caffeine_level,
               t.origin_country, b.name AS brand
        FROM tea t
        LEFT JOIN brand b ON b.id = t.brand_id
        {tea_filter}
        ORDER BY t.slug
    """)

    ingredients = query("""
        SELECT id, slug, name, category, is_caffeinated
        FROM ingredient
        ORDER BY slug
    """)

    links = query("""
        SELECT ti.tea_id, ti.ingredient_id, ti.percentage, ti.is_primary, ti.position
        FROM tea_ingredient ti
    """)

    # `Numeric` arrives as `decimal.Decimal`, which pandas stores in an *object* column.
    # numpy then falls back to slow Python arithmetic, and — worse — `.mean()` on an
    # all-NULL object column returns something that is not NaN. Cast at the boundary.
    links["percentage"] = links["percentage"].astype("float64")

    # Only links whose tea survived the filter, or the matrix gains phantom rows.
    links = links[links["tea_id"].isin(set(teas["id"]))].reset_index(drop=True)

    return {"teas": teas, "ingredients": ingredients, "links": links}
