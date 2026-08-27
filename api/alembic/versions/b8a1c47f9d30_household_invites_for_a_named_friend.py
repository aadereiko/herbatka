"""household invites for a named friend

Widens `household_invite` from "a code anyone may redeem" to "an offer, addressed either
to a code-holder or to one named account". See the docstring on
`app.models.household.HouseholdInvite` for why this is one table and not two.

The downgrade is destructive in one specific, unavoidable way: a named invite cannot be
represented in the old schema, because the old `code` is NOT NULL and no honest code can
be invented for a row that deliberately has none. Minting one would be worse than
deleting — it would turn every outstanding "I asked my flatmate" into a live bearer token
sitting in a table nobody is watching. So the downgrade deletes them and says so.

Revision ID: b8a1c47f9d30
Revises: f2fba3cff616
Create Date: 2026-08-27 19:40:11.104233

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8a1c47f9d30"
down_revision: str | None = "c7a41b9d5e02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "household_invite",
        sa.Column("invited_user_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "household_invite",
        sa.Column("declined_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Nullable only for a named invite; the XOR below is what stops it becoming a
    # codeless code invite.
    op.alter_column("household_invite", "code", existing_type=sa.String(32), nullable=True)

    op.create_foreign_key(
        "fk_household_invite_invited_user",
        "household_invite",
        "user_account",
        ["invited_user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        "ck_household_invite_code_xor_recipient",
        "household_invite",
        "(code IS NULL) <> (invited_user_id IS NULL)",
    )
    op.create_check_constraint(
        "ck_household_invite_one_answer",
        "household_invite",
        "accepted_at IS NULL OR declined_at IS NULL",
    )
    op.create_check_constraint(
        "ck_household_invite_decline_is_named",
        "household_invite",
        "declined_at IS NULL OR invited_user_id IS NOT NULL",
    )
    op.create_index(
        "ix_household_invite_invited_user",
        "household_invite",
        ["invited_user_id"],
        unique=False,
    )
    op.create_index(
        "uq_household_invite_open_recipient",
        "household_invite",
        ["household_id", "invited_user_id"],
        unique=True,
        postgresql_where=sa.text(
            "invited_user_id IS NOT NULL AND accepted_at IS NULL AND declined_at IS NULL"
        ),
    )


def downgrade() -> None:
    # A named invite has no code and cannot exist under the restored NOT NULL. Deleting is
    # the only truthful rollback — see the module docstring.
    op.execute(sa.text("DELETE FROM household_invite WHERE code IS NULL"))

    op.drop_index("uq_household_invite_open_recipient", table_name="household_invite")
    op.drop_index("ix_household_invite_invited_user", table_name="household_invite")
    op.drop_constraint("ck_household_invite_decline_is_named", "household_invite", type_="check")
    op.drop_constraint("ck_household_invite_one_answer", "household_invite", type_="check")
    op.drop_constraint("ck_household_invite_code_xor_recipient", "household_invite", type_="check")
    op.drop_constraint("fk_household_invite_invited_user", "household_invite", type_="foreignkey")

    op.alter_column("household_invite", "code", existing_type=sa.String(32), nullable=False)
    op.drop_column("household_invite", "declined_at")
    op.drop_column("household_invite", "invited_user_id")
