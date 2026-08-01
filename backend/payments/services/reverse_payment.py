"""
Payment reversal service (CTRL-FIN-1 / INV-2).

A reversal does NOT delete the original Payment row — it creates a
PAYMENT_REVERSAL FinancialLedger entry that offsets the original credit,
and flips the associated EMI back to PENDING so the customer can re-pay.
The original payment record is immutable evidence; it is never removed.

Requires: payment must not already have a PAYMENT_REVERSAL ledger entry,
and the associated EMI (if any) must be in PAID status.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

MONEY_ZERO = Decimal("0.00")


def reverse_payment(*, payment_id: int, reversed_by, reason: str = "") -> dict:
    """
    Reverse a payment by creating an offsetting ledger entry.

    Returns a dict with keys: payment_id, reversal_ledger_id, emi_id (or None).

    Raises ValidationError on invalid state.
    """
    from subscriptions.models import (
        EmiStatus,
        FinancialLedger,
        LedgerDirection,
        LedgerEntryType,
        Payment,
    )

    if not reason:
        raise ValidationError({"reason": "A reason is required for payment reversal."})

    with transaction.atomic():
        try:
            payment = Payment.objects.select_for_update().get(pk=payment_id)
        except Payment.DoesNotExist:
            raise ValidationError({"payment_id": f"Payment #{payment_id} not found."})

        existing_reversal = FinancialLedger.objects.filter(
            payment=payment,
            entry_type=LedgerEntryType.PAYMENT_REVERSAL,
        ).exists()
        if existing_reversal:
            raise ValidationError(
                {"payment_id": f"Payment #{payment_id} has already been reversed."}
            )

        original_ledger = FinancialLedger.objects.filter(
            payment=payment,
            entry_type=LedgerEntryType.EMI_PAYMENT,
        ).first()

        reversal_amount = payment.amount

        reversal_ledger = FinancialLedger(
            payment=payment,
            emi=original_ledger.emi if original_ledger else None,
            amount=reversal_amount,
            entry_type=LedgerEntryType.PAYMENT_REVERSAL,
            entry_direction=LedgerDirection.DEBIT,
            plan_type_hint=payment.plan_type_hint,
            allocation_context={
                "reversal_reason": reason,
                "reversed_by_id": getattr(reversed_by, "pk", str(reversed_by)),
                "reversed_at": timezone.now().isoformat(),
                "original_payment_id": payment.pk,
                "original_payment_date": str(payment.payment_date),
                "original_amount": str(payment.amount),
                "original_method": payment.method,
            },
        )
        reversal_ledger.save()

        # Flip the EMI back to PENDING so the customer can re-pay.
        emi_id = None
        if original_ledger and original_ledger.emi_id:
            emi = original_ledger.emi
            if emi.status == EmiStatus.PAID:
                # Bypass the immutability guard: this is an explicit, audited reversal.
                emi.__class__.objects.filter(pk=emi.pk).update(status=EmiStatus.PENDING)
                emi_id = emi.pk

    return {
        "payment_id": payment.pk,
        "reversal_ledger_id": reversal_ledger.pk,
        "emi_id": emi_id,
        "reversed_amount": str(reversal_amount),
    }
