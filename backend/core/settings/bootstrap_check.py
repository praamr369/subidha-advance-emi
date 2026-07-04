"""Throwaway settings for verifying the production bootstrap fixture loads
into a fresh database. Not used in any deployment."""
from .development import *  # noqa: F401,F403
import os

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("BOOTSTRAP_CHECK_DB", str(BASE_DIR / "bootstrap_check.sqlite3")),  # noqa: F405
    }
}
