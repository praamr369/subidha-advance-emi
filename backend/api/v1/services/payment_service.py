from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum

from subscriptions.models import Payment


def get_total_collected_amount() -> Decimal:
    return Payment.objects.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

