import random
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.task import Task, TaskStatus


def _eligible_tasks(db: Session, user_id: int) -> list[Task]:
    now = datetime.now(timezone.utc)
    tasks = (
        db.query(Task)
        .filter(
            Task.owner_id == user_id,
            Task.status == TaskStatus.open,
            (Task.snoozed_until == None) | (Task.snoozed_until <= now),
        )
        .all()
    )
    return [
        t for t in tasks
        if all(dep.status == TaskStatus.done for dep in t.dependencies)
    ]


def _skip_weights(tasks: list[Task]) -> list[float]:
    return [1.0 + t.skip_count for t in tasks]


def suggest_random(db: Session, user_id: int) -> Task | None:
    eligible = _eligible_tasks(db, user_id)
    if not eligible:
        return None
    return random.choices(eligible, weights=_skip_weights(eligible), k=1)[0]


def suggest_deadline(db: Session, user_id: int) -> Task | None:
    eligible = _eligible_tasks(db, user_id)
    if not eligible:
        return None

    now = datetime.now(timezone.utc)

    def weight(task: Task) -> float:
        if task.deadline is None:
            return 0.1
        deadline = task.deadline.replace(tzinfo=timezone.utc) if task.deadline.tzinfo is None else task.deadline
        days_left = max((deadline - now).total_seconds() / 86400, 0.5)
        return 1.0 / days_left

    combined = [weight(t) * (1.0 + t.skip_count) for t in eligible]
    return random.choices(eligible, weights=combined, k=1)[0]


def suggest_by_category(db: Session, user_id: int, category_ids: list[int]) -> Task | None:
    eligible = _eligible_tasks(db, user_id)
    if category_ids:
        eligible = [
            t for t in eligible
            if any(c.id in category_ids for c in t.categories)
        ]
    if not eligible:
        return None
    return random.choices(eligible, weights=_skip_weights(eligible), k=1)[0]


def get_suggestion(db: Session, user_id: int, mode: str, category_ids: list[int]) -> Task | None:
    if mode == "deadline":
        return suggest_deadline(db, user_id)
    if mode == "category":
        return suggest_by_category(db, user_id, category_ids)
    return suggest_random(db, user_id)
