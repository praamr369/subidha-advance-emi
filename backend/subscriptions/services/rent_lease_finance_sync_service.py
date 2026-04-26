"""Accounting sync boundary for live rent/lease billing and deposits.

This service intentionally avoids fake journal entries. It only reports source
facts and marks the event as deferred when operational account hooks are not
configured yet.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from django.utils import timezone

from subscriptions.models import AuditLog, Subscription
from subscriptions.services.audit_service import log_audit


@dataclass(frozen=True)
class SyncResult:
    event: str
    status: str
    reason: str
    source_model: str
    source_id: int
    occurred_at: str


def _deferred(*, event: str, source_model: str, source_id: int, reason: str) -> SyncResult:
    return SyncResult(
        event=event,
        status="DEFERRED",
        reason=reason,
        source_model=source_model,
        source_id=source_id,
        occurred_at=timezone.now().isoformat(),
    )


def sync_rent_lease_monthly_income(*, subscription: Subscription, amount, performed_by=None) -> dict:
    result = _deferred(
        event="RENT_LEASE_MONTHLY_PAYMENT",
        source_model="Subscription",
        source_id=subscription.id,
        reason="No dedicated rent/lease accounting hook is configured; source records remain authoritative.",
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "ACCOUNTING_SYNC_SKIPPED", **asdict(result), "amount": str(amount)},
    )
    return asdict(result)


def sync_security_deposit_liability(*, subscription: Subscription, amount, performed_by=None) -> dict:
    result = _deferred(
        event="SECURITY_DEPOSIT_COLLECTED",
        source_model="Subscription",
        source_id=subscription.id,
        reason="Deposit liability posting hook is not configured; transaction is tracked in demand/transaction tables.",
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "ACCOUNTING_SYNC_SKIPPED", **asdict(result), "amount": str(amount)},
    )
    return asdict(result)


def sync_deposit_refund_liability_reduction(*, subscription: Subscription, amount, performed_by=None) -> dict:
    result = _deferred(
        event="SECURITY_DEPOSIT_REFUNDED",
        source_model="Subscription",
        source_id=subscription.id,
        reason="Refund liability-reduction posting hook is not configured; source records are tracked and auditable.",
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "ACCOUNTING_SYNC_SKIPPED", **asdict(result), "amount": str(amount)},
    )
    return asdict(result)


def sync_damage_deduction_income(*, subscription: Subscription, amount, performed_by=None) -> dict:
    result = _deferred(
        event="SECURITY_DEPOSIT_DAMAGE_DEDUCTION",
        source_model="Subscription",
        source_id=subscription.id,
        reason="Damage-recovery income hook is not configured; deduction stays in deposit transaction ledger.",
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "ACCOUNTING_SYNC_SKIPPED", **asdict(result), "amount": str(amount)},
    )
    return asdict(result)

