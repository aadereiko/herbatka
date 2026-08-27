import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.catalog import TeaType


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str
    role: Literal["user", "admin"]
    avatar_url: str | None
    pronouns: str | None
    bio: str | None
    location: str | None
    favourite_tea_type: TeaType | None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut


class ProfileUpdate(BaseModel):
    """Your own profile. Every field optional, and every one clearable with null.

    Deliberately not here: email and role. Changing an email is an identity change that
    wants its own confirmation flow, and a role you can set yourself is not a role.
    """

    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    avatar_url: str | None = Field(default=None, max_length=500)
    pronouns: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=1000)
    location: str | None = Field(default=None, max_length=120)
    favourite_tea_type: TeaType | None = None
