from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent.parent
LOCAL_DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
LOCAL_DEV_SECRET_KEY = "local-development-only-secret-key"
MIN_DJANGO_SECRET_KEY_LENGTH = 50
MIN_JWT_SIGNING_KEY_LENGTH = 32
DISALLOWED_SECRET_VALUES = {
    "change-me",
    "change-this-local-key",
    "ci-only-deploy-validation-secret-key",
    "local-development-only-secret-key",
    "unsafe-dev-key",
    "your-real-secret-key",
}


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


def _parse_list(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


def _parse_choice(value: str | None, default: str, allowed: set[str], name: str) -> str:
    candidate = (value or default).strip()
    if candidate not in allowed:
        raise RuntimeError(f"{name} must be one of: {', '.join(sorted(allowed))}.")
    return candidate


def _parse_int(
    value: str | None,
    default: int,
    *,
    minimum: int | None = None,
    name: str,
) -> int:
    candidate = default if value is None else value
    try:
        parsed = int(str(candidate).strip())
    except (TypeError, ValueError):
        raise RuntimeError(f"{name} must be an integer.")

    if minimum is not None and parsed < minimum:
        raise RuntimeError(f"{name} must be at least {minimum}.")

    return parsed


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


def _get_environment_name() -> str:
    return (os.getenv("DJANGO_ENV") or os.getenv("ENVIRONMENT") or "development").strip().lower()


def _is_local_dev_mode() -> bool:
    return _get_environment_name() in {"dev", "development", "local"}


def _validate_origin(origin: str, setting_name: str) -> str:
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise RuntimeError(
            f"{setting_name} entries must be full origins with http/https scheme: {origin}"
        )
    if parsed.path not in {"", "/"}:
        raise RuntimeError(
            f"{setting_name} entries must not include a path component: {origin}"
        )
    return f"{parsed.scheme}://{parsed.netloc}"


def _parse_origin_list(value: str | None, default: list[str], setting_name: str) -> list[str]:
    items = _parse_list(value, default)
    return [_validate_origin(item, setting_name) for item in items]


def _parse_allowed_hosts(value: str | None, default: list[str]) -> list[str]:
    hosts = _parse_list(value, default)
    normalized: list[str] = []
    for host in hosts:
        if "://" in host or "/" in host:
            raise RuntimeError(
                f"DJANGO_ALLOWED_HOSTS entries must be bare hosts, not URLs: {host}"
            )
        if ":" in host and host != "[::1]":
            raise RuntimeError(
                f"DJANGO_ALLOWED_HOSTS entries must not include ports: {host}"
            )
        if host == "*" and not _is_local_dev_mode():
            raise RuntimeError("Wildcard DJANGO_ALLOWED_HOSTS is not allowed outside local development.")
        normalized.append(host)
    return normalized


def _validate_secret_value(secret: str, *, name: str, minimum_length: int) -> str:
    normalized = secret.strip()
    lowered = normalized.lower()

    if not normalized:
        raise RuntimeError(f"{name} must not be blank.")
    if len(normalized) < minimum_length:
        raise RuntimeError(
            f"{name} must be at least {minimum_length} characters long."
        )
    if len(set(normalized)) < 5:
        raise RuntimeError(
            f"{name} must contain at least 5 unique characters."
        )
    if lowered.startswith("django-insecure-"):
        raise RuntimeError(
            f"{name} must not use a Django auto-generated fallback value."
        )
    if lowered in DISALLOWED_SECRET_VALUES:
        raise RuntimeError(
            f"{name} must not use a development/test placeholder value."
        )

    return normalized


def _get_secret_key() -> str:
    secret = os.getenv("DJANGO_SECRET_KEY")
    if secret:
        if not _is_local_dev_mode():
            return _validate_secret_value(
                secret,
                name="DJANGO_SECRET_KEY",
                minimum_length=MIN_DJANGO_SECRET_KEY_LENGTH,
            )
        return secret.strip()

    if _is_local_dev_mode():
        return LOCAL_DEV_SECRET_KEY

    raise RuntimeError(
        "DJANGO_SECRET_KEY environment variable is required outside local development."
    )


def _get_jwt_signing_key(secret_key: str) -> str:
    jwt_signing_key = os.getenv("JWT_SIGNING_KEY")
    if jwt_signing_key:
        if not _is_local_dev_mode():
            return _validate_secret_value(
                jwt_signing_key,
                name="JWT_SIGNING_KEY",
                minimum_length=MIN_JWT_SIGNING_KEY_LENGTH,
            )
        return jwt_signing_key.strip()

    if not _is_local_dev_mode():
        _validate_secret_value(
            secret_key,
            name="DJANGO_SECRET_KEY",
            minimum_length=MIN_DJANGO_SECRET_KEY_LENGTH,
        )

    return secret_key


def _get_allowed_hosts() -> list[str]:
    raw_hosts = os.getenv("DJANGO_ALLOWED_HOSTS")
    if raw_hosts:
        hosts = _parse_allowed_hosts(raw_hosts, [])
        if hosts:
            return hosts

    if _is_local_dev_mode():
        return ["localhost", "127.0.0.1", "[::1]"]

    raise RuntimeError(
        "DJANGO_ALLOWED_HOSTS must be set outside local development."
    )


def _get_cors_allowed_origins() -> list[str]:
    raw_origins = os.getenv("CORS_ALLOWED_ORIGINS")
    if raw_origins is not None:
        return _parse_origin_list(raw_origins, [], "CORS_ALLOWED_ORIGINS")

    if _is_local_dev_mode():
        return LOCAL_DEV_ORIGINS

    return []


def _get_csrf_trusted_origins(cors_allowed_origins: list[str]) -> list[str]:
    raw_origins = os.getenv("CSRF_TRUSTED_ORIGINS")
    if raw_origins is not None:
        return _parse_origin_list(raw_origins, [], "CSRF_TRUSTED_ORIGINS")

    if _is_local_dev_mode():
        return LOCAL_DEV_ORIGINS

    if cors_allowed_origins:
        raise RuntimeError(
            "CSRF_TRUSTED_ORIGINS must be set outside local development when CORS_ALLOWED_ORIGINS is configured."
        )

    return []


def _database_from_url(database_url: str) -> dict[str, str | int]:
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
        raise RuntimeError("DATABASE_URL must include a database username.")
    if db_password is None:
        raise RuntimeError("DATABASE_URL must include a database password.")

    return {
        "ENGINE": engine_map[parsed.scheme],
        "NAME": db_name,
        "USER": db_user,
        "PASSWORD": db_password,
        "HOST": db_host,
        "PORT": db_port,
    }


def _database_from_env_fields() -> dict[str, str | int] | None:
    db_name = os.getenv("DB_NAME") or os.getenv("POSTGRES_DB")
    db_user = os.getenv("DB_USER") or os.getenv("POSTGRES_USER")
    db_password = os.getenv("DB_PASSWORD") or os.getenv("POSTGRES_PASSWORD")
    db_host = os.getenv("DB_HOST") or os.getenv("POSTGRES_HOST")
    db_port_raw = os.getenv("DB_PORT") or os.getenv("POSTGRES_PORT")
    db_port = db_port_raw or "5432"
    db_engine_raw = os.getenv("DB_ENGINE")
    db_engine = db_engine_raw or "django.db.backends.postgresql"

    any_field_present = any(
        value is not None and str(value).strip() != ""
        for value in [db_name, db_user, db_password, db_host, db_port_raw, db_engine_raw]
    )
    if not any_field_present:
        return None

    if db_engine != "django.db.backends.postgresql":
        raise RuntimeError("Only PostgreSQL is supported for DB_ENGINE.")

    missing = []
    if not db_name:
        missing.append("DB_NAME/POSTGRES_DB")
    if not db_user:
        missing.append("DB_USER/POSTGRES_USER")
    if not db_host:
        missing.append("DB_HOST/POSTGRES_HOST")
    if not db_password and not _is_local_dev_mode():
        missing.append("DB_PASSWORD/POSTGRES_PASSWORD")

    if missing:
        raise RuntimeError(
            "Database environment configuration is incomplete. Missing: " + ", ".join(missing)
        )

    try:
        parsed_port = int(str(db_port).strip())
    except (TypeError, ValueError):
        raise RuntimeError("DB_PORT/POSTGRES_PORT must be an integer.")

    return {
        "ENGINE": db_engine,
        "NAME": db_name,
        "USER": db_user,
        "PASSWORD": db_password or "",
        "HOST": db_host,
        "PORT": parsed_port,
    }


def _local_dev_sqlite_database() -> dict[str, str]:
    return {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": str(BASE_DIR / "db.sqlite3"),
    }


def _get_database_config() -> dict[str, str | int]:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return _database_from_url(database_url)

    field_config = _database_from_env_fields()
    if field_config:
        return field_config

    if _is_local_dev_mode():
        return _local_dev_sqlite_database()

    raise RuntimeError(
        "Database configuration is required outside local development. Set DATABASE_URL or DB_NAME/DB_USER/DB_PASSWORD/DB_HOST/DB_PORT."
    )


def _get_conn_max_age() -> int:
    raw_value = os.getenv("DB_CONN_MAX_AGE")
    if raw_value is None:
        return 60 if not _is_local_dev_mode() else 0
    try:
        return max(int(raw_value), 0)
    except (TypeError, ValueError):
        raise RuntimeError("DB_CONN_MAX_AGE must be an integer.")


def _get_log_level() -> str:
    return _parse_choice(
        os.getenv("DJANGO_LOG_LEVEL"),
        "DEBUG" if _is_local_dev_mode() else "INFO",
        {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"},
        "DJANGO_LOG_LEVEL",
    )


def _get_url_setting(name: str, default: str) -> str:
    value = (os.getenv(name) or default).strip()
    if "://" in value:
        if not value.endswith("/"):
            raise RuntimeError(f"{name} must end with a trailing slash.")
        return value
    if not value.startswith("/") or not value.endswith("/"):
        raise RuntimeError(f"{name} must start and end with '/'.")
    return value


_load_dotenv(BASE_DIR / ".env")

ENVIRONMENT_NAME = _get_environment_name()
DEBUG = _parse_bool(os.getenv("DJANGO_DEBUG"), default=_is_local_dev_mode())
SECRET_KEY = _get_secret_key()
JWT_SIGNING_KEY = _get_jwt_signing_key(SECRET_KEY)
ALLOWED_HOSTS = _get_allowed_hosts()
CORS_ALLOWED_ORIGINS = _get_cors_allowed_origins()
CSRF_TRUSTED_ORIGINS = _get_csrf_trusted_origins(CORS_ALLOWED_ORIGINS)
HEALTHCHECK_DB_ALIAS = os.getenv("HEALTHCHECK_DB_ALIAS", "default")
HEALTHCHECK_CHECK_MIGRATIONS = _parse_bool(
    os.getenv("HEALTHCHECK_CHECK_MIGRATIONS"),
    default=not _is_local_dev_mode(),
)
HEALTHCHECK_INCLUDE_DETAILS = _parse_bool(
    os.getenv("HEALTHCHECK_INCLUDE_DETAILS"),
    default=_is_local_dev_mode(),
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

DATABASES = {"default": _get_database_config()}
DATABASES["default"]["ATOMIC_REQUESTS"] = True
DATABASES["default"]["CONN_MAX_AGE"] = _get_conn_max_age()

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

STATIC_URL = _get_url_setting("STATIC_URL", "/static/")
STATIC_ROOT = Path(os.getenv("STATIC_ROOT") or (BASE_DIR / "staticfiles"))
MEDIA_URL = _get_url_setting("MEDIA_URL", "/media/")
MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT") or (BASE_DIR / "media"))
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
            if _is_local_dev_mode()
            else "django.contrib.staticfiles.storage.ManifestStaticFilesStorage"
        ),
    },
}

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
    "ALGORITHM": "HS256",
    "SIGNING_KEY": JWT_SIGNING_KEY,
    "UPDATE_LAST_LOGIN": True,
}

OTP_DELIVERY_BACKEND = _parse_choice(
    os.getenv("OTP_DELIVERY_BACKEND"),
    "console" if _is_local_dev_mode() else "auto",
    {"auto", "sms", "email", "console"},
    "OTP_DELIVERY_BACKEND",
)
OTP_ALLOW_EMAIL_FALLBACK = _parse_bool(
    os.getenv("OTP_ALLOW_EMAIL_FALLBACK"),
    default=True,
)
PASSWORD_RESET_OTP_EXPIRY_MINUTES = _parse_int(
    os.getenv("PASSWORD_RESET_OTP_EXPIRY_MINUTES"),
    10,
    minimum=1,
    name="PASSWORD_RESET_OTP_EXPIRY_MINUTES",
)
PASSWORD_RESET_OTP_MAX_ATTEMPTS = _parse_int(
    os.getenv("PASSWORD_RESET_OTP_MAX_ATTEMPTS"),
    5,
    minimum=1,
    name="PASSWORD_RESET_OTP_MAX_ATTEMPTS",
)
PASSWORD_RESET_RESEND_COOLDOWN_SECONDS = _parse_int(
    os.getenv("PASSWORD_RESET_RESEND_COOLDOWN_SECONDS"),
    60,
    minimum=0,
    name="PASSWORD_RESET_RESEND_COOLDOWN_SECONDS",
)
PASSWORD_RESET_MAX_RESENDS = _parse_int(
    os.getenv("PASSWORD_RESET_MAX_RESENDS"),
    3,
    minimum=0,
    name="PASSWORD_RESET_MAX_RESENDS",
)

EMAIL_BACKEND = (
    os.getenv("EMAIL_BACKEND")
    or (
        "django.core.mail.backends.console.EmailBackend"
        if _is_local_dev_mode()
        else "django.core.mail.backends.smtp.EmailBackend"
    )
).strip()
EMAIL_HOST = (os.getenv("EMAIL_HOST") or "localhost").strip()
EMAIL_PORT = _parse_int(
    os.getenv("EMAIL_PORT"),
    25,
    minimum=1,
    name="EMAIL_PORT",
)
EMAIL_HOST_USER = (os.getenv("EMAIL_HOST_USER") or "").strip()
EMAIL_HOST_PASSWORD = (os.getenv("EMAIL_HOST_PASSWORD") or "").strip()
EMAIL_USE_TLS = _parse_bool(
    os.getenv("EMAIL_USE_TLS"),
    default=False,
)
EMAIL_USE_SSL = _parse_bool(
    os.getenv("EMAIL_USE_SSL"),
    default=False,
)
if EMAIL_USE_TLS and EMAIL_USE_SSL:
    raise RuntimeError("EMAIL_USE_TLS and EMAIL_USE_SSL cannot both be enabled.")

DEFAULT_FROM_EMAIL = (
    os.getenv("DEFAULT_FROM_EMAIL")
    or (
        "SUBIDHA CORE Dev <no-reply@local.subidha>"
        if _is_local_dev_mode()
        else ""
    )
).strip()

CORS_ALLOW_CREDENTIALS = _parse_bool(
    os.getenv("CORS_ALLOW_CREDENTIALS"), default=bool(CORS_ALLOWED_ORIGINS)
)
if CORS_ALLOW_CREDENTIALS and not CORS_ALLOWED_ORIGINS and not _is_local_dev_mode():
    raise RuntimeError(
        "CORS_ALLOWED_ORIGINS must be configured outside local development when CORS_ALLOW_CREDENTIALS is enabled."
    )

TRUST_X_FORWARDED_PROTO = _parse_bool(
    os.getenv("TRUST_X_FORWARDED_PROTO"), default=False
)
if TRUST_X_FORWARDED_PROTO:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

USE_X_FORWARDED_HOST = _parse_bool(
    os.getenv("USE_X_FORWARDED_HOST"), default=TRUST_X_FORWARDED_PROTO
)

SECURE_SSL_REDIRECT = _parse_bool(os.getenv("SECURE_SSL_REDIRECT"), default=not _is_local_dev_mode())
SESSION_COOKIE_SECURE = _parse_bool(os.getenv("SESSION_COOKIE_SECURE"), default=not _is_local_dev_mode())
CSRF_COOKIE_SECURE = _parse_bool(os.getenv("CSRF_COOKIE_SECURE"), default=not _is_local_dev_mode())
SESSION_COOKIE_SAMESITE = _parse_choice(
    os.getenv("SESSION_COOKIE_SAMESITE"),
    "Lax",
    {"Lax", "Strict", "None"},
    "SESSION_COOKIE_SAMESITE",
)
CSRF_COOKIE_SAMESITE = _parse_choice(
    os.getenv("CSRF_COOKIE_SAMESITE"),
    "Lax",
    {"Lax", "Strict", "None"},
    "CSRF_COOKIE_SAMESITE",
)
if SESSION_COOKIE_SAMESITE == "None" and not SESSION_COOKIE_SECURE:
    raise RuntimeError("SESSION_COOKIE_SECURE must be enabled when SESSION_COOKIE_SAMESITE is 'None'.")
if CSRF_COOKIE_SAMESITE == "None" and not CSRF_COOKIE_SECURE:
    raise RuntimeError("CSRF_COOKIE_SECURE must be enabled when CSRF_COOKIE_SAMESITE is 'None'.")

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = os.getenv("SECURE_REFERRER_POLICY", "strict-origin-when-cross-origin")
X_FRAME_OPTIONS = "DENY"

LOG_LEVEL = _get_log_level()
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
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.security": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "django.request": {
            "handlers": ["console"],
            "level": "WARNING" if not _is_local_dev_mode() else "INFO",
            "propagate": False,
        },
        "api.health": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "subidha-core-cache",
    }
}
