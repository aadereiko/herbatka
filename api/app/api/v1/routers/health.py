from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.api.deps import DbSession

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "unreachable"]
    version: str


@router.get("/health", response_model=HealthResponse)
async def health(db: DbSession) -> HealthResponse:
    """Liveness plus a real dependency check.

    A health endpoint that only proves the process is running tells you nothing you
    could not learn from `ps`. Touching the database is what makes the green dot mean
    something, so the skeleton is wired end to end from the first commit.
    """
    try:
        await db.execute(text("SELECT 1"))
        database: Literal["ok", "unreachable"] = "ok"
    except Exception:
        database = "unreachable"

    return HealthResponse(
        status="ok" if database == "ok" else "degraded",
        database=database,
        version="0.1.0",
    )
