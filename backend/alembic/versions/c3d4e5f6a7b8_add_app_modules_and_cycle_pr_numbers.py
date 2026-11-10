"""add app modules and cycle pr_numbers

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-11-04 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("apps", sa.Column("modules", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("cycles", sa.Column("pr_numbers", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("cycles", "pr_numbers")
    op.drop_column("apps", "modules")
