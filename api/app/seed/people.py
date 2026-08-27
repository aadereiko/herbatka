"""Optional dev data: a few people to be friends with, and things they have opinions on.

Separate from the catalog seed and never run by it. The catalog is shared reference data
that belongs in any environment; these are fictional accounts with a known password, and
creating those automatically anywhere but a laptop would be a security bug rather than a
convenience.
"""

import asyncio
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.catalog import Tea
from app.models.friendship import Friendship
from app.models.preference import FavouriteShop, FavouriteTea, ShopReview
from app.models.review import Review
from app.models.shop import Shop
from app.models.user import AuthIdentity, User
from app.services.friend import canonical_pair

PASSWORD = "herbatka-dev-1"

# (email, display name, pronouns, location, favourite type, bio)
PEOPLE: list[tuple[str, str, str | None, str, str, str]] = [
    (
        "ada@example.com",
        "Ada Chmiel",
        "she/her",
        "Kraków, Poland",
        "green",
        "Sencha in the morning, gyokuro when the week has been kind. Keeps a "
        "thermometer in the kitchen drawer.",
    ),
    (
        "tomek@example.com",
        "Tomek Wróbel",
        "he/him",
        "Warsaw, Poland",
        "puerh",
        "Came for the caffeine, stayed for the fermentation. Will talk your ear off "
        "about storage humidity.",
    ),
    (
        "ines@example.com",
        "Inés Ferreira",
        "she/her",
        "Porto, Portugal",
        "oolong",
        "Roasted oolongs and nothing before eleven.",
    ),
    (
        "jo@example.com",
        "Jo Lindqvist",
        "they/them",
        "Malmö, Sweden",
        "white",
        "Silver needle, water barely off the boil, and absolutely no rush.",
    ),
    (
        "hana@example.com",
        "Hana Dvořák",
        "she/her",
        "Brno, Czechia",
        "herbal",
        "Off caffeine since 2024. Chamomile evangelist, entirely unrepentant.",
    ),
    (
        "piotr@example.com",
        "Piotr Zając",
        "he/him",
        "Gdańsk, Poland",
        "black",
        "Builder's tea, but the good leaves. Two sugars is a personal matter.",
    ),
]

# (email, tea slug, score, note)
OPINIONS: list[tuple[str, str, int, str | None]] = [
    ("ada@example.com", "sencha", 9, "Grassy and clean. 70°C or it turns to spinach water."),
    ("ada@example.com", "gunpowder-green", 6, "Fine for iced, a bit rough hot."),
    ("ada@example.com", "jasmine-pearls", 10, "The one I buy when someone has had a bad week."),
    ("tomek@example.com", "shou-pu-erh", 10, "Earthy in the good way. Ages well in a paper bag."),
    ("tomek@example.com", "masala-chai", 7, "Wants more ginger than the packet suggests."),
    ("tomek@example.com", "english-breakfast", 5, "Inoffensive. That is the review."),
    ("ines@example.com", "tie-guan-yin", 10, "Orchid, cream, and about eight steeps."),
    ("ines@example.com", "milk-oolong", 8, "Suspiciously creamy. I have stopped asking why."),
    ("jo@example.com", "silver-needle", 9, "Do not boil the water. I cannot stress this enough."),
    ("jo@example.com", "elderflower-white", 8, "Tastes like a hedge in June, in a good way."),
    ("hana@example.com", "chamomile-dream", 9, "Actually helps. Not a placebo, fight me."),
    ("hana@example.com", "peppermint-leaf", 8, "After dinner, every night, for years."),
    ("piotr@example.com", "english-breakfast", 9, "Strong enough to stand a spoon in."),
    ("piotr@example.com", "earl-grey", 7, "Bergamot is a lot before nine in the morning."),
]

# (email, shop slug, score, note)
SHOP_OPINIONS: list[tuple[str, str, int, str | None]] = [
    ("ada@example.com", "czajnik", 9, "They let you smell everything. Dangerous for the wallet."),
    ("tomek@example.com", "yunnan-direct", 8, "Slow postage, honest harvest dates."),
    ("ines@example.com", "leaf-lore", 9, "Small batches and they actually answer emails."),
    ("jo@example.com", "torret-blad", 10, "Walk in for one thing, leave with four."),
    ("hana@example.com", "basar-herbat", 7, "Cash only, which caught me out twice."),
    ("piotr@example.com", "czajnik", 8, "Worth the trip from Gdańsk. Just about."),
]

FAVOURITE_TEAS = [
    ("ada@example.com", "jasmine-pearls"),
    ("ada@example.com", "sencha"),
    ("tomek@example.com", "shou-pu-erh"),
    ("ines@example.com", "tie-guan-yin"),
    ("jo@example.com", "silver-needle"),
    ("hana@example.com", "chamomile-dream"),
    ("piotr@example.com", "english-breakfast"),
]
FAVOURITE_SHOPS = [
    ("ada@example.com", "czajnik"),
    ("ines@example.com", "leaf-lore"),
    ("jo@example.com", "torret-blad"),
]


async def seed_people(befriend_email: str) -> dict[str, int]:
    created = {"people": 0, "friendships": 0, "reviews": 0, "shop_reviews": 0, "favourites": 0}

    async with SessionLocal() as session:
        you = await session.scalar(select(User).where(User.email == befriend_email))
        if you is None:
            raise SystemExit(f"No account with email {befriend_email!r} — sign up first.")

        by_email: dict[str, User] = {}
        for email, name, pronouns, location, favourite, bio in PEOPLE:
            person = await session.scalar(select(User).where(User.email == email))
            if person is None:
                person = User(
                    email=email,
                    display_name=name,
                    pronouns=pronouns,
                    location=location,
                    favourite_tea_type=favourite,
                    bio=bio,
                )
                person.identities.append(
                    AuthIdentity(
                        provider="password",
                        provider_subject=email.lower(),
                        password_hash=hash_password(PASSWORD),
                    )
                )
                session.add(person)
                created["people"] += 1
            by_email[email] = person
        await session.flush()

        for person in by_email.values():
            a, b = canonical_pair(you.id, person.id)
            existing = await session.scalar(
                select(Friendship).where(Friendship.user_a_id == a, Friendship.user_b_id == b)
            )
            if existing is None:
                from datetime import UTC, datetime

                session.add(
                    Friendship(
                        user_a_id=a,
                        user_b_id=b,
                        status="accepted",
                        requested_by_id=person.id,
                        responded_at=datetime.now(UTC),
                    )
                )
                created["friendships"] += 1

        teas = {t.slug: t for t in await session.scalars(select(Tea))}
        shops = {s.slug: s for s in await session.scalars(select(Shop))}

        for email, slug, score, body in OPINIONS:
            tea = teas.get(slug)
            if tea is None:
                continue
            person = by_email[email]
            if await session.scalar(
                select(Review).where(Review.user_id == person.id, Review.tea_id == tea.id)
            ):
                continue
            session.add(Review(user_id=person.id, tea_id=tea.id, score=score, body=body))
            created["reviews"] += 1

        for email, slug, score, body in SHOP_OPINIONS:
            shop = shops.get(slug)
            if shop is None:
                continue
            person = by_email[email]
            if await session.scalar(
                select(ShopReview).where(
                    ShopReview.user_id == person.id, ShopReview.shop_id == shop.id
                )
            ):
                continue
            session.add(ShopReview(user_id=person.id, shop_id=shop.id, score=score, body=body))
            created["shop_reviews"] += 1

        for email, slug in FAVOURITE_TEAS:
            tea = teas.get(slug)
            if tea is None:
                continue
            person = by_email[email]
            if await session.get(FavouriteTea, (person.id, tea.id)) is None:
                session.add(FavouriteTea(user_id=person.id, tea_id=tea.id))
                created["favourites"] += 1

        for email, slug in FAVOURITE_SHOPS:
            shop = shops.get(slug)
            if shop is None:
                continue
            person = by_email[email]
            if await session.get(FavouriteShop, (person.id, shop.id)) is None:
                session.add(FavouriteShop(user_id=person.id, shop_id=shop.id))
                created["favourites"] += 1

        await session.commit()

    return created


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m app.seed.people <your-email>")
    created = asyncio.run(seed_people(sys.argv[1]))
    print(
        f"{created['people']} people, {created['friendships']} friendships, "
        f"{created['reviews']} tea reviews, {created['shop_reviews']} shop reviews, "
        f"{created['favourites']} favourites."
    )


if __name__ == "__main__":
    main()
