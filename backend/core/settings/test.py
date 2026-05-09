import os

os.environ["DJANGO_ENV"] = "development"
os.environ.setdefault("DJANGO_DEBUG", "true")
os.environ.setdefault(
    "DJANGO_SECRET_KEY",
    "test-only-django-secret-key-2026-not-for-production-4k8q1n7v5m2x",
)
os.environ.setdefault(
    "JWT_SIGNING_KEY",
    "test-only-jwt-signing-key-2026-not-for-production-3h7p9d4k",
)
os.environ.setdefault("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]")
os.environ.setdefault(
    "CSRF_TRUSTED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)

from .base import *  # noqa

# Celery: run tasks synchronously in tests; finance flows must never depend on workers.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

DEBUG = True
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
TEST_RUNNER = "core.test_runner.ProjectTestRunner"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
