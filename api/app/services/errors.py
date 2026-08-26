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
