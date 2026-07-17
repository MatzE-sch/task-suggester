import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.block_settings import BlockSettings
from app.models.user import User
from app.services.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


class BlockedApp(BaseModel):
    package: str = Field(min_length=1, max_length=255)
    label: str = ""


class ScheduleWindow(BaseModel):
    # Minuten seit Mitternacht (Gerätezeit); end < start = Fenster über Mitternacht
    start_minute: int = Field(ge=0, le=1439)
    end_minute: int = Field(ge=0, le=1439)


class BlockSettingsPayload(BaseModel):
    enabled: bool = False
    blocked_packages: list[BlockedApp] = []
    schedule_windows: list[ScheduleWindow] = []


@router.get("", response_model=BlockSettingsPayload)
def get_block_settings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.query(BlockSettings).filter(BlockSettings.user_id == user.id).first()
    if row is None:
        return BlockSettingsPayload()
    return BlockSettingsPayload(
        enabled=row.enabled,
        blocked_packages=row.blocked_packages,
        schedule_windows=row.schedule_windows,
    )


@router.put("", response_model=BlockSettingsPayload)
def put_block_settings(
    payload: BlockSettingsPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.query(BlockSettings).filter(BlockSettings.user_id == user.id).first()
    if row is None:
        row = BlockSettings(user_id=user.id)
        db.add(row)
    row.enabled = payload.enabled
    row.blocked_packages = [a.model_dump() for a in payload.blocked_packages]
    row.schedule_windows = [w.model_dump() for w in payload.schedule_windows]
    db.commit()
    logger.info(
        "block settings updated",
        extra={
            "event": "block_settings.updated",
            "user_id": user.id,
            "enabled": payload.enabled,
            "blocked_count": len(payload.blocked_packages),
            "window_count": len(payload.schedule_windows),
        },
    )
    return payload
