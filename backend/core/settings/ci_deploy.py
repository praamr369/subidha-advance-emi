import os

os.environ.setdefault("DJANGO_ENV", "production")
os.environ.setdefault("DJANGO_DEBUG", "false")
os.environ.setdefault(
    "DJANGO_SECRET_KEY",
    "ci-deploy-validation-secret-key-2026-rotate-before-real-production-z8k4m1p7",
)
os.environ.setdefault("DJANGO_ALLOWED_HOSTS", "ci.subidha.local,localhost,127.0.0.1")
os.environ.setdefault("CORS_ALLOWED_ORIGINS", "")
os.environ.setdefault("CSRF_TRUSTED_ORIGINS", "")
os.environ.setdefault("DATABASE_URL", "postgresql://ci:ci@127.0.0.1:5432/subidha_ci")

from .base import *  # noqa

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
        "ATOMIC_REQUESTS": True,
        "CONN_MAX_AGE": 0,
    }
}
