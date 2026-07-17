import logging
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.activity import ActivityLog
from app.models.category import Category
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate, TaskOut, TaskActionRequest, ActivityLogOut, ActivityLogUpdate
from app.services.auth import get_current_user
from app.services.suggest import auto_reset_tasks

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_own_task(task_id: int, user: User, db: Session) -> Task:
    task = db.get(Task, task_id)
    if not task or task.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _apply_relations(task: Task, category_ids: list[int], dependency_ids: list[int], db: Session):
    if category_ids is not None:
        task.categories = db.query(Category).filter(Category.id.in_(category_ids)).all()
    if dependency_ids is not None:
        deps = db.query(Task).filter(Task.id.in_(dependency_ids)).all()
        task.dependencies = deps


@router.get("", response_model=list[TaskOut])
def list_tasks(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    auto_reset_tasks(db, user.id)
    tasks = db.query(Task).filter(Task.owner_id == user.id).order_by(Task.created_at.desc()).all()
    return [TaskOut.from_orm_task(t) for t in tasks]


@router.post("", response_model=TaskOut, status_code=201)
def create_task(data: TaskCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = Task(
        title=data.title,
        description=data.description,
        task_type=data.task_type,
        deadline=data.deadline,
        recurrence_days=data.recurrence_days,
        priority=data.priority,
        owner_id=user.id,
    )
    db.add(task)
    db.flush()
    _apply_relations(task, data.category_ids, data.dependency_ids, db)
    db.commit()
    db.refresh(task)
    logger.info(
        "task created",
        extra={
            "event": "task.created",
            "task_id": task.id,
            "task_type": task.task_type,
            "category_ids": [c.id for c in task.categories],
            "user_id": user.id,
        },
    )
    return TaskOut.from_orm_task(task)


# Log endpoints must come before /{task_id} to avoid route conflict
@router.get("/log", response_model=list[ActivityLogOut])
def get_task_log(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    logs = (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == user.id, ActivityLog.action == "done")
        .order_by(ActivityLog.logged_date.desc(), ActivityLog.created_at.desc())
        .all()
    )
    result = []
    for log in logs:
        task = db.get(Task, log.task_id) if log.task_id else None
        result.append(ActivityLogOut(
            id=log.id,
            task_id=log.task_id,
            task_title=task.title if task else None,
            task_type=task.task_type if task else None,
            category_ids=list(log.category_ids or []),
            logged_date=log.logged_date,
            created_at=log.created_at,
        ))
    return result


@router.delete("/log/{log_id}", status_code=204)
def delete_task_log(log_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    log = db.get(ActivityLog, log_id)
    if not log or log.user_id != user.id:
        raise HTTPException(status_code=404, detail="Log entry not found")
    db.delete(log)
    db.commit()


@router.patch("/log/{log_id}", response_model=ActivityLogOut)
def update_task_log(log_id: int, data: ActivityLogUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    log = db.get(ActivityLog, log_id)
    if not log or log.user_id != user.id:
        raise HTTPException(status_code=404, detail="Log entry not found")
    if data.category_ids is not None:
        log.category_ids = data.category_ids
    if data.logged_date is not None:
        log.logged_date = data.logged_date
    db.commit()
    db.refresh(log)
    task = db.get(Task, log.task_id) if log.task_id else None
    return ActivityLogOut(
        id=log.id,
        task_id=log.task_id,
        task_title=task.title if task else None,
        task_type=task.task_type if task else None,
        category_ids=list(log.category_ids or []),
        logged_date=log.logged_date,
        created_at=log.created_at,
    )


@router.get("/stats/activity")
def activity_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    logs = (
        db.query(ActivityLog)
        .options(joinedload(ActivityLog.task).joinedload(Task.categories))
        .filter(ActivityLog.user_id == user.id, ActivityLog.action == "done")
        .all()
    )
    result: dict[str, dict] = {}
    for log in logs:
        day = log.logged_date.isoformat()
        if day not in result:
            result[day] = {"count": 0, "category_counts": {}}
        result[day]["count"] += 1
        cat_ids = list(log.category_ids or [])
        if not cat_ids and log.task:
            cat_ids = [c.id for c in log.task.categories]
        weight = 1.0 / len(cat_ids) if cat_ids else 1.0
        for cat_id in cat_ids:
            result[day]["category_counts"][cat_id] = result[day]["category_counts"].get(cat_id, 0.0) + weight
    return {
        day: {
            "count": data["count"],
            "category_ids": list(data["category_counts"].keys()),
            "category_counts": dict(data["category_counts"]),
        }
        for day, data in result.items()
    }


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return TaskOut.from_orm_task(_get_own_task(task_id, user, db))


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = _get_own_task(task_id, user, db)
    for field in ("title", "description", "task_type", "deadline", "recurrence_days", "status", "snoozed_until", "priority"):
        value = getattr(data, field)
        if value is not None:
            setattr(task, field, value)
    _apply_relations(task, data.category_ids, data.dependency_ids, db)
    db.commit()
    db.refresh(task)
    logger.info(
        "task updated",
        extra={"event": "task.updated", "task_id": task.id, "task_type": task.task_type, "user_id": user.id},
    )
    return TaskOut.from_orm_task(task)


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = _get_own_task(task_id, user, db)
    db.delete(task)
    db.commit()
    logger.info(
        "task deleted",
        extra={"event": "task.deleted", "task_id": task_id, "user_id": user.id},
    )


@router.post("/{task_id}/action", response_model=TaskOut)
def task_action(task_id: int, body: TaskActionRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = db.query(Task).options(joinedload(Task.categories)).filter(Task.id == task_id, Task.owner_id == user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    status_map = {
        "start": TaskStatus.in_progress,
        "done": TaskStatus.done,
        "waiting": TaskStatus.waiting,
    }

    if body.action == "skip":
        task.skip_count += 1
        task.status = TaskStatus.open
        log = ActivityLog(
            user_id=user.id,
            task_id=task.id,
            action=body.action,
            category_ids=[c.id for c in task.categories],
            logged_date=body.logged_date or date.today(),
        )
        db.add(log)

    elif body.action in status_map:
        if body.action == "done" and task.task_type == "recurring" and task.recurrence_days:
            today = body.logged_date or date.today()
            already_done = db.query(ActivityLog).filter(
                ActivityLog.user_id == user.id,
                ActivityLog.task_id == task.id,
                ActivityLog.action == "done",
                ActivityLog.logged_date == today,
            ).first()
            if already_done:
                raise HTTPException(status_code=409, detail="Recurring task already completed today")
            now = datetime.now(timezone.utc)
            task.status = TaskStatus.done
            task.last_completed_at = now
            tomorrow = datetime.combine(date.today() + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc)
            task.snoozed_until = tomorrow
        else:
            task.status = status_map[body.action]
            if body.action == "waiting" and body.snoozed_until:
                task.snoozed_until = body.snoozed_until
        log = ActivityLog(
            user_id=user.id,
            task_id=task.id,
            action=body.action,
            category_ids=[c.id for c in task.categories],
            logged_date=body.logged_date or date.today(),
        )
        db.add(log)

    elif body.action == "block":
        if not body.new_task:
            raise HTTPException(status_code=400, detail="new_task required for block action")
        blocker = Task(
            title=body.new_task.title,
            description=body.new_task.description,
            deadline=body.new_task.deadline,
            owner_id=user.id,
        )
        db.add(blocker)
        db.flush()
        _apply_relations(blocker, body.new_task.category_ids, body.new_task.dependency_ids, db)
        task.dependencies.append(blocker)

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    db.commit()
    db.refresh(task)
    logger.info(
        "task action",
        extra={
            "event": "task.action",
            "action": body.action,
            "task_id": task.id,
            "task_type": task.task_type,
            "user_id": user.id,
        },
    )
    return TaskOut.from_orm_task(task)
