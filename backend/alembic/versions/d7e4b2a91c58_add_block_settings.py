"""add_block_settings

Revision ID: d7e4b2a91c58
Revises: f2a8c1d9e3b7
Create Date: 2026-07-06 00:00:00.000000

"""
from alembic import op

revision = 'd7e4b2a91c58'
down_revision = 'f2a8c1d9e3b7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE block_settings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            blocked_packages JSONB NOT NULL DEFAULT '[]'::jsonb,
            schedule_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE block_settings")
