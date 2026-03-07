from __future__ import annotations

from typing import Optional

from subscriptions.models import Customer, Payment


def get_latest_payment_for_customer(customer: Customer) -> Optional[Payment]:
    return (
        Payment.objects.filter(customer=customer)
        .order_by("-payment_date", "-id")
        .first()
    )

