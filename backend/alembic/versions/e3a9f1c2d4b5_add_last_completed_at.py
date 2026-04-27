"""add_last_completed_at

Revision ID: e3a9f1c2d4b5
Revises: 31c7fd377b12
Create Date: 2026-04-27 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'e3a9f1c2d4b5'
down_revision = 'c4e91f2a8d30'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tasks', sa.Column('last_completed_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('tasks', 'last_completed_at')
