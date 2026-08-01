"""Backward-compat shim (Phase C). Moved to the ``finance_control`` app."""
from finance_control.models.daily_close import *  # noqa: F401,F403
from finance_control.models.daily_close import _IMMUTABLE_STATUSES  # noqa: F401
