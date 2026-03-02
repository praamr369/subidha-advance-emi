# subscriptions/services/subscription_analytics_service.py

from django.db.models import Sum
from decimal import Decimal

from subscriptions.models import Emi, Payment, FinancialLedger


def get_subscription_financial_summary(subscription):
    """
    Read-only financial analytics.
    No mutation.
    Safe for dashboard use.
    """

    emi_total = (
        subscription.emis.aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0.00")
    )

    paid_total = (
        Payment.objects.filter(
            subscription=subscription
        ).aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0.00")
    )

    waived_total = (
        FinancialLedger.objects.filter(
            emi__subscription=subscription,
            entry_type="EMI_WAIVER"
        ).aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0.00")
    )

    outstanding = emi_total - (paid_total + waived_total)

    return {
        "emi_total": emi_total,
        "paid_total": paid_total,
        "waived_total": waived_total,
        "outstanding": outstanding,
    }