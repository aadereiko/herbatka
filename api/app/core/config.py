from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The .env lives at the repo root, one level above api/, so the same file feeds
# both docker-compose and the API. Resolving from __file__ means it is found no
# matter which directory uvicorn was launched from.
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://herbatka:herbatka@localhost:17312/herbatka"
    api_port: int = 17311
    web_port: int = 17310
    cors_origins: str = "http://localhost:17310"

    # Secure cookies require HTTPS, which localhost dev is not. Production must
    # override this to true.
    cookie_secure: bool = False
    refresh_cookie_name: str = "herbatka_refresh"

    # Uploaded images live on local disk in dev. Swapping this for an S3-compatible
    # store later is a change to app/services/images.py alone, because everything else
    # only ever sees the returned URL.
    media_root: str = str(REPO_ROOT / "api" / "media")
    media_url_prefix: str = "/media"

    jwt_secret: str = "change-me-in-any-non-local-environment"
    access_token_ttl_seconds: int = 900
    refresh_token_ttl_days: int = 30

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
