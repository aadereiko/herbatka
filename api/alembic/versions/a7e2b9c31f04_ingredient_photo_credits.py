"""ingredient photo credits

Four nullable columns and one CHECK, so that a seeded photograph can carry the credit its
licence requires.

Nothing is backfilled here, and that is the whole shape of the change. The credit belongs
to a *file*, and a migration has no files: `app/seed/photos.py` knows which photograph goes
with which ingredient, and `make seed` is what puts both the picture and its attribution on
the row. Writing the text here would strand it — an attribution pointing at a Commons page
for a picture this database has never been given.

The CHECK is the point of the columns, not decoration. CC BY and CC BY-SA are only
satisfied while the credit is *shown*, and the way that quietly stops being true is a
picture getting replaced while the old credit stays behind — a photographer's name printed
under somebody else's photograph. `image_attribution IS NULL OR image_url IS NOT NULL`
makes half of that unrepresentable, and `catalog.update_ingredient` clears the credit
whenever the picture is touched, which the constraint then enforces rather than trusts.

Revision ID: a7e2b9c31f04
Revises: b8a1c47f9d30
Create Date: 2026-08-27 19:55:02.418771

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a7e2b9c31f04"
down_revision: str | None = "b8a1c47f9d30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CREDIT_CHECK = "ck_ingredient_credit_needs_a_picture"


def upgrade() -> None:
    op.add_column(
        "ingredient", sa.Column("image_attribution", sa.String(length=200), nullable=True)
    )
    op.add_column("ingredient", sa.Column("image_license", sa.String(length=60), nullable=True))
    op.add_column(
        "ingredient", sa.Column("image_license_url", sa.String(length=300), nullable=True)
    )
    op.add_column("ingredient", sa.Column("image_source_url", sa.String(length=500), nullable=True))
    # Named, never `None`: Postgres invents a name for an unnamed constraint at creation
    # time, and the matching drop below would then have nothing to drop. See
    # tests/test_migrations.py, which greps for exactly this mistake.
    op.create_check_constraint(
        CREDIT_CHECK,
        "ingredient",
        "image_attribution IS NULL OR image_url IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint(CREDIT_CHECK, "ingredient", type_="check")
    op.drop_column("ingredient", "image_source_url")
    op.drop_column("ingredient", "image_license_url")
    op.drop_column("ingredient", "image_license")
    op.drop_column("ingredient", "image_attribution")
