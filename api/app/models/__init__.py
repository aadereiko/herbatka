"""Import every model here so Alembic autogenerate can see the full metadata."""

from app.db.base import Base
from app.models.catalog import (
    Brand,
    CaffeineLevelEnum,
    Ingredient,
    IngredientCategoryEnum,
    Tea,
    TeaIngredient,
    TeaTypeEnum,
)
from app.models.household import (
    Household,
    HouseholdInvite,
    HouseholdMember,
    MemberRoleEnum,
    StockEvent,
    StockEventKindEnum,
    StockItem,
)
from app.models.review import Review
from app.models.user import AuthIdentity, AuthProvider, RefreshToken, User, UserRole

__all__ = [
    "AuthIdentity",
    "AuthProvider",
    "Base",
    "Brand",
    "CaffeineLevelEnum",
    "Household",
    "HouseholdInvite",
    "HouseholdMember",
    "Ingredient",
    "IngredientCategoryEnum",
    "MemberRoleEnum",
    "RefreshToken",
    "Review",
    "StockEvent",
    "StockEventKindEnum",
    "StockItem",
    "Tea",
    "TeaIngredient",
    "TeaTypeEnum",
    "User",
    "UserRole",
]
