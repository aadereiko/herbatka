class ServiceError(Exception):
    """Base for domain errors.

    Services raise these instead of HTTPException so the rules stay testable without an
    HTTP client, and so the same service can later back a CLI or a worker. Routers do
    the translation to status codes.
    """


class EmailAlreadyRegistered(ServiceError):
    pass


class InvalidCredentials(ServiceError):
    pass


class InvalidRefreshToken(ServiceError):
    pass


class NotFound(ServiceError):
    pass


class IngredientInUse(ServiceError):
    """Deleting an ingredient that teas still reference would rewrite their recipes."""


class NotAMember(ServiceError):
    """Surfaced as 404, never 403 — see app/api/deps.get_membership."""


class NotTheOwner(ServiceError):
    pass


class InviteExpired(ServiceError):
    pass


class AlreadyAMember(ServiceError):
    pass


class LastOwnerCannotLeave(ServiceError):
    pass


class InsufficientStock(ServiceError):
    """Brewing or discarding more than the tin holds."""


class CannotBefriendYourself(ServiceError):
    pass


class AlreadyConnected(ServiceError):
    """Already friends, or a request between the two is already open."""


class Blocked(ServiceError):
    """Surfaced as 404, never as "you are blocked" — see the router."""
