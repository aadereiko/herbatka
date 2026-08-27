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
from app.models.friendship import Friendship, FriendshipStatusEnum, canonical_pair
from app.models.household import (
    Household,
    HouseholdInvite,
    HouseholdMember,
    MemberRoleEnum,
    StockEvent,
    StockEventKindEnum,
    StockItem,
)
from app.models.preference import BrewingNote, FavouriteShop, FavouriteTea, ShopReview
from app.models.review import Review
from app.models.shop import Shop, ShopListing
from app.models.user import AuthIdentity, AuthProvider, RefreshToken, User, UserRole

__all__ = [
    "AuthIdentity",
    "AuthProvider",
    "Base",
    "BrewingNote",
    "Brand",
    "CaffeineLevelEnum",
    "Friendship",
    "FriendshipStatusEnum",
    "FavouriteShop",
    "FavouriteTea",
    "Household",
    "HouseholdInvite",
    "HouseholdMember",
    "Ingredient",
    "IngredientCategoryEnum",
    "MemberRoleEnum",
    "RefreshToken",
    "Review",
    "Shop",
    "ShopListing",
    "ShopReview",
    "StockEvent",
    "StockEventKindEnum",
    "StockItem",
    "Tea",
    "TeaIngredient",
    "TeaTypeEnum",
    "User",
    "UserRole",
    "canonical_pair",
]
