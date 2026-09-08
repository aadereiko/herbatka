import uuid

from fastapi import APIRouter

from app.api.deps import DbSession, Membership
from app.schemas.household import HouseholdConsumption, household_consumption
from app.services import consumption as consumption_service

# Its own router rather than a route on the stock one, for a routing reason and a
# semantic one. Routing: the stock router's paths are `/stock/{item_id}` with a UUID
# parameter, and `/stock/consumption` would only work by being declared above it — a
# collision waiting for the next person who reorders the file. Semantic: this reads the
# whole shelf and the people on it, which is a fact about the *household* rather than
# about any tin.
#
# Nested under the household so that membership — checked by the Membership dependency —
# is structurally impossible to forget. That matters more here than on a single tin: this
# endpoint reports who has been drinking what, which is the most private thing the app
# computes.
router = APIRouter(prefix="/households/{household_id}/consumption", tags=["stock"])


@router.get("", response_model=HouseholdConsumption)
async def household_consumption_summary(
    household_id: uuid.UUID, _: Membership, db: DbSession
) -> HouseholdConsumption:
    return household_consumption(await consumption_service.household_summary(db, household_id))
