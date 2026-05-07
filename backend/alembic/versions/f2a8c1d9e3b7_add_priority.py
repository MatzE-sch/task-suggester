"""add_priority

Revision ID: f2a8c1d9e3b7
Revises: e3a9f1c2d4b5
Create Date: 2026-05-07 00:00:00.000000

"""
from alembic import op

revision = 'f2a8c1d9e3b7'
down_revision = 'e3a9f1c2d4b5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 3")


def downgrade() -> None:
    op.execute("ALTER TABLE tasks DROP COLUMN priority")
