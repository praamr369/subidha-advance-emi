import os
from pathlib import Path

os.environ["DJANGO_ENV"] = "development"
os.environ.setdefault("DJANGO_DEBUG", "true")
os.environ.setdefault(
    "DJANGO_SECRET_KEY",
    "playwright-smoke-only-django-secret-key-2026-not-for-production-7g3m2x9q",
)
os.environ.setdefault(
    "JWT_SIGNING_KEY",
    "playwright-smoke-only-jwt-signing-key-2026-not-for-production-4h8k1v",
)

from .development import *  # noqa


DEBUG = True
SECRET_KEY = "playwright-smoke-only-django-secret-key-2026-not-for-production-7g3m2x9q"
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
CORS_ALLOWED_ORIGINS = ["http://127.0.0.1:3100"]
CSRF_TRUSTED_ORIGINS = ["http://127.0.0.1:3100"]

PLAYWRIGHT_DB_PATH = Path(
    os.environ.get("PLAYWRIGHT_DB_PATH", "/tmp/subidha-playwright-smoke.sqlite3")
)
PLAYWRIGHT_SMOKE_META_PATH = Path(
    os.environ.get(
        "PLAYWRIGHT_SMOKE_META_PATH",
        str(Path(BASE_DIR) / "playwright-smoke-meta.json"),
    )
)
PLAYWRIGHT_ROLE_CLASS = ".".join(
    ["api", "v1", "playwright_authentication", "PlaywrightRoleAuthentication"]
)
PLAYWRIGHT_REAL_LOGIN_SECRET = "SmokeLogin123!"
PLAYWRIGHT_LOGIN_BACKEND = ".".join(
    ["accounts", "playwright_auth_backend", "PlaywrightLoginBackend"]
)
PLAYWRIGHT_JWT_SIGNING_KEY = (
    "playwright-smoke-only-jwt-signing-key-2026-not-for-production-4h8k1v"
)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": str(PLAYWRIGHT_DB_PATH),
    }
}

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_AUTHENTICATION_CLASSES": (
        PLAYWRIGHT_ROLE_CLASS,
        *tuple(REST_FRAMEWORK.get("DEFAULT_AUTHENTICATION_CLASSES", ())),
    ),
}

SIMPLE_JWT = {
    **SIMPLE_JWT,
    "SIGNING_KEY": PLAYWRIGHT_JWT_SIGNING_KEY,
}

AUTHENTICATION_BACKENDS = (
    PLAYWRIGHT_LOGIN_BACKEND,
    *tuple(globals().get("AUTHENTICATION_BACKENDS", ("django.contrib.auth.backends.ModelBackend",))),
)

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
