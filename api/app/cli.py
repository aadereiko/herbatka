"""Small operational commands. Run with: uv run python -m app.cli <command> [args]"""

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.user import User


async def promote_admin(email: str) -> int:
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            print(f"No user with email {email!r}", file=sys.stderr)
            return 1
        user.role = "admin"
        await session.commit()
        print(f"{email} is now an admin")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    promote = sub.add_parser("promote-admin", help="Grant a user the admin role")
    promote.add_argument("email")

    args = parser.parse_args()
    if args.command == "promote-admin":
        return asyncio.run(promote_admin(args.email))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
