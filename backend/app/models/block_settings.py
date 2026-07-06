from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BlockSettings(Base):
    __tablename__ = "block_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Liste von {"package": str, "label": str}
    blocked_packages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # Liste von {"start_minute": int, "end_minute": int}; end < start = über Mitternacht
    schedule_windows: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
