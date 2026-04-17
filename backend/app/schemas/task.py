from datetime import datetime
from pydantic import BaseModel
from app.models.task import TaskStatus
from app.schemas.category import CategoryOut


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    deadline: datetime | None = None
    category_ids: list[int] = []
    dependency_ids: list[int] = []


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    deadline: datetime | None = None
    status: TaskStatus | None = None
    category_ids: list[int] | None = None
    dependency_ids: list[int] | None = None


class TaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    status: TaskStatus
    deadline: datetime | None
    snoozed_until: datetime | None
    skip_count: int
    owner_id: int
    created_at: datetime
    updated_at: datetime
    categories: list[CategoryOut]
    dependency_ids: list[int]

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_task(cls, task) -> "TaskOut":
        return cls(
            id=task.id,
            title=task.title,
            description=task.description,
            status=task.status,
            deadline=task.deadline,
            owner_id=task.owner_id,
            created_at=task.created_at,
            updated_at=task.updated_at,
            categories=task.categories,
            dependency_ids=[d.id for d in task.dependencies],
            snoozed_until=task.snoozed_until,
            skip_count=task.skip_count,
        )


class TaskActionRequest(BaseModel):
    action: str  # start | done | waiting | skip | block
    new_task: TaskCreate | None = None  # only for action=block
    snoozed_until: datetime | None = None  # only for action=waiting


class SuggestRequest(BaseModel):
    mode: str = "random"  # random | deadline | category
    category_ids: list[int] = []
