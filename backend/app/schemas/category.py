from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str
    color: str = "#6366f1"
    icon: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None


class CategoryOut(BaseModel):
    id: int
    name: str
    color: str
    icon: str | None

    model_config = {"from_attributes": True}
