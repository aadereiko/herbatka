"""person status, and location split into city + country

Revision ID: b8f1d40c92ae
Revises: a7e2b9c31f04
Create Date: 2026-08-29 09:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8f1d40c92ae"
down_revision: str | None = "a7e2b9c31f04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_account", sa.Column("status", sa.String(length=140), nullable=True))
    op.add_column("user_account", sa.Column("city", sa.String(length=120), nullable=True))
    op.add_column("user_account", sa.Column("country_code", sa.String(length=2), nullable=True))

    # Carry the old free-text location across before dropping it. Every existing value is
    # a place somebody typed — "Kraków", "London" — so `city` is where it belongs, and a
    # value like "Kraków, Poland" landing in `city` intact is a far better outcome than
    # guessing at a split and getting it wrong, or dropping the column and losing it.
    #
    # Nobody's country is inferred. Parsing "London" into GB looks tempting and is how you
    # tell somebody in London, Ontario that they live in England; the field starts empty
    # and people fill it in.
    op.execute("UPDATE user_account SET city = location WHERE location IS NOT NULL")
    op.drop_column("user_account", "location")

    op.create_check_constraint(
        "ck_user_country_code_shape",
        "user_account",
        "country_code IS NULL OR country_code ~ '^[A-Z]{2}$'",
    )


def downgrade() -> None:
    op.drop_constraint("ck_user_country_code_shape", "user_account", type_="check")
    op.add_column("user_account", sa.Column("location", sa.String(length=120), nullable=True))
    # The reverse trip is lossy and says so: `city` goes home to `location`, and the
    # country is dropped because the old column has nowhere to put it. Appending the code
    # to the text would corrupt the data of anybody who then migrated forward again.
    op.execute("UPDATE user_account SET location = city WHERE city IS NOT NULL")
    op.drop_column("user_account", "country_code")
    op.drop_column("user_account", "city")
    op.drop_column("user_account", "status")
