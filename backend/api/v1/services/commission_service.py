from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum

from subscriptions.models import Commission


def get_commission_summary_for_partner(partner) -> dict:
    qs = Commission.objects.filter(partner=partner)
    total = qs.aggregate(total=Sum("commission_amount"))["total"] or Decimal("0.00")
    paid = qs.filter(status="PAID").aggregate(total=Sum("commission_amount"))["total"] or Decimal(
        "0.00"
    )
    unpaid = total - paid
    return {"total": total, "paid": paid, "unpaid": unpaid}

