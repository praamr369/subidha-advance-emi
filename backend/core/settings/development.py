import os
from pathlib import Path

# Load .env FIRST so .env values take precedence over the hardcoded fallbacks below.
# base.py also calls _load_dotenv but by then the fallbacks below would already be set
# via setdefault, blocking .env values from taking effect.
_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_env_file = _BASE_DIR / ".env"
if _env_file.exists():
    for _line in _env_file.read_text(encoding="utf-8").splitlines():
        _raw = _line.strip()
        if not _raw or _raw.startswith("#") or "=" not in _raw:
            continue
        _key, _val = _raw.split("=", 1)
        os.environ.setdefault(_key.strip(), _val.strip().strip('"').strip("'"))

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
