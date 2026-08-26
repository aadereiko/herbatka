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
from app.models.user import AuthIdentity, AuthProvider, RefreshToken, User, UserRole

__all__ = [
    "AuthIdentity",
    "AuthProvider",
    "Base",
    "Brand",
    "CaffeineLevelEnum",
    "Ingredient",
    "IngredientCategoryEnum",
    "RefreshToken",
    "Tea",
    "TeaIngredient",
    "TeaTypeEnum",
    "User",
    "UserRole",
]
