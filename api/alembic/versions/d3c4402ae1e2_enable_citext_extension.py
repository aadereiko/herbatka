"""enable citext extension

Revision ID: d3c4402ae1e2
Revises:
Create Date: 2026-08-26 19:41:00.191928

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d3c4402ae1e2"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # citext gives case-insensitive uniqueness on user.email at the database level,
    # so two accounts cannot differ only by capitalisation no matter which code path
    # inserts them.
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS citext")
