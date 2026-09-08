from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DbSession, OptionalUser, PageParams
from app.schemas.catalog import (
    BrandOut,
    IngredientCategory,
    IngredientCreate,
    IngredientOut,
    IngredientRatingInput,
    IngredientTaste,
    TeaCreate,
    TeaDetail,
    TeaSummary,
    TeaType,
    tea_detail,
    tea_summary,
)
from app.schemas.common import Page
from app.schemas.household import TeaSeries, tea_series
from app.schemas.preference import BrewingNote, BrewingNoteInput, brewing_note
from app.schemas.review import Review, ReviewInput, review_out
from app.services import catalog as catalog_service
from app.services import consumption as consumption_service
from app.services import preference as preference_service
from app.services import review as review_service
from app.services.errors import NotFound

router = APIRouter(prefix="/catalog", tags=["catalog"])

# Anonymous browsing is deliberate: someone should be able to look a tea up and read its
# ingredients before deciding whether the app is worth an account.


@router.get("/teas", response_model=Page[TeaSummary])
async def list_teas(
    db: DbSession,
    paging: PageParams,
    viewer: OptionalUser,
    q: Annotated[str | None, Query(max_length=120)] = None,
    tea_type: TeaType | None = None,
    ingredient: Annotated[str | None, Query(max_length=120)] = None,
    brand: Annotated[str | None, Query(max_length=120)] = None,
) -> Page[TeaSummary]:
    teas, total = await catalog_service.list_teas(
        db,
        q=q,
        tea_type=tea_type,
        ingredient_slug=ingredient,
        brand_slug=brand,
        # Everything, vouched for or not. A suggestion used to vanish until an admin
        # noticed, which from the suggester's side is a form that silently failed — and
        # from a reader's side is a catalog that quietly knows about teas it will not
        # admit to. `is_approved` rides on every row instead and the client marks it.
        approved=None,
        viewer_id=viewer.id if viewer else None,
        page=paging.page,
        size=paging.size,
    )
    return Page.build(
        [tea_summary(tea, ratings) for tea, ratings in teas], total, paging.page, paging.size
    )


@router.get("/teas/{slug}/consumption", response_model=TeaSeries)
async def tea_consumption(slug: str, user: CurrentUser, db: DbSession) -> TeaSeries:
    """How much of this tea the viewer's households have been drinking, by week.

    Signed-in only, and scoped to the viewer's own shelves. The tea page around it is
    public — what is in a blend is public information — but how much of it you get
    through is household business, and this follows the same rule the feed does rather
    than the one the catalog does.
    """
    try:
        tea, _ratings = await catalog_service.get_tea_by_slug(db, slug, include_unapproved=True)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such tea") from exc
    return tea_series(await consumption_service.tea_series(db, user.id, tea.id))


@router.get("/teas/{slug}", response_model=TeaDetail)
async def get_tea(slug: str, db: DbSession, viewer: OptionalUser) -> TeaDetail:
    try:
        tea, ratings = await catalog_service.get_tea_by_slug(
            db, slug, include_unapproved=True, viewer_id=viewer.id if viewer else None
        )
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tea not found") from exc

    mine = await review_service.get_mine(db, tea.id, viewer.id) if viewer else None
    brewing = await preference_service.get_brewing(db, viewer.id, tea.id) if viewer else None
    await preference_service.attach_tea_ingredient_ratings(db, tea, viewer)
    return tea_detail(
        tea,
        ratings,
        review_out(mine) if mine else None,
        brewing_note(brewing) if brewing else None,
    )


@router.post("/teas", response_model=TeaDetail, status_code=status.HTTP_201_CREATED)
async def submit_tea(payload: TeaCreate, user: CurrentUser, db: DbSession) -> TeaDetail:
    """A signed-in user proposes a tea.

    It appears in the catalog straight away, carrying `is_approved: false` so the client
    can mark it. It used to be invisible until an admin approved it, which meant the
    suggester submitted a form and then could not find what they had added.
    """
    try:
        tea, ratings = await catalog_service.create_tea(
            db, payload, created_by=user, approved=False
        )
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await preference_service.attach_tea_ingredient_ratings(db, tea, user)
    return tea_detail(tea, ratings)


@router.get("/ingredients", response_model=Page[IngredientTaste])
async def list_ingredients(
    db: DbSession,
    paging: PageParams,
    viewer: OptionalUser,
    q: Annotated[str | None, Query(max_length=120)] = None,
    category: IngredientCategory | None = None,
) -> Page[IngredientTaste]:
    items, total = await catalog_service.list_ingredients(db, q, category, paging.page, paging.size)
    await preference_service.attach_ingredient_ratings(db, items, viewer)
    return Page.build(
        [IngredientTaste.model_validate(i) for i in items], total, paging.page, paging.size
    )


@router.post("/ingredients", response_model=IngredientOut, status_code=status.HTTP_201_CREATED)
async def suggest_ingredient(
    payload: IngredientCreate, user: CurrentUser, db: DbSession
) -> IngredientOut:
    """A signed-in reader proposes a word for the shared vocabulary.

    The mirror of `POST /catalog/teas`, and it exists for a specific moment: somebody is
    typing out a blend's recipe, the herb in it is not in the list, and the alternative to
    this endpoint is abandoning the tea. It appears immediately with `is_approved: false`.

    Admins have their own `POST /admin/ingredients`, which lands approved. Same service
    call, two arguments different.
    """
    ingredient = await catalog_service.create_ingredient(
        db, payload, created_by=user, approved=False
    )
    return IngredientOut.model_validate(ingredient)


@router.put("/ingredients/{slug}/rating", response_model=IngredientTaste)
async def rate_ingredient(
    slug: str, payload: IngredientRatingInput, user: CurrentUser, db: DbSession
) -> IngredientTaste:
    """How much you like an ingredient, 1–10.

    Returns the ingredient rather than the rating. A tea review is an object worth having
    back — it has a body, subscores, an author, a date. A rating is one integer you
    already know, and what the caller actually wants is the row it just changed, with the
    average moved: that is this.
    """
    try:
        ingredient = await catalog_service.get_ingredient_by_slug(db, slug)
    except NotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found"
        ) from exc
    await preference_service.rate_ingredient(db, user.id, ingredient.id, payload.score)
    await preference_service.attach_ingredient_ratings(db, [ingredient], user)
    return IngredientTaste.model_validate(ingredient)


@router.delete("/ingredients/{slug}/rating", status_code=status.HTTP_204_NO_CONTENT)
async def unrate_ingredient(slug: str, user: CurrentUser, db: DbSession) -> None:
    """Back to having no opinion, which is not the same as scoring it 1."""
    # Two 404s, not one. A typo in the slug and a rating you never made are different
    # mistakes, and folding them into one message sends you looking in the wrong place.
    try:
        ingredient = await catalog_service.get_ingredient_by_slug(db, slug)
    except NotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found"
        ) from exc
    try:
        await preference_service.clear_ingredient_rating(db, user.id, ingredient.id)
    except NotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No rating to remove"
        ) from exc


@router.get("/brands", response_model=Page[BrandOut])
async def list_brands(
    db: DbSession,
    paging: PageParams,
    q: Annotated[str | None, Query(max_length=120)] = None,
) -> Page[BrandOut]:
    items, total = await catalog_service.list_brands(db, q, paging.page, paging.size)
    return Page.build([BrandOut.model_validate(b) for b in items], total, paging.page, paging.size)


# ------------------------------------------------------------------------- reviews


@router.get("/teas/{slug}/reviews", response_model=Page[Review])
async def list_reviews(slug: str, db: DbSession, paging: PageParams) -> Page[Review]:
    """Public: you can read what people think before deciding to make an account."""
    try:
        reviews, total = await review_service.list_for_tea(
            db, slug, page=paging.page, size=paging.size
        )
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tea not found") from exc
    return Page.build([review_out(r) for r in reviews], total, paging.page, paging.size)


@router.put("/teas/{slug}/review", response_model=Review)
async def write_review(slug: str, payload: ReviewInput, user: CurrentUser, db: DbSession) -> Review:
    """PUT, not POST: one review per person per tea, so writing it is idempotent."""
    try:
        return review_out(await review_service.upsert(db, slug, payload, user))
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tea not found") from exc


@router.delete("/teas/{slug}/review", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(slug: str, user: CurrentUser, db: DbSession) -> None:
    try:
        await review_service.delete_mine(db, slug, user.id)
    except NotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="You have not reviewed that tea"
        ) from exc


# --------------------------------------------------------------------- favourites


async def _approved_tea(db: DbSession, slug: str):
    from app.services import catalog as service

    try:
        tea, _ = await service.get_tea_by_slug(db, slug, include_unapproved=True)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tea not found") from exc
    return tea


@router.put("/teas/{slug}/favourite", status_code=status.HTTP_204_NO_CONTENT)
async def favourite_tea(slug: str, user: CurrentUser, db: DbSession) -> None:
    """A star, not a score — you can love a tea you have never got round to rating.
    Idempotent, so a double tap is not a 409."""
    tea = await _approved_tea(db, slug)
    await preference_service.set_favourite_tea(db, user.id, tea.id, on=True)


@router.delete("/teas/{slug}/favourite", status_code=status.HTTP_204_NO_CONTENT)
async def unfavourite_tea(slug: str, user: CurrentUser, db: DbSession) -> None:
    tea = await _approved_tea(db, slug)
    await preference_service.set_favourite_tea(db, user.id, tea.id, on=False)


# ------------------------------------------------------------------ brewing notes


@router.put("/teas/{slug}/brewing", response_model=BrewingNote)
async def set_brewing(
    slug: str, payload: BrewingNoteInput, user: CurrentUser, db: DbSession
) -> BrewingNote:
    """How *you* brew it, as opposed to what the packet says.

    An entirely blank note is a row that says nothing, so it deletes instead — which is
    also what the CHECK constraint would otherwise refuse.
    """
    tea = await _approved_tea(db, slug)
    if payload.is_empty():
        # Refused, and nothing changes. An earlier version deleted the existing note on
        # the way to raising this, which is the worst of both: the caller is told the
        # request failed while something did happen. Removing a note is what DELETE is
        # for, and it says so.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Set at least one of temperature, time, dose or a note — "
                "or delete the note to go back to the catalog's figures."
            ),
        )
    return brewing_note(await preference_service.upsert_brewing(db, user.id, tea.id, payload))


@router.delete("/teas/{slug}/brewing", status_code=status.HTTP_204_NO_CONTENT)
async def clear_brewing(slug: str, user: CurrentUser, db: DbSession) -> None:
    """Removing yours falls back to the catalog's figures, which never went anywhere."""
    tea = await _approved_tea(db, slug)
    try:
        await preference_service.delete_brewing(db, user.id, tea.id)
    except NotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="You have no notes for that tea"
        ) from exc
