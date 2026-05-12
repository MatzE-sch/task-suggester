import random
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.models.task import Task, TaskStatus

MAX_RECURRENCE_WEIGHT = 8.0


def _is_eligible_snooze(task: Task, now: datetime) -> bool:
    if task.snoozed_until is None:
        return True
    su = task.snoozed_until.replace(tzinfo=timezone.utc) if task.snoozed_until.tzinfo is None else task.snoozed_until
    if su <= now:
        return True
    if task.task_type == 'recurring' and task.recurrence_days:
        early = su - timedelta(days=task.recurrence_days * 0.3)
        return now >= early
    return False


def _recurring_weight(task: Task, now: datetime) -> float:
    if task.task_type != 'recurring' or not task.recurrence_days:
        return 1.0
    if task.last_completed_at is None:
        return 0.05
    lc = task.last_completed_at.replace(tzinfo=timezone.utc) if task.last_completed_at.tzinfo is None else task.last_completed_at
    elapsed = (now - lc).total_seconds() / 86400
    progress = elapsed / task.recurrence_days

    if progress < 0.7:
        return 0.05
    if progress <= 1.0:
        return 0.1 + (progress - 0.7) / 0.3 * 0.9
    return min(1.0 + (progress - 1.0) * 3.0, MAX_RECURRENCE_WEIGHT)


def auto_reset_tasks(db: Session, user_id: int) -> None:
    now = datetime.now(timezone.utc)
    today = now.date()
    changed = False

    # Reset waiting tasks whose snooze has expired
    for t in db.query(Task).filter(
        Task.owner_id == user_id,
        Task.status == TaskStatus.waiting,
        Task.snoozed_until.isnot(None),
    ).all():
        su = t.snoozed_until.replace(tzinfo=timezone.utc) if t.snoozed_until.tzinfo is None else t.snoozed_until
        if su <= now:
            t.status = TaskStatus.open
            changed = True

    # Reset recurring done tasks that haven't been completed today
    for t in db.query(Task).filter(
        Task.owner_id == user_id,
        Task.status == TaskStatus.done,
        Task.task_type == 'recurring',
    ).all():
        if t.last_completed_at is None:
            t.status = TaskStatus.open
            changed = True
        else:
            lc = t.last_completed_at.replace(tzinfo=timezone.utc) if t.last_completed_at.tzinfo is None else t.last_completed_at
            if lc.date() < today:
                t.status = TaskStatus.open
                changed = True

    if changed:
        db.commit()


def _eligible_tasks(db: Session, user_id: int) -> list[Task]:
    now = datetime.now(timezone.utc)
    auto_reset_tasks(db, user_id)
    tasks = (
        db.query(Task)
        .filter(
            Task.owner_id == user_id,
            Task.status == TaskStatus.open,
        )
        .all()
    )
    return [
        t for t in tasks
        if _is_eligible_snooze(t, now)
        and all(dep.status == TaskStatus.done for dep in t.dependencies)
    ]


def _skip_weights(tasks: list[Task], now: datetime) -> list[float]:
    return [_recurring_weight(t, now) * (1.0 + t.skip_count) for t in tasks]


def suggest_random(db: Session, user_id: int) -> Task | None:
    now = datetime.now(timezone.utc)
    eligible = _eligible_tasks(db, user_id)
    if not eligible:
        return None
    return random.choices(eligible, weights=_skip_weights(eligible, now), k=1)[0]


def suggest_deadline(db: Session, user_id: int) -> Task | None:
    now = datetime.now(timezone.utc)
    eligible = _eligible_tasks(db, user_id)
    if not eligible:
        return None

    def weight(task: Task) -> float:
        if task.task_type == 'recurring':
            return _recurring_weight(task, now) * (1.0 + task.skip_count)
        if task.deadline is None:
            return 0.1 * (1.0 + task.skip_count)
        deadline = task.deadline.replace(tzinfo=timezone.utc) if task.deadline.tzinfo is None else task.deadline
        days_left = max((deadline - now).total_seconds() / 86400, 0.5)
        return (1.0 / days_left) * (1.0 + task.skip_count)

    return random.choices(eligible, weights=[weight(t) for t in eligible], k=1)[0]


def suggest_by_category(db: Session, user_id: int, category_ids: list[int]) -> Task | None:
    now = datetime.now(timezone.utc)
    eligible = _eligible_tasks(db, user_id)
    if category_ids:
        eligible = [
            t for t in eligible
            if any(c.id in category_ids for c in t.categories)
        ]
    if not eligible:
        return None
    return random.choices(eligible, weights=_skip_weights(eligible, now), k=1)[0]


def suggest_recurring(db: Session, user_id: int) -> Task | None:
    now = datetime.now(timezone.utc)
    eligible = [t for t in _eligible_tasks(db, user_id) if t.task_type == 'recurring']
    if not eligible:
        return None
    weights = [_recurring_weight(t, now) for t in eligible]
    return random.choices(eligible, weights=weights, k=1)[0]


def get_suggestion(db: Session, user_id: int, mode: str, category_ids: list[int]) -> Task | None:
    if mode == "deadline":
        return suggest_deadline(db, user_id)
    if mode == "category":
        return suggest_by_category(db, user_id, category_ids)
    if mode == "recurring":
        return suggest_recurring(db, user_id)
    return suggest_random(db, user_id)
