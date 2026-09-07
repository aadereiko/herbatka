import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core import countries
from app.schemas.catalog import TeaType
from app.schemas.common import Country


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
    status: str | None
    city: str | None
    #: Resolved from `country_code` by `user_out` — the model stores the code.
    country: Country | None
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
    status: str | None = Field(default=None, max_length=140)
    city: str | None = Field(default=None, max_length=120)
    #: An ISO 3166-1 alpha-2 code, or null to clear it. Normalised and checked below.
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    favourite_tea_type: TeaType | None = None

    @field_validator("country_code")
    @classmethod
    def known_country(cls, value: str | None) -> str | None:
        """Upper-cases first, then checks membership.

        Normalising before validating means a client sending `pl` is corrected rather
        than rejected — the case of a two-letter code is not a thing worth failing a form
        over, and the column's CHECK constraint requires upper-case anyway.

        The error names the field and the problem rather than listing 249 valid values,
        which no error message can usefully carry; the picker is the discovery mechanism.
        """
        if value is None:
            return None
        code = value.upper()
        if not countries.is_valid(code):
            raise ValueError("not a known ISO 3166-1 alpha-2 country code")
        return code


def country_ref(code: str | None) -> Country | None:
    """`PL` -> `{code: "PL", name: "Poland"}`, or None.

    Tolerates a code the list does not know rather than raising. Writes are validated, so
    the only way an unknown code reaches here is a row that predates a list change or was
    written straight to the database — and a profile page that 500s because a country was
    renamed is worse than one that shows the code.
    """
    if code is None:
        return None
    return Country(code=code, name=countries.NAMES.get(code, code))


def user_out(user: Any) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        avatar_url=user.avatar_url,
        pronouns=user.pronouns,
        bio=user.bio,
        status=user.status,
        city=user.city,
        country=country_ref(user.country_code),
        favourite_tea_type=user.favourite_tea_type,
        created_at=user.created_at,
    )
