from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


def _parse_list(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _is_local_dev_mode() -> bool:
    env_name = (os.getenv("DJANGO_ENV") or os.getenv("ENVIRONMENT") or "development").strip().lower()
    debug_flag = _parse_bool(os.getenv("DJANGO_DEBUG"), default=False)
    return env_name in {"dev", "development", "local"} or debug_flag


def _get_secret_key() -> str:
    secret = os.getenv("DJANGO_SECRET_KEY")
    if secret:
        return secret

    if _is_local_dev_mode():
        return "local-development-only-secret-key"

    raise RuntimeError(
        "DJANGO_SECRET_KEY environment variable is required when DEBUG is disabled."
    )


def _database_from_url(default: str | None = None) -> dict[str, str | int]:
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        if _is_local_dev_mode():
            database_url = default or "postgresql://subidha_furniture:subidha_password@localhost:5432/subidha_core"
        else:
            raise RuntimeError(
                "DATABASE_URL environment variable is required when DEBUG is disabled."
            )

    parsed = urlparse(database_url)
    engine_map = {
        "postgres": "django.db.backends.postgresql",
        "postgresql": "django.db.backends.postgresql",
    }

    if parsed.scheme not in engine_map:
        raise RuntimeError("DATABASE_URL must use postgres/postgresql scheme.")

    db_name = parsed.path.lstrip("/")
    db_user = parsed.username
    db_password = parsed.password
    db_host = parsed.hostname
    db_port = parsed.port or 5432

    if not db_name:
        raise RuntimeError("DATABASE_URL must include a database name.")

    if not db_host:
        raise RuntimeError("DATABASE_URL must include a database host.")

    if not db_user:
        if _is_local_dev_mode():
            db_user = "subidha_furniture"
        else:
            raise RuntimeError("DATABASE_URL must include a database username.")

    if db_password is None:
        if _is_local_dev_mode():
            db_password = "subidha_password"
        else:
            raise RuntimeError("DATABASE_URL must include a database password.")

    return {
        "ENGINE": engine_map[parsed.scheme],
        "NAME": db_name,
        "USER": db_user,
        "PASSWORD": db_password,
        "HOST": db_host,
        "PORT": db_port,
    }


_load_dotenv(BASE_DIR / ".env")

SECRET_KEY = _get_secret_key()
DEBUG = _parse_bool(os.getenv("DJANGO_DEBUG"), default=False)
ALLOWED_HOSTS = _parse_list(
    os.getenv("DJANGO_ALLOWED_HOSTS"),
    ["localhost", "127.0.0.1"],
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "django_filters",
    "rest_framework_simplejwt.token_blacklist",
    "accounts",
    "api",
    "subscriptions",
    "django_extensions",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"
WSGI_APPLICATION = "core.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": _database_from_url(
        "postgresql://subidha_furniture:ADRIKA1004@@localhost:5432/subidha_core"
    )
}
DATABASES["default"]["ATOMIC_REQUESTS"] = True

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(hours=12),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "UPDATE_LAST_LOGIN": True,
}

CORS_ALLOWED_ORIGINS = _parse_list(
    os.getenv("CORS_ALLOWED_ORIGINS"),
    ["http://localhost:3000"],
)
CORS_ALLOW_CREDENTIALS = True

SECURE_SSL_REDIRECT = _parse_bool(os.getenv("SECURE_SSL_REDIRECT"), default=not DEBUG)
SESSION_COOKIE_SECURE = _parse_bool(os.getenv("SESSION_COOKIE_SECURE"), default=not DEBUG)
CSRF_COOKIE_SECURE = _parse_bool(os.getenv("CSRF_COOKIE_SECURE"), default=not DEBUG)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "structured": {
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "structured",
        }
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "subidha-core-cache",
    }
}