"""add_task_type_and_recurrence

Revision ID: c4e91f2a8d30
Revises: 31c7fd377b12
Create Date: 2026-04-19 00:00:00.000000

"""
from alembic import op

revision = 'c4e91f2a8d30'
down_revision = '31c7fd377b12'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tasks ADD COLUMN task_type VARCHAR(20) NOT NULL DEFAULT 'normal'")
    op.execute("ALTER TABLE tasks ADD COLUMN recurrence_days INTEGER DEFAULT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE tasks DROP COLUMN recurrence_days")
    op.execute("ALTER TABLE tasks DROP COLUMN task_type")
