"""Compatibility module for legacy imports.

The custom user model now lives in ``accounts.models``.
"""

from accounts.models import User, UserRole

__all__ = ["User", "UserRole"]
