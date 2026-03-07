from __future__ import annotations

from decimal import Decimal
from typing import Iterable

from django.db.models import QuerySet

from subscriptions.models import Emi, EmiStatus, Subscription


def get_overdue_emis() -> QuerySet[Emi]:
    return Emi.objects.filter(status=EmiStatus.PENDING, due_date__lt="today")  # placeholder; wire with proper date utils later


def calculate_total_outstanding_for_subscription(subscription: Subscription) -> Decimal:
    return (
        Emi.objects.filter(subscription=subscription, status=EmiStatus.PENDING)
        .aggregate(total=Decimal("0.00"))["total"]
        or Decimal("0.00")
    )

