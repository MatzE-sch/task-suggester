from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.task import SuggestRequest, TaskOut
from app.services.auth import get_current_user
from app.services.suggest import get_suggestion

router = APIRouter()


@router.post("", response_model=TaskOut)
def suggest(body: SuggestRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    task = get_suggestion(db, user.id, body.mode, body.category_ids)
    if task is None:
        raise HTTPException(status_code=404, detail="No eligible tasks found")
    return TaskOut.from_orm_task(task)
