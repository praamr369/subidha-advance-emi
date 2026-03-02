from decimal import Decimal
from django.db.models import Sum
from subscriptions.models import Subscription, Emi, FinancialLedger


def reconcile_subscription(subscription):
    """
    Validates subscription financial integrity.
    """

    emis = subscription.emis.all()

    total_due = sum(e.amount for e in emis)
    total_paid = sum(e.total_paid() for e in emis)
    total_waived = sum(
        e.amount for e in emis if e.status == "WAIVED"
    )

    outstanding = total_due - total_paid - total_waived

    is_consistent = (
        subscription.total_amount
        == total_paid + total_waived + outstanding
    )

    return {
        "subscription_id": subscription.id,
        "total_due": total_due,
        "paid": total_paid,
        "waived": total_waived,
        "outstanding": outstanding,
        "is_consistent": is_consistent,
    }
def reconcile_emi_ledger(emi):
    """
    Verifies ledger matches payment records.
    """

    payment_total = emi.payments.aggregate(
        total=Sum("amount")
    )["total"] or Decimal("0.00")

    ledger_total = emi.ledger_entries.aggregate(
        total=Sum("amount")
    )["total"] or Decimal("0.00")

    return {
        "emi_id": emi.id,
        "payment_total": payment_total,
        "ledger_total": ledger_total,
        "is_consistent": payment_total == ledger_total,
    }
from decimal import Decimal
from django.db.models import Sum, Q

from subscriptions.models import (
    Batch,
    Subscription,
    Emi,
    LuckyIdStatus,
)


def batch_liability_snapshot(batch: Batch) -> dict:
    """
    Calculates real financial liability for a single batch.
    Used for audit + risk visibility.
    """

    subscriptions = Subscription.objects.filter(
        batch=batch,
        plan_type="EMI"
    )

    total_subscriptions = subscriptions.count()

    total_contract_value = subscriptions.aggregate(
        total=Sum("total_amount")
    )["total"] or Decimal("0.00")

    total_waived = subscriptions.aggregate(
        total=Sum("waived_amount")
    )["total"] or Decimal("0.00")

    total_paid = Emi.objects.filter(
        subscription__batch=batch,
        status="PAID"
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    outstanding = total_contract_value - total_paid - total_waived

    winners_count = subscriptions.filter(
        status="WON"
    ).count()

    assigned_ids = batch.lucky_ids.filter(
        status=LuckyIdStatus.ASSIGNED
    ).count()

    return {
        "batch_code": batch.batch_code,
        "total_subscriptions": total_subscriptions,
        "assigned_lucky_ids": assigned_ids,
        "winners_count": winners_count,
        "total_contract_value": total_contract_value,
        "total_paid": total_paid,
        "total_waived": total_waived,
        "outstanding_liability": outstanding,
        "risk_ratio_percent": (
            (outstanding / total_contract_value * 100)
            if total_contract_value > 0
            else Decimal("0.00")
        ),
    }
def system_financial_health() -> dict:
    """
    Global system-level financial snapshot.
    Used for dashboard + audit.
    """

    active_batches = Batch.objects.filter(status="OPEN")

    total_contract_value = Subscription.objects.filter(
        plan_type="EMI"
    ).aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")

    total_paid = Emi.objects.filter(
        status="PAID"
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    total_waived = Subscription.objects.aggregate(
        total=Sum("waived_amount")
    )["total"] or Decimal("0.00")

    outstanding = total_contract_value - total_paid - total_waived

    pending_emis = Emi.objects.filter(status="PENDING").count()

    return {
        "active_batches": active_batches.count(),
        "total_contract_value": total_contract_value,
        "total_collected": total_paid,
        "total_waived": total_waived,
        "outstanding_liability": outstanding,
        "pending_emi_count": pending_emis,
        "collection_efficiency_percent": (
            (total_paid / total_contract_value * 100)
            if total_contract_value > 0
            else Decimal("0.00")
        ),
    }