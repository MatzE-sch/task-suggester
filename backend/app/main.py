from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import SessionLocal
from app.routers import auth, tasks, categories, suggest, export, invites

DEFAULT_CATEGORIES = [
    ("hardware", "#ef4444", "🔧"),
    ("software", "#6366f1", "💻"),
    ("basteln", "#f59e0b", "🪚"),
    ("löten", "#f97316", "🔩"),
    ("3d-design", "#8b5cf6", "🖊️"),
    ("3d-druck", "#ec4899", "🖨️"),
    ("papierkram", "#14243b", "📄"),
    ("orga", "#0ea5e9", "📋"),
    ("fun", "#22c55e", "🎮"),
    ("chore", "#28211c", "🧹"),
    ("freunde", "#f97316", "👫"),
    ("draußen", "#22c55e", "🌿"),
    ("sport", "#3b82f6", "🏃"),
    ("spaß", "#a855f7", "🎉"),
]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from app.models.category import Category
    db = SessionLocal()
    try:
        for name, color, icon in DEFAULT_CATEGORIES:
            if not db.query(Category).filter(Category.name == name).first():
                db.add(Category(name=name, color=color, icon=icon))
        db.commit()
    finally:
        db.close()
    yield


app = FastAPI(title="Task Suggester", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
app.include_router(categories.router, prefix="/categories", tags=["categories"])
app.include_router(suggest.router, prefix="/suggest", tags=["suggest"])
app.include_router(export.router, prefix="/export", tags=["export"])
app.include_router(invites.router, prefix="/invites", tags=["invites"])


@app.get("/health")
def health():
    return {"status": "ok"}
