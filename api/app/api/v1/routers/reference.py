from fastapi import APIRouter

from app.core import countries
from app.schemas.common import Country

# Reference data: things that are true regardless of who is asking and change about once
# a decade. Public and unauthenticated, because the register and settings forms need the
# list before anybody has an account.
router = APIRouter(tags=["reference"])


@router.get("/countries", response_model=list[Country])
async def list_countries() -> list[Country]:
    """Every ISO 3166-1 alpha-2 country, sorted by name.

    Served rather than hardcoded in the client so the picker and the validator cannot
    disagree: a country in the dropdown that the API rejects is a form nobody can submit,
    and a country the API accepts that is missing from the dropdown is one nobody can
    choose. One list, one place.

    Sorted here rather than in the client because it is a fixed answer to a fixed
    question, and doing it once on the server beats doing it in every browser. Note the
    sort is by *name*: `NAMES` is keyed by code, so its natural order puts Åland second
    and Zimbabwe nowhere near the bottom.
    """
    return sorted(
        (Country(code=code, name=name) for code, name in countries.NAMES.items()),
        key=lambda c: c.name,
    )
