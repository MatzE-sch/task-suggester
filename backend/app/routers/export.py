from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.services.auth import get_current_user
from app.services.ics_export import build_ics

router = APIRouter()


@router.get("/ics")
def export_ics(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ics_data = build_ics(db, user)
    return Response(
        content=ics_data,
        media_type="text/calendar",
        headers={"Content-Disposition": "attachment; filename=tasks.ics"},
    )
