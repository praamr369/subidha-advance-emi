"""
Legacy filesystem compatibility shim.

Active settings live under ``core/settings/`` and should be selected with an
explicit module such as:

- core.settings.development
- core.settings.production
- core.settings.test
- core.settings.playwright

This file intentionally avoids carrying separate fallback secrets or database
defaults so the repository has a single authoritative settings implementation.
"""

from __future__ import annotations

import os


environment_name = (
    os.getenv("DJANGO_ENV") or os.getenv("ENVIRONMENT") or "development"
).strip().lower()

if environment_name == "production":
    from core.settings.production import *  # noqa: F401,F403
elif environment_name == "test":
    from core.settings.test import *  # noqa: F401,F403
else:
    from core.settings.development import *  # noqa: F401,F403
