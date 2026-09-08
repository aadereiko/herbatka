"""What a model is allowed to say it saw on a tin.

The vocabularies below are not invented for this package — they are copied from
``api/app/models/catalog.py``, which is the only thing that decides what a Tea row may
contain. Extracting ``"pu-erh"`` or ``"decaf"`` produces a record that reads well and
then fails a CHECK constraint on insert, so the label space is pinned to the database's
label space here, at the point where the model's output is defined, rather than being
patched up in a mapping layer later.

If ``TeaTypeEnum`` or ``CaffeineLevelEnum`` gains a value over there, it has to gain one
here too; ``test_schema_matches_api`` (once there is a test suite) is the cheap way to
find out that it did not.
"""

from typing import Literal

from pydantic import BaseModel, Field

#: Exactly ``TeaTypeEnum`` in api/app/models/catalog.py. Note "puerh", not "pu-erh", and
#: note what is absent: there is no "fruit", "matcha" or "chai" — a fruit infusion is
#: "herbal" and a matcha is "green". Widening this list is a migration, not a guess.
TeaType = Literal["green", "black", "oolong", "puerh", "white", "herbal", "rooibos", "blend"]

#: Exactly ``CaffeineLevelEnum``. This is an ordinal *level*, not a yes/no — a decaf tin
#: is "low" or "none" depending on what it claims, and a tin that says nothing is left to
#: the caller to default rather than being asserted here.
CaffeineLevel = Literal["none", "low", "medium", "high"]

#: How much of the label the reader could actually make out. This is the field that
#: decides whether the app writes a row or asks the user, so it is required and separate
#: from ``confidence``: a perfectly legible tin can still yield an uncertain brand match,
#: and a blurred one can still be confidently the Twinings tin you photographed twice.
Legibility = Literal["clear", "partial", "unreadable"]


class TinReading(BaseModel):
    """One model's reading of one photograph, before any matching against the catalogue.

    Every field here describes *the tin*. Nothing here is a foreign key: resolving
    ``brand_text`` to a ``Brand`` row and ``ingredients_text`` to ``Ingredient`` slugs is
    a separate step with its own failure modes, and keeping it separate is what lets the
    reading be stored, re-resolved and re-scored later without re-reading the image.
    """

    verbatim_text: str = Field(
        description=(
            "Every piece of text visible on the tin, exactly as printed, in the original "
            "language and script, preserving line order. Not a summary and not a translation."
        )
    )
    brand_text: str | None = Field(
        default=None, description="The brand exactly as printed, e.g. 'TWININGS of London'."
    )
    product_text: str | None = Field(
        default=None, description="The product name exactly as printed, e.g. 'Earl Grey'."
    )
    tea_type: TeaType | None = None
    caffeine_level: CaffeineLevel | None = None
    origin_country: str | None = Field(
        default=None,
        description=(
            "Country of origin as printed. Mapped to the controlled list in "
            "api/app/core/countries.py downstream, not here."
        ),
    )
    ingredients_text: list[str] = Field(
        default_factory=list,
        description="Ingredients as printed, in printed order, one entry per ingredient.",
    )
    net_weight_g: float | None = None
    brew_temp_c: int | None = None
    brew_seconds: int | None = None

    legibility: Legibility
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence that brand_text and product_text together identify the tea.",
    )

    def is_confident(self, threshold: float = 0.75) -> bool:
        """Whether this reading may be written without a human looking at it first.

        Deliberately conservative on both axes. A partial read at high confidence is still
        a partial read, and the cost of the two outcomes is not symmetric: a miss costs one
        extra tap, a false positive puts the wrong tea in somebody's cupboard and is
        discovered, if ever, weeks later.
        """
        return self.legibility == "clear" and self.confidence >= threshold
