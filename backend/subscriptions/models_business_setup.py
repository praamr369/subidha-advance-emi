"""Backward-compat shim (Phase B of the subscriptions split).

The business-setup domain models moved to the ``business_setup`` app. This
re-exports the surviving models/enums/helpers so existing
``from subscriptions.models_business_setup import ...`` imports keep working.
The legacy duplicate models Branch/FinanceAccount/CashDesk/ChartAccount/
StaffOperationalAssignment (and their enums) were dropped, not moved.
Import migration to ``from business_setup.models import ...`` is deferred to Phase H.
"""
from business_setup.models.core import *  # noqa: F401,F403
