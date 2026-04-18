import os

os.environ["DJANGO_ENV"] = "development"
os.environ.setdefault("DJANGO_DEBUG", "true")
os.environ.setdefault(
    "DJANGO_SECRET_KEY",
    "development-only-django-secret-key-2026-not-for-production-5m2x8q1v7k3n",
)
os.environ.setdefault(
    "JWT_SIGNING_KEY",
    "development-only-jwt-signing-key-2026-not-for-production-9d4k7h3p",
)
os.environ.setdefault("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]")
os.environ.setdefault(
    "CSRF_TRUSTED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)

from .base import *  # noqa

DEBUG = True
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
