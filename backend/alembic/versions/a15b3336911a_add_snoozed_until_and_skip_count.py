"""add_snoozed_until_and_skip_count

Revision ID: a15b3336911a
Revises: bf1ce2ef9cac
Create Date: 2026-04-17 12:43:02.357912

"""
from alembic import op
import sqlalchemy as sa

revision = 'a15b3336911a'
down_revision = 'bf1ce2ef9cac'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tasks ADD COLUMN snoozed_until TIMESTAMP DEFAULT NULL")
    op.execute("ALTER TABLE tasks ADD COLUMN skip_count INTEGER NOT NULL DEFAULT 0")


def downgrade() -> None:
    op.execute("ALTER TABLE tasks DROP COLUMN snoozed_until")
    op.execute("ALTER TABLE tasks DROP COLUMN skip_count")
