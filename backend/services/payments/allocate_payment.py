"""
Internal allocation helper for payment service.

This module must not be used as an external payment entrypoint.
Views, admin endpoints, cashier endpoints, and ad-hoc scripts must not call
this module directly to simulate payment collection.

Canonical flow:
    subscriptions.services.payment_service.record_emi_payment(...)
        -> allocate_payment(payment)

This helper is intentionally narrow:
- it works on an already-created Payment instance
- it updates payment allocation metadata
- it returns the allocated amount
- it does not create Payment rows
- it does not own admin/cashier validation
- it does not own ledger posting
- it does not own audit logging
"""

from decimal import Decimal

from django.db import transaction

from subscriptions.models import MONEY_ZERO, Payment


def _q2(value: Decimal) -> Decimal:
    return (value or MONEY_ZERO).quantize(Decimal("0.01"))


@transaction.atomic
def allocate_payment(payment: Payment) -> Decimal:
    """
    Record deterministic allocation metadata for a payment.

    This helper does not distribute across multiple EMIs.
    In the current Lucky Plan EMI flow, each payment belongs to a single EMI.

    Returns:
        Decimal: allocated amount
    """
    if payment is None:
        raise ValueError("Payment instance is required.")

    if not getattr(payment, "emi_id", None):
        raise ValueError("Payment must be linked to an EMI before allocation.")

    amount = _q2(Decimal(str(payment.amount or MONEY_ZERO)))
    if amount <= MONEY_ZERO:
        raise ValueError("Payment amount must be greater than zero.")

    metadata = dict(getattr(payment, "allocation_metadata", {}) or {})
    existing_allocations = metadata.get("allocations") or []

    if existing_allocations:
        total_existing = sum(
            Decimal(str(item.get("amount", "0.00"))) for item in existing_allocations
        )
        total_existing = _q2(total_existing)

        if total_existing == amount:
            return amount

    metadata["allocations"] = [
        {
            "emi_id": payment.emi_id,
            "subscription_id": payment.subscription_id,
            "amount": str(amount),
            "kind": "EMI_PAYMENT",
        }
    ]

    reversal = metadata.get("reversal")
    if reversal is None:
        metadata["reversal"] = {
            "is_reversed": False,
            "reversed_payment_id": None,
            "reason": None,
        }

    payment.allocation_metadata = metadata
    payment.save(update_fields=["allocation_metadata",])

    return amount