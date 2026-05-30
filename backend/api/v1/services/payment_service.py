from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum

from subscriptions.models import Payment
from core.services.operational_visibility import filter_active_payments


def get_total_collected_amount() -> Decimal:
    return (
        filter_active_payments(Payment.objects.all()).aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
