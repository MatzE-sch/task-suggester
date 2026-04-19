from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.activity import ActivityLog
from app.models.category import Category
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate, TaskOut, TaskActionRequest
from app.services.auth import get_current_user

router = APIRouter()


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
        owner_id=user.id,
    )
    db.add(task)
    db.flush()
    _apply_relations(task, data.category_ids, data.dependency_ids, db)
    db.commit()
    db.refresh(task)
    return TaskOut.from_orm_task(task)


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return TaskOut.from_orm_task(_get_own_task(task_id, user, db))


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = _get_own_task(task_id, user, db)
    for field in ("title", "description", "task_type", "deadline", "recurrence_days", "status"):
        value = getattr(data, field)
        if value is not None:
            setattr(task, field, value)
    _apply_relations(task, data.category_ids, data.dependency_ids, db)
    db.commit()
    db.refresh(task)
    return TaskOut.from_orm_task(task)


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = _get_own_task(task_id, user, db)
    db.delete(task)
    db.commit()


@router.post("/{task_id}/action", response_model=TaskOut)
def task_action(task_id: int, body: TaskActionRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = _get_own_task(task_id, user, db)

    status_map = {
        "start": TaskStatus.in_progress,
        "done": TaskStatus.done,
        "waiting": TaskStatus.waiting,
    }

    if body.action == "skip":
        task.skip_count += 1
        # Reset to open so it stays eligible for suggestion
        task.status = TaskStatus.open
        log = ActivityLog(
            user_id=user.id,
            task_id=task.id,
            action=body.action,
            category_ids=[c.id for c in task.categories],
            logged_date=date.today(),
        )
        db.add(log)

    elif body.action in status_map:
        if body.action == "done" and task.task_type == "recurring" and task.recurrence_days:
            task.status = TaskStatus.open
            task.snoozed_until = datetime.now(timezone.utc) + timedelta(days=task.recurrence_days)
        else:
            task.status = status_map[body.action]
            if body.action == "waiting" and body.snoozed_until:
                task.snoozed_until = body.snoozed_until
        log = ActivityLog(
            user_id=user.id,
            task_id=task.id,
            action=body.action,
            category_ids=[c.id for c in task.categories],
            logged_date=date.today(),
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
    return TaskOut.from_orm_task(task)


@router.get("/stats/activity")
def activity_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    logs = (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == user.id, ActivityLog.action == "done")
        .all()
    )
    result: dict[str, dict] = {}
    for log in logs:
        day = log.logged_date.isoformat()
        if day not in result:
            result[day] = {"count": 0, "categories": set()}
        result[day]["count"] += 1
        result[day]["categories"].update(log.category_ids)

    return {
        day: {"count": data["count"], "category_ids": list(data["categories"])}
        for day, data in result.items()
    }
