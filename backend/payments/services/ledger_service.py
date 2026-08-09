from django.db.models import Sum
from decimal import Decimal


def emi_ledger(subscription):
    """
    EMI-wise ledger for a subscription
    """
    rows = []

    for emi in subscription.emis.order_by("month_no"):
        paid = (
            emi.payments.aggregate(total=Sum("amount"))["total"]
            or Decimal("0.00")
        )

        rows.append({
            "month": emi.month_no,
            "due_date": emi.due_date,
            "amount": emi.amount,
            "paid": paid,
            "balance": emi.amount - paid,
            "status": emi.status,
        })

    return rows
def payment_ledger(customer):
    """
    All payments made by a customer (chronological)
    """
    return (
        customer.payments
        .select_related(
            "emi",
            "emi__subscription",
            "emi__subscription__product",
        )
        .order_by("payment_date", "id")
    )
from subscriptions.models import EmiStatus


def subscription_summary(subscription):
    """
    Financial summary of a subscription
    """
    total_due = subscription.total_amount

    total_paid = (
        subscription.emis
        .aggregate(total=Sum("payments__amount"))["total"]
        or Decimal("0.00")
    )

    waived = (
        subscription.emis
        .filter(status=EmiStatus.WAIVED)
        .aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )

    return {
        "total_due": total_due,
        "paid": total_paid,
        "waived": waived,
        "balance": total_due - total_paid - waived,
        "status": subscription.status,
    }