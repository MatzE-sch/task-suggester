from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1")
    icon: Mapped[str | None] = mapped_column(String(32), nullable=True)

    tasks: Mapped[list["Task"]] = relationship(
        "Task", secondary="task_categories", back_populates="categories"
    )
