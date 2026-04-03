"""
Legacy compatibility wrapper for payment recording.

Do not use this module as a primary business entrypoint.
All new payment collection flows must use:

    subscriptions.services.payment_service.record_emi_payment

This wrapper is retained only to avoid breaking older imports during the
migration to the canonical payment service.
"""

from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from subscriptions.services.payment_service import record_emi_payment


def _normalize_amount(value: Any) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid payment amount.")

    if amount <= Decimal("0.00"):
        raise ValueError("Payment amount must be greater than zero.")

    return amount


def record_payment(
    *,
    emi_id: int,
    amount,
    collected_by,
    method: Optional[str] = None,
    payment_method: str = "CASH",
    payment_date=None,
    reference_no: Optional[str] = None,
    notes: Optional[str] = None,
):
    """
    Backward-compatible wrapper around the canonical EMI payment service.

    Accepted legacy parameters:
    - emi_id
    - amount
    - collected_by
    - method
    - payment_method
    - payment_date
    - reference_no
    - notes

    Canonical service mapping:
    - payment_method -> method
    - notes -> note

    payment_date is accepted for compatibility but is not used here if the
    canonical service owns payment date assignment internally.
    """
    normalized_amount = _normalize_amount(amount)
    resolved_method = method or payment_method or "CASH"

    result = record_emi_payment(
        emi_id=int(emi_id),
        amount=normalized_amount,
        collected_by=collected_by,
        method=resolved_method,
        reference_no=reference_no,
        note=notes,
    )

    return result["payment"]
