import uuid
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invite import InviteCode
from app.models.user import User
from app.services.auth import get_current_user

router = APIRouter()


class InviteOut(BaseModel):
    id: int
    code: str
    used: bool

    model_config = {"from_attributes": True}


@router.post("", response_model=InviteOut, status_code=201)
def create_invite(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    code = InviteCode(code=str(uuid.uuid4()), created_by=user.id)
    db.add(code)
    db.commit()
    db.refresh(code)
    return InviteOut(id=code.id, code=code.code, used=code.used_by is not None)


@router.get("", response_model=list[InviteOut])
def list_invites(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    codes = db.query(InviteCode).filter(InviteCode.created_by == user.id).order_by(InviteCode.created_at.desc()).all()
    return [InviteOut(id=c.id, code=c.code, used=c.used_by is not None) for c in codes]
