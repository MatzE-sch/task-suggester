from datetime import timezone
from icalendar import Calendar, Event, vDatetime
from sqlalchemy.orm import Session

from app.models.task import Task, TaskStatus
from app.models.user import User


def build_ics(db: Session, user: User) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//Task Suggester//EN")
    cal.add("version", "2.0")

    tasks = (
        db.query(Task)
        .filter(Task.owner_id == user.id, Task.deadline.isnot(None))
        .filter(Task.status != TaskStatus.done)
        .all()
    )

    for task in tasks:
        event = Event()
        event.add("summary", task.title)
        if task.description:
            event.add("description", task.description)
        deadline = task.deadline.replace(tzinfo=timezone.utc) if task.deadline.tzinfo is None else task.deadline
        event.add("dtstart", deadline)
        event.add("dtend", deadline)
        event.add("uid", f"task-{task.id}@tasksuggester")
        cal.add_component(event)

    return cal.to_ical()
