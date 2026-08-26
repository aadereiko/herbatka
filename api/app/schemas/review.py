import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.review import SCORE_MAX, SCORE_MIN
from app.schemas.catalog import TeaDetail
from app.schemas.household import TeaRef

Score = Field(ge=SCORE_MIN, le=SCORE_MAX)
OptionalScore = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX)


class ReviewAuthor(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_name: str
    avatar_url: str | None


class Review(BaseModel):
    id: uuid.UUID
    author: ReviewAuthor
    score: int
    aroma: int | None
    flavour: int | None
    aftertaste: int | None
    body: str | None
    brewed_at: date | None
    created_at: datetime
    updated_at: datetime


class MyReview(Review):
    tea: TeaRef


class ReviewInput(BaseModel):
    """A full replacement, not a merge.

    Every field is sent on each write, so "remove the aroma score I gave" is
    expressible. A merge-patch would make an omitted field ambiguous between "leave it"
    and "clear it".
    """

    score: int = Score
    aroma: int | None = OptionalScore
    flavour: int | None = OptionalScore
    aftertaste: int | None = OptionalScore
    body: str | None = Field(default=None, max_length=4000)
    brewed_at: date | None = None


def review_out(row: Any) -> Review:
    return Review(
        id=row.id,
        author=ReviewAuthor.model_validate(row.user),
        score=row.score,
        aroma=row.aroma,
        flavour=row.flavour,
        aftertaste=row.aftertaste,
        body=row.body,
        brewed_at=row.brewed_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def my_review_out(row: Any) -> MyReview:
    return MyReview(**review_out(row).model_dump(), tea=TeaRef.model_validate(row.tea))


# Resolves TeaDetail.my_review, which is a forward reference to Review because
# schemas.catalog cannot import this module at runtime without a cycle.
TeaDetail.model_rebuild()
