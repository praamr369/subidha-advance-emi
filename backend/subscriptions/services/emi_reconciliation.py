from decimal import Decimal

from django.db.models import Sum

from subscriptions.models import (
    Emi,
    EmiStatus,
    LuckyIdStatus,
    MONEY_ZERO,
    Payment,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.subscription_status_service import (
    resolve_expected_subscription_status,
)


def q2(value):
    value = value or MONEY_ZERO
    return Decimal(value).quantize(Decimal("0.01"))


def _is_payment_reversed(payment: Payment) -> bool:
    metadata = payment.allocation_metadata or {}
    reversal = metadata.get("reversal") or {}
    return bool(reversal.get("is_reversed"))


def effective_paid_for_emi(emi: Emi) -> Decimal:
    total = MONEY_ZERO
    for payment in emi.payments.all():
        if _is_payment_reversed(payment):
            continue
        total += payment.amount or MONEY_ZERO
    return q2(total)


def effective_paid_for_subscription(subscription: Subscription) -> Decimal:
    total = MONEY_ZERO
    payments = subscription.payments.all()
    for payment in payments:
        if _is_payment_reversed(payment):
            continue
        total += payment.amount or MONEY_ZERO
    return q2(total)


def waived_total_for_subscription(subscription: Subscription) -> Decimal:
    total = (
        subscription.emis.filter(status=EmiStatus.WAIVED).aggregate(total=Sum("amount"))["total"]
        or MONEY_ZERO
    )
    return q2(total)


def outstanding_total_for_subscription(subscription: Subscription) -> Decimal:
    total = MONEY_ZERO
    for emi in subscription.emis.all():
        if emi.status == EmiStatus.WAIVED:
            continue
        outstanding = q2(emi.amount) - effective_paid_for_emi(emi)
        if outstanding > MONEY_ZERO:
            total += outstanding
    return q2(total)


def sync_emi_status(emi: Emi, save: bool = True) -> EmiStatus:
    """
    Recompute one EMI status using effective payments only.
    Soft-reversed payments are ignored.
    """
    if emi.status == EmiStatus.WAIVED:
        return EmiStatus.WAIVED

    effective_paid = effective_paid_for_emi(emi)
    next_status = EmiStatus.PAID if effective_paid >= q2(emi.amount) else EmiStatus.PENDING

    if save and emi.status != next_status:
        emi.status = next_status
        emi.save(update_fields=["status"])

    return next_status


def sync_subscription_status(subscription: Subscription, save: bool = True) -> str:
    """
    Recompute subscription status from EMI truth.
    Winner history stays separate from contract lifecycle:
    - COMPLETED when every EMI is PAID or WAIVED
    - WON only while winner history exists and one or more EMI rows remain unresolved
    - DEFAULTED remains untouched
    - otherwise ACTIVE
    """
    current_status = subscription.status
    emi_statuses = list(subscription.emis.values_list("status", flat=True))
    is_winner = bool(
        subscription.winner_month is not None
        or current_status == SubscriptionStatus.WON
        or getattr(subscription.lucky_id, "status", None) == LuckyIdStatus.WON
    )
    next_status = resolve_expected_subscription_status(
        current_status=current_status,
        emi_statuses=emi_statuses,
        is_winner=is_winner,
    )

    if save and subscription.status != next_status:
        subscription.status = next_status
        subscription.save(update_fields=["status"])

    return next_status


def reconcile_subscription_emis(subscription: Subscription):
    """
    Authoritative subscription reconciliation.

    Returns a dictionary that can be used by:
    - collect payment flow
    - reversal flow
    - admin diagnostics
    - management commands

    This implementation is reversal-aware.
    """
    subscription = (
        Subscription.objects.prefetch_related(
            "emis__payments",
            "payments",
        )
        .get(pk=subscription.pk)
    )

    emis = list(subscription.emis.all().order_by("month_no"))

    total_due = MONEY_ZERO
    total_paid = MONEY_ZERO
    total_waived = MONEY_ZERO

    emi_rows = []

    for emi in emis:
        total_due += q2(emi.amount)

        effective_paid = effective_paid_for_emi(emi)
        total_paid += effective_paid

        if emi.status == EmiStatus.WAIVED:
            total_waived += q2(emi.amount)

        next_status = sync_emi_status(emi, save=True)

        outstanding = q2(emi.amount) - effective_paid
        if emi.status == EmiStatus.WAIVED:
            outstanding = MONEY_ZERO
        elif outstanding < MONEY_ZERO:
            outstanding = MONEY_ZERO

        emi_rows.append(
            {
                "emi_id": emi.id,
                "month_no": emi.month_no,
                "status": next_status,
                "amount": q2(emi.amount),
                "effective_paid": q2(effective_paid),
                "outstanding": q2(outstanding),
            }
        )

    # Recompute waived amount from EMI truth
    recomputed_waived = waived_total_for_subscription(subscription)
    if q2(subscription.waived_amount) != recomputed_waived:
        subscription.waived_amount = recomputed_waived
        subscription.save(update_fields=["waived_amount"])

    next_subscription_status = sync_subscription_status(subscription, save=True)

    outstanding_total = q2(total_due - total_paid - recomputed_waived)
    if outstanding_total < MONEY_ZERO:
        outstanding_total = MONEY_ZERO

    is_consistent = q2(subscription.total_amount) == q2(total_paid + recomputed_waived + outstanding_total)

    return {
        "subscription_id": subscription.id,
        "subscription_status": next_subscription_status,
        "total_due": q2(total_due),
        "paid": q2(total_paid),
        "waived": q2(recomputed_waived),
        "outstanding": q2(outstanding_total),
        "is_consistent": is_consistent,
        "emis": emi_rows,
    }


def reconcile_emi_ledger(emi: Emi):
    """
    Verify ledger total against effective payments for one EMI.
    PAYMENT_REVERSAL entries reduce net ledger value.
    """
    from subscriptions.models import FinancialLedger, LedgerDirection

    ledger_total = MONEY_ZERO
    ledger_rows = FinancialLedger.objects.filter(emi=emi).order_by("created_at", "id")

    for row in ledger_rows:
        amount = q2(row.amount)
        if row.entry_direction == LedgerDirection.CREDIT:
            ledger_total += amount
        else:
            ledger_total -= amount

    effective_paid = effective_paid_for_emi(
        Emi.objects.prefetch_related("payments").get(pk=emi.pk)
    )

    return {
        "emi_id": emi.id,
        "payment_effective_total": q2(effective_paid),
        "ledger_net_total": q2(ledger_total),
        "is_consistent": q2(effective_paid) == q2(ledger_total),
    }
