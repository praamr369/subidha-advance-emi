from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from django.utils import timezone

from billing.models import BillingDocumentStatus, ReceiptDocument
from reconciliation.models import FinancialSourceLifecycleEvent
from subscriptions.models import OperationalCancellation, Payment


INVALIDATING_EVENT_TYPES = {
    FinancialSourceLifecycleEvent.EventType.VOIDED,
    FinancialSourceLifecycleEvent.EventType.CANCELLED,
    FinancialSourceLifecycleEvent.EventType.REVERSED,
    FinancialSourceLifecycleEvent.EventType.REFUNDED,
}


def generate_financial_source_lifecycle_event_no(*, event_date: date | None = None) -> str:
    event_date = event_date or timezone.now().date()
    prefix = event_date.strftime("FLE-%Y%m%d")
    latest = (
        FinancialSourceLifecycleEvent.objects.filter(event_no__startswith=f"{prefix}-")
        .order_by("-event_no")
        .first()
    )
    if latest and latest.event_no:
        current_suffix = latest.event_no.rsplit("-", 1)[-1]
        if current_suffix.isdigit():
            next_sequence = int(current_suffix) + 1
        else:
            next_sequence = 1
    else:
        next_sequence = 1
    return f"{prefix}-{str(next_sequence).zfill(6)}"


def create_lifecycle_event(
    *,
    source_type: str,
    source_id: int,
    event_type: str,
    event_status: str = FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
    reason: str = "",
    amount: Decimal | None = None,
    created_by: Any = None,
    related_payment: Payment | None = None,
    related_receipt: ReceiptDocument | None = None,
    related_invoice: Any = None,
    related_journal: Any = None,
    related_cancellation: Any = None,
    metadata: dict | None = None,
) -> FinancialSourceLifecycleEvent:
    if amount is not None and amount < Decimal("0.00"):
        raise ValueError("Lifecycle event amount cannot be negative.")
    metadata = metadata or {}
    event = FinancialSourceLifecycleEvent(
        event_no=generate_financial_source_lifecycle_event_no(),
        source_type=source_type,
        source_id=source_id,
        event_type=event_type,
        event_status=event_status,
        reason=(reason or "").strip(),
        amount=amount,
        created_by=created_by,
        related_payment=related_payment,
        related_receipt=related_receipt,
        related_invoice=related_invoice,
        related_journal=related_journal,
        related_cancellation=related_cancellation,
        metadata=metadata,
    )
    event.full_clean()
    event.save()
    return event


def get_latest_lifecycle_event(source_type: str, source_id: int) -> FinancialSourceLifecycleEvent | None:
    return (
        FinancialSourceLifecycleEvent.objects.filter(source_type=source_type, source_id=source_id)
        .order_by("-created_at", "-id")
        .first()
    )


def get_invalidating_events(source_type: str, source_id: int):
    return FinancialSourceLifecycleEvent.objects.filter(
        source_type=source_type,
        source_id=source_id,
        event_type__in=INVALIDATING_EVENT_TYPES,
        event_status=FinancialSourceLifecycleEvent.EventStatus.ACTIVE,
    )


def is_source_invalidated(source_type: str, source_id: int) -> bool:
    return get_invalidating_events(source_type=source_type, source_id=source_id).exists()


def is_payment_valid_for_cash_evidence(payment: Payment) -> bool:
    if payment is None:
        raise ValueError("Payment instance is required.")

    cancelled_payment_exists = OperationalCancellation.objects.filter(
        source_type=OperationalCancellation.SourceType.EMI_PAYMENT,
        source_id=payment.id,
    ).exists()
    if cancelled_payment_exists:
        return False

    if is_source_invalidated(FinancialSourceLifecycleEvent.SourceType.EMI_PAYMENT, payment.id):
        return False

    return True


def is_receipt_valid_for_settlement(receipt: ReceiptDocument) -> bool:
    if receipt is None:
        raise ValueError("ReceiptDocument instance is required.")

    if is_source_invalidated(FinancialSourceLifecycleEvent.SourceType.BILLING_RECEIPT, receipt.id):
        return False

    # Conservative fallback: receipt activity is inferred from explicit lifecycle events first.
    # If no explicit lifecycle evidence exists, fall back to the posted status signal only.
    # This avoids weak metadata inference from journal or audit fields in this phase.
    return receipt.status == BillingDocumentStatus.POSTED
