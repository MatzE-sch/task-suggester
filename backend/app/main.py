from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import SessionLocal
from app.routers import auth, tasks, categories, suggest, export, invites

# Ordered by user preference [2,5,6,1,4,3,11,12,14,13,8,7,10]
DEFAULT_CATEGORIES = [
    ("software",   "#6366f1", "💻"),
    ("3d-design",  "#8b5cf6", "🖊"),
    ("3d-druck",   "#ec4899", "🖨"),
    ("hardware",   "#ef4444", "🔧"),
    ("löten",      "#f97316", "🔩"),
    ("basteln",    "#f59e0b", "🪚"),
    ("freunde",    "#15803d", "👫"),
    ("draußen",    "#22c55e", "🌿"),
    ("spaß",       "#a855f7", "🎉"),
    ("sport",      "#3b82f6", "🏃"),
    ("orga",       "#0ea5e9", "📋"),
    ("papierkram", "#e5e7eb", "📄"),
    ("chore",      "#6b7280", "🧹"),
]

REMOVE_CATEGORIES = ["fun"]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from sqlalchemy import inspect, text
    from app.models.category import Category
    # Migrate: add sort_order column if missing
    with engine.connect() as conn:
        cols = [c["name"] for c in inspect(engine).get_columns("categories")]
        if "sort_order" not in cols:
            conn.execute(text("ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"))
            conn.commit()
    db = SessionLocal()
    try:
        for name in REMOVE_CATEGORIES:
            cat = db.query(Category).filter(Category.name == name).first()
            if cat:
                db.delete(cat)
        for sort_order, (name, color, icon) in enumerate(DEFAULT_CATEGORIES):
            existing = db.query(Category).filter(Category.name == name).first()
            if existing:
                existing.color = color
                existing.icon = icon
                existing.sort_order = sort_order
            else:
                db.add(Category(name=name, color=color, icon=icon, sort_order=sort_order))
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
