from fastapi import APIRouter

from app.api.v1.routers import (
    admin,
    auth,
    catalog,
    favourites,
    friends,
    health,
    home,
    households,
    profile,
    reviews,
    shops,
    stock,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(catalog.router)
api_router.include_router(admin.router)
api_router.include_router(households.router)
api_router.include_router(stock.router)
api_router.include_router(reviews.router)
api_router.include_router(friends.router)
api_router.include_router(shops.router)
api_router.include_router(home.router)
api_router.include_router(profile.router)
api_router.include_router(favourites.router)
