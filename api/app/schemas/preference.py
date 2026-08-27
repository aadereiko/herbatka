import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.review import SCORE_MAX, SCORE_MIN
from app.schemas.catalog import TeaDetail
from app.schemas.review import Review as _Review  # noqa: F401  (namespace for the rebuild)
from app.schemas.review import ReviewAuthor


class ShopReview(BaseModel):
    id: uuid.UUID
    author: ReviewAuthor
    score: int
    body: str | None
    created_at: datetime
    updated_at: datetime


class ShopReviewInput(BaseModel):
    score: int = Field(ge=SCORE_MIN, le=SCORE_MAX)
    body: str | None = Field(default=None, max_length=4000)


class BrewingNote(BaseModel):
    """Your own figures for a tea. Every field optional — somebody who only ever changes
    the temperature should not have to restate the dose to say so."""

    brew_temp_c: int | None
    brew_seconds: int | None
    grams_per_100ml: float | None
    note: str | None
    updated_at: datetime


class BrewingNoteInput(BaseModel):
    brew_temp_c: int | None = Field(default=None, ge=40, le=100)
    brew_seconds: int | None = Field(default=None, gt=0, le=86400)
    grams_per_100ml: float | None = Field(default=None, gt=0, le=100)
    note: str | None = Field(default=None, max_length=2000)

    def is_empty(self) -> bool:
        """All four blank is a note that says nothing — the router deletes instead of
        writing a row the CHECK constraint would refuse anyway."""
        return not any(
            value is not None
            for value in (self.brew_temp_c, self.brew_seconds, self.grams_per_100ml, self.note)
        )


def shop_review(row: object) -> ShopReview:
    return ShopReview(
        id=row.id,  # type: ignore[attr-defined]
        author=ReviewAuthor.model_validate(row.user),  # type: ignore[attr-defined]
        score=row.score,  # type: ignore[attr-defined]
        body=row.body,  # type: ignore[attr-defined]
        created_at=row.created_at,  # type: ignore[attr-defined]
        updated_at=row.updated_at,  # type: ignore[attr-defined]
    )


def brewing_note(row: object) -> BrewingNote:
    return BrewingNote(
        brew_temp_c=row.brew_temp_c,  # type: ignore[attr-defined]
        brew_seconds=row.brew_seconds,  # type: ignore[attr-defined]
        grams_per_100ml=(
            float(row.grams_per_100ml) if row.grams_per_100ml is not None else None  # type: ignore[attr-defined]
        ),
        note=row.note,  # type: ignore[attr-defined]
        updated_at=row.updated_at,  # type: ignore[attr-defined]
    )


# The definitive rebuild of TeaDetail. This module is the only one that can see both
# forward-referenced names at once: it defines BrewingNote and imports Review for its
# author type, while schemas.catalog can import neither without a cycle.
TeaDetail.model_rebuild(_types_namespace={"Review": _Review, "BrewingNote": BrewingNote})
