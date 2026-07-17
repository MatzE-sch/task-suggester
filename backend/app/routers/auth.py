import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invite import InviteCode
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, Token
from app.services.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: UserCreate, db: Session = Depends(get_db)):
    invite = db.query(InviteCode).filter(
        InviteCode.code == data.invite_code,
        InviteCode.used_by == None,
    ).first()
    if not invite:
        raise HTTPException(status_code=403, detail="Invalid or already used invite code")
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    user = User(username=data.username, hashed_password=hash_password(data.password))
    db.add(user)
    db.flush()
    invite.used_by = user.id
    invite.used_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    logger.info("user registered", extra={"event": "user.registered", "user_id": user.id})
    return user


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        logger.warning(
            "login failed",
            extra={"event": "user.login_failed", "username": form.username},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    logger.info("user login", extra={"event": "user.login", "user_id": user.id, "username": user.username})
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
