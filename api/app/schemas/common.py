from math import ceil

from pydantic import BaseModel

DEFAULT_PAGE_SIZE = 24
MAX_PAGE_SIZE = 100


class Page[T](BaseModel):
    """One page of results plus enough context to render a pager.

    `pages` is included rather than left to the client: every consumer would otherwise
    recompute ceil(total / size), and get the total == 0 case subtly wrong.
    """

    items: list[T]
    total: int
    page: int
    size: int
    pages: int

    @classmethod
    def build(cls, items: list[T], total: int, page: int, size: int) -> "Page[T]":
        return cls(items=items, total=total, page=page, size=size, pages=ceil(total / size) or 1)
