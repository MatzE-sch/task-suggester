"""initial

Revision ID: bf1ce2ef9cac
Revises:
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa

revision = "bf1ce2ef9cac"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            hashed_password VARCHAR(128) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX ix_users_username ON users (username)")

    op.execute("""
        CREATE TABLE categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(64) NOT NULL UNIQUE,
            color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
            icon VARCHAR(32)
        )
    """)

    op.execute("CREATE TYPE taskstatus AS ENUM ('open', 'in_progress', 'waiting', 'done', 'skipped')")

    op.execute("""
        CREATE TABLE tasks (
            id SERIAL PRIMARY KEY,
            title VARCHAR(256) NOT NULL,
            description TEXT,
            status taskstatus NOT NULL DEFAULT 'open',
            deadline TIMESTAMP,
            owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE task_dependencies (
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            depends_on_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            PRIMARY KEY (task_id, depends_on_id)
        )
    """)

    op.execute("""
        CREATE TABLE task_categories (
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            PRIMARY KEY (task_id, category_id)
        )
    """)

    op.execute("""
        CREATE TABLE activity_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
            action VARCHAR(32) NOT NULL,
            category_ids JSON NOT NULL DEFAULT '[]',
            logged_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE activity_logs")
    op.execute("DROP TABLE task_categories")
    op.execute("DROP TABLE task_dependencies")
    op.execute("DROP TABLE tasks")
    op.execute("DROP TYPE taskstatus")
    op.execute("DROP TABLE categories")
    op.execute("DROP TABLE users")
