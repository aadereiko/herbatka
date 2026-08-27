"""ingredient pictures

Revision ID: c7a41b9d5e02
Revises: f2fba3cff616
Create Date: 2026-08-27 19:12:44.118203

One nullable column, and nothing is backfilled here on purpose. Filling `image_url` needs
a *file*, and a migration has none to give: the only honest source is an upload through
`POST /uploads/image`. The seed writes descriptions; pictures arrive one at a time from an
admin, and until then the frontend draws a per-category illustration.

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c7a41b9d5e02"
down_revision: str | None = "f2fba3cff616"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("ingredient", sa.Column("image_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("ingredient", "image_url")
