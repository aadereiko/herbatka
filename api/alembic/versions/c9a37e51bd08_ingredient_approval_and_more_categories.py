"""ingredients can be suggested, and there are more categories to put them in

Revision ID: c9a37e51bd08
Revises: b8f1d40c92ae
Create Date: 2026-08-29 11:20:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c9a37e51bd08"
down_revision: str | None = "b8f1d40c92ae"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD = ("leaf", "herb", "flower", "spice", "fruit", "other")
NEW = (
    "leaf",
    "herb",
    "flower",
    "spice",
    "fruit",
    "berry",
    "peel",
    "root",
    "bark",
    "seed",
    "grain",
    "nut",
    "extract",
    "other",
)


def _values(names: Sequence[str]) -> str:
    return ", ".join(f"'{n}'" for n in names)


def upgrade() -> None:
    # `native_enum=False` means the category is a VARCHAR guarded by a CHECK, not a
    # Postgres enum type — so widening it is a matter of replacing the constraint rather
    # than ALTER TYPE ... ADD VALUE. That is the easier direction: a CHECK can be dropped
    # and rewritten inside a transaction, where adding an enum label historically could
    # not be.
    # Widen the column *before* widening the CHECK. `native_enum=False` renders the
    # category as a VARCHAR whose length SQLAlchemy derived from the longest label in the
    # old list — six, for "flower". "extract" is seven, so a CHECK that permits it over a
    # column that cannot hold it is a constraint the database will never get the chance to
    # enforce: every insert dies on StringDataRightTruncation first. Found by running the
    # seed. 20 leaves room for the next word.
    op.alter_column("ingredient", "category", type_=sa.String(length=20), existing_nullable=False)
    op.drop_constraint("ingredient_category", "ingredient", type_="check")
    op.create_check_constraint("ingredient_category", "ingredient", f"category IN ({_values(NEW)})")

    # `server_default="true"`: every row that exists predates the idea of an unapproved
    # ingredient — it was seeded or entered by an admin. Defaulting them to false would
    # mark the whole shared vocabulary as pending in one migration.
    op.add_column(
        "ingredient",
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column("ingredient", sa.Column("created_by_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_ingredient_created_by",
        "ingredient",
        "user_account",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_ingredient_created_by", "ingredient", type_="foreignkey")
    op.drop_column("ingredient", "created_by_id")
    op.drop_column("ingredient", "is_approved")

    # Anything filed under one of the new categories has to land somewhere the old CHECK
    # accepts, and `other` is the only honest answer — the old vocabulary has no word for
    # a bark. Lossy, and it says so rather than failing the migration halfway through
    # with a constraint violation nobody can act on.
    op.execute(f"UPDATE ingredient SET category = 'other' WHERE category NOT IN ({_values(OLD)})")
    op.drop_constraint("ingredient_category", "ingredient", type_="check")
    op.create_check_constraint("ingredient_category", "ingredient", f"category IN ({_values(OLD)})")
    # Narrow last, once nothing longer than "flower" is left in the column.
    op.alter_column("ingredient", "category", type_=sa.String(length=6), existing_nullable=False)
