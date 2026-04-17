"""add_invite_codes

Revision ID: 31c7fd377b12
Revises: a15b3336911a
Create Date: 2026-04-17 13:27:23.750477

"""
from alembic import op

revision = '31c7fd377b12'
down_revision = 'a15b3336911a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE invite_codes (
            id SERIAL PRIMARY KEY,
            code VARCHAR(64) NOT NULL UNIQUE,
            created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            used_at TIMESTAMP
        )
    """)
    op.execute("CREATE INDEX ix_invite_codes_code ON invite_codes (code)")


def downgrade() -> None:
    op.execute("DROP TABLE invite_codes")
