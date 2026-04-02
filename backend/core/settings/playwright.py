from pathlib import Path

from .development import *  # noqa


DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
CORS_ALLOWED_ORIGINS = ["http://127.0.0.1:3100"]
CSRF_TRUSTED_ORIGINS = ["http://127.0.0.1:3100"]

PLAYWRIGHT_DB_PATH = Path(BASE_DIR) / "playwright-smoke.sqlite3"
PLAYWRIGHT_ROLE_CLASS = ".".join(
    ["api", "v1", "playwright_authentication", "PlaywrightRoleAuthentication"]
)
PLAYWRIGHT_REAL_LOGIN_SECRET = "SmokeLogin123!"
PLAYWRIGHT_LOGIN_BACKEND = ".".join(
    ["accounts", "playwright_auth_backend", "PlaywrightLoginBackend"]
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

AUTHENTICATION_BACKENDS = (
    PLAYWRIGHT_LOGIN_BACKEND,
    *tuple(globals().get("AUTHENTICATION_BACKENDS", ("django.contrib.auth.backends.ModelBackend",))),
)

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
