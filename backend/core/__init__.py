from __future__ import annotations

# Celery worker imports this package; avoid hard-failing when Celery is not installed (e.g. minimal tooling).
try:
    from .celery import app as celery_app
except Exception:  # pragma: no cover - optional import path
    celery_app = None  # type: ignore[misc, assignment]

__all__ = ["celery_app"]
