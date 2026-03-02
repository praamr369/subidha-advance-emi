from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from django.db.models import Sum

from subscriptions.models import (
    Payment,
    Emi,
    FinancialLedger,
    EmiStatus,
    SubscriptionStatus,
    PlanType,
    AuditLog,
)

from subscriptions.services.commission_service import generate_commission_for_emi
from subscriptions.services.emi_reconciliation import reconcile_subscription_emis
from subscriptions.services.audit_service import log_audit


# ---------------------------------------------------------
# INTERNAL HELPER — STRICT IDEMPOTENT CREATION
# ---------------------------------------------------------

def _create_payment_idempotent(*, reference_no=None, **kwargs):
    """
    Prevent duplicate payment entries.
    If reference_no exists, return existing payment.
    """

    if reference_no:
        existing = Payment.objects.filter(reference_no=reference_no).first()
        if existing:
            return existing

    return Payment.objects.create(
        reference_no=reference_no if reference_no else None,
        **kwargs
    )


# ---------------------------------------------------------
# MAIN SERVICE — EMI PAYMENT (FULLY HARDENED)
# ---------------------------------------------------------

@transaction.atomic
def record_emi_payment(
    *,
    emi_id,
    amount: Decimal,
    method,
    payment_date,
    reference_no=None,
    collected_by=None,
):

    if amount <= 0:
        raise ValidationError("Payment amount must be positive.")

    # Lock EMI safely
    emi = (
        Emi.objects
        .select_for_update()
        .select_related("subscription__customer")
        .get(id=emi_id)
    )

    subscription = emi.subscription
    customer = subscription.customer

    if subscription.plan_type != PlanType.EMI:
        raise ValidationError("Payments allowed only for EMI plans.")

    if subscription.status in (
        SubscriptionStatus.DEFAULTED,
        SubscriptionStatus.COMPLETED,
    ):
        raise ValidationError("Cannot pay for closed subscription.")

    if emi.status == EmiStatus.WAIVED:
        raise ValidationError("Cannot pay a waived EMI.")

    # Recalculate balance
    total_paid = (
        emi.payments.aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )

    remaining = emi.amount - total_paid

    if remaining <= 0:
        raise ValidationError("EMI already fully paid.")

    if amount > remaining:
        raise ValidationError("Payment exceeds remaining balance.")

    # Idempotent create
    payment = _create_payment_idempotent(
        reference_no=reference_no or "",
        customer=customer,
        subscription=subscription,
        emi=emi,
        amount=amount,
        method=method,
        payment_date=payment_date,
        collected_by=collected_by,
    )

    # Ledger safe
    FinancialLedger.objects.get_or_create(
        payment=payment,
        defaults={
            "emi": emi,
            "amount": amount,
            "entry_type": "EMI_PAYMENT",
            "entry_direction": "CREDIT",
        },
    )

    # Recalculate
    total_paid = (
        emi.payments.aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )

    if total_paid >= emi.amount and emi.status != EmiStatus.PAID:
        emi.status = EmiStatus.PAID
        emi.save(update_fields=["status"])
        generate_commission_for_emi(emi)

    if not subscription.emis.exclude(
        status__in=[EmiStatus.PAID, EmiStatus.WAIVED]
    ).exists():
        subscription.status = SubscriptionStatus.COMPLETED
        subscription.save(update_fields=["status"])

    log_audit(
        action_type=AuditLog.ActionType.EMI_PAID,
        instance=payment,
        performed_by=collected_by,
        metadata={
            "subscription_id": subscription.id,
            "emi_id": emi.id,
            "amount": str(amount),
            "method": method,
            "reference_no": reference_no,
        },
    )

    reconcile_subscription_emis(subscription)

    return payment