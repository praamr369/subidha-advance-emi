from decimal import Decimal

from django.db.models import Sum

from subscriptions.models import (
    Batch,
    Emi,
    EmiStatus,
    LedgerEntryType,
    LuckyIdStatus,
    Subscription,
)
from subscriptions.services.winner_state_service import winner_history_q


def _sum_decimal(queryset, field: str) -> Decimal:
    return queryset.aggregate(total=Sum(field))["total"] or Decimal("0.00")


def reconcile_subscription(subscription: Subscription) -> dict:
    """
    Validate invariant:
    subscription.total_amount == paid + waived + outstanding.
    """

    emis = subscription.emis.all()

    emi_total = _sum_decimal(emis, "amount")
    paid = _sum_decimal(emis.filter(status=EmiStatus.PAID), "amount")
    waived = _sum_decimal(emis.filter(status=EmiStatus.WAIVED), "amount")
    outstanding = emi_total - paid - waived

    return {
        "subscription_id": subscription.id,
        "total_amount": subscription.total_amount,
        "emi_total": emi_total,
        "paid": paid,
        "waived": waived,
        "outstanding": outstanding,
        "total_matches_emi_sum": subscription.total_amount == emi_total,
        "is_consistent": subscription.total_amount == (paid + waived + outstanding),
    }


def reconcile_emi_ledger(emi: Emi) -> dict:
    """Verify ledger totals align with payment + waiver movements for one EMI."""

    payment_total = _sum_decimal(emi.payments.all(), "amount")
    waiver_total = _sum_decimal(
        emi.ledger_entries.filter(entry_type=LedgerEntryType.EMI_WAIVER),
        "amount",
    )
    ledger_payment_total = _sum_decimal(
        emi.ledger_entries.filter(entry_type=LedgerEntryType.EMI_PAYMENT),
        "amount",
    )

    return {
        "emi_id": emi.id,
        "payment_total": payment_total,
        "ledger_payment_total": ledger_payment_total,
        "waiver_total": waiver_total,
        "is_payment_consistent": payment_total == ledger_payment_total,
        "is_waiver_consistent": (waiver_total == emi.amount) if emi.status == EmiStatus.WAIVED else True,
    }


def batch_liability_snapshot(batch: Batch) -> dict:
    subscriptions = Subscription.objects.filter(batch=batch, plan_type="EMI")

    total_contract_value = _sum_decimal(subscriptions, "total_amount")
    total_waived = _sum_decimal(subscriptions, "waived_amount")
    total_paid = _sum_decimal(
        Emi.objects.filter(subscription__batch=batch, status=EmiStatus.PAID),
        "amount",
    )
    outstanding = total_contract_value - total_paid - total_waived

    return {
        "batch_code": batch.batch_code,
        "total_subscriptions": subscriptions.count(),
        "assigned_lucky_ids": batch.lucky_ids.filter(status=LuckyIdStatus.ASSIGNED).count(),
        "winners_count": subscriptions.filter(winner_history_q()).distinct().count(),
        "total_contract_value": total_contract_value,
        "total_paid": total_paid,
        "total_waived": total_waived,
        "outstanding_liability": outstanding,
        "risk_ratio_percent": (
            (outstanding / total_contract_value * 100) if total_contract_value > 0 else Decimal("0.00")
        ),
    }


def system_financial_health() -> dict:
    active_batches = Batch.objects.filter(status="OPEN")

    total_contract_value = _sum_decimal(Subscription.objects.filter(plan_type="EMI"), "total_amount")
    total_paid = _sum_decimal(Emi.objects.filter(status=EmiStatus.PAID), "amount")
    total_waived = _sum_decimal(Subscription.objects.all(), "waived_amount")
    outstanding = total_contract_value - total_paid - total_waived

    return {
        "active_batches": active_batches.count(),
        "total_contract_value": total_contract_value,
        "total_collected": total_paid,
        "total_waived": total_waived,
        "outstanding_liability": outstanding,
        "pending_emi_count": Emi.objects.filter(status=EmiStatus.PENDING).count(),
        "collection_efficiency_percent": (
            (total_paid / total_contract_value * 100) if total_contract_value > 0 else Decimal("0.00")
        ),
    }
