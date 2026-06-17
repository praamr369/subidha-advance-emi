"""
P2A — ControlException service.

Provides:
  - raise_exception()   — open or surface a persisted exception
  - acknowledge_exception()  — mark as acknowledged
  - resolve_exception()      — mark as resolved
  - suppress_exception()     — suppress (admin override)
  - list_open_exceptions()   — stable read payload for API
"""
from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from subscriptions.models_control_foundation import (
    ControlException,
    ExceptionSeverity,
    ExceptionStatus,
)


# ─────────────────────────────────────────────
# Well-known exception keys
# ─────────────────────────────────────────────

class ExceptionKey:
    PAYMENT_PAID_RECEIPT_MISSING = "payment_paid_receipt_missing"
    PAYMENT_BRIDGE_MISSING = "payment_bridge_missing"
    DELIVERY_STOCK_LEDGER_MISSING = "delivery_stock_ledger_missing"
    RENT_LEASE_ACTIVE_KYC_MISSING = "rent_lease_active_kyc_missing"
    DEPOSIT_LIABILITY_UNPOSTED = "deposit_liability_unposted"
    INVOICE_STOCK_NOT_REDUCED = "invoice_stock_not_reduced"
    MANUAL_JOURNAL_WITHOUT_SOURCE = "manual_journal_without_source"
    CASH_COUNTER_VARIANCE = "cash_counter_variance"


_KEY_DEFAULTS: dict[str, dict[str, Any]] = {
    ExceptionKey.PAYMENT_PAID_RECEIPT_MISSING: {
        "severity": ExceptionSeverity.HIGH,
        "title": "Payment recorded without receipt",
        "message": "A paid payment has no linked receipt document.",
    },
    ExceptionKey.PAYMENT_BRIDGE_MISSING: {
        "severity": ExceptionSeverity.HIGH,
        "title": "Payment not bridged to accounting",
        "message": "A collected payment has no corresponding accounting bridge entry.",
    },
    ExceptionKey.DELIVERY_STOCK_LEDGER_MISSING: {
        "severity": ExceptionSeverity.WARNING,
        "title": "Delivery without stock ledger movement",
        "message": "A completed delivery has no corresponding stock ledger reduction.",
    },
    ExceptionKey.RENT_LEASE_ACTIVE_KYC_MISSING: {
        "severity": ExceptionSeverity.CRITICAL,
        "title": "Active rent/lease contract without KYC",
        "message": "A rent/lease contract is active but the customer KYC is incomplete or missing.",
    },
    ExceptionKey.DEPOSIT_LIABILITY_UNPOSTED: {
        "severity": ExceptionSeverity.HIGH,
        "title": "Deposit liability not posted",
        "message": "A collected deposit has no corresponding liability posting in accounting.",
    },
    ExceptionKey.INVOICE_STOCK_NOT_REDUCED: {
        "severity": ExceptionSeverity.WARNING,
        "title": "Invoice without stock reduction",
        "message": "An invoiced direct sale has no corresponding stock reduction.",
    },
    ExceptionKey.MANUAL_JOURNAL_WITHOUT_SOURCE: {
        "severity": ExceptionSeverity.HIGH,
        "title": "Manual journal entry without source reference",
        "message": "A manual journal entry lacks a source document reference.",
    },
    ExceptionKey.CASH_COUNTER_VARIANCE: {
        "severity": ExceptionSeverity.WARNING,
        "title": "Cash counter variance",
        "message": "The cash counter closing balance does not match the system total.",
    },
}


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

@transaction.atomic
def raise_exception(
    *,
    exception_key: str,
    source_model: str,
    source_id: str,
    title: str | None = None,
    message: str | None = None,
    severity: str | None = None,
    action_url: str = "",
    metadata: dict | None = None,
) -> ControlException:
    """Open or re-surface a control exception.

    If an OPEN record for (exception_key, source_model, source_id) already exists,
    returns it unchanged (idempotent). Otherwise creates a new OPEN record.
    """
    existing = ControlException.objects.filter(
        exception_key=exception_key,
        source_model=source_model,
        source_id=str(source_id),
        status=ExceptionStatus.OPEN,
    ).first()
    if existing:
        return existing

    defaults = _KEY_DEFAULTS.get(exception_key, {})
    exc = ControlException.objects.create(
        exception_key=exception_key,
        source_model=source_model,
        source_id=str(source_id),
        severity=severity or defaults.get("severity", ExceptionSeverity.WARNING),
        title=title or defaults.get("title", exception_key),
        message=message or defaults.get("message", ""),
        action_url=action_url,
        detected_at=timezone.now(),
        status=ExceptionStatus.OPEN,
        metadata=metadata or {},
    )
    return exc


@transaction.atomic
def acknowledge_exception(
    *,
    exception: ControlException,
    acknowledged_by,
) -> ControlException:
    if exception.status != ExceptionStatus.OPEN:
        return exception
    exception.status = ExceptionStatus.ACKNOWLEDGED
    exception.acknowledged_by = acknowledged_by
    exception.acknowledged_at = timezone.now()
    exception.save(update_fields=["status", "acknowledged_by", "acknowledged_at", "updated_at"])
    return exception


@transaction.atomic
def resolve_exception(
    *,
    exception: ControlException,
) -> ControlException:
    if exception.status == ExceptionStatus.RESOLVED:
        return exception
    exception.status = ExceptionStatus.RESOLVED
    exception.save(update_fields=["status", "updated_at"])
    return exception


@transaction.atomic
def suppress_exception(
    *,
    exception: ControlException,
) -> ControlException:
    if exception.status == ExceptionStatus.SUPPRESSED:
        return exception
    exception.status = ExceptionStatus.SUPPRESSED
    exception.save(update_fields=["status", "updated_at"])
    return exception


def list_open_exceptions(
    *,
    severity: str | None = None,
    exception_key: str | None = None,
    source_model: str | None = None,
) -> list[dict[str, Any]]:
    """Return stable read payload for OPEN+ACKNOWLEDGED exceptions."""
    qs = ControlException.objects.filter(
        status__in=[ExceptionStatus.OPEN, ExceptionStatus.ACKNOWLEDGED]
    ).order_by("-detected_at")

    if severity:
        qs = qs.filter(severity=severity)
    if exception_key:
        qs = qs.filter(exception_key=exception_key)
    if source_model:
        qs = qs.filter(source_model=source_model)

    return [
        {
            "id": e.pk,
            "exception_key": e.exception_key,
            "severity": e.severity,
            "source_model": e.source_model,
            "source_id": e.source_id,
            "title": e.title,
            "message": e.message,
            "action_url": e.action_url,
            "detected_at": e.detected_at.isoformat(),
            "status": e.status,
            "metadata": e.metadata,
        }
        for e in qs
    ]
