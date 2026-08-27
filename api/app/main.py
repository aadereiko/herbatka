from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1 import api_router
from app.core.config import get_settings
from app.services.images import media_root

settings = get_settings()

app = FastAPI(
    title="Herbatka API",
    version="0.1.0",
    description="Tea tracking: catalog, households, stock, ratings, friends.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,  # refresh token travels as an httpOnly cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

# Uploaded images, served straight off disk in dev. In production this prefix would be
# handled by the reverse proxy or a CDN instead, which is why the URL is a setting.
app.mount(
    settings.media_url_prefix,
    StaticFiles(directory=str(media_root()), check_dir=False),
    name="media",
)
