"""Accounting sync boundary for live rent/lease billing and deposits.

This service intentionally avoids fake journal entries. It only reports source
facts and marks the event as deferred when operational account hooks are not
configured yet.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from django.utils import timezone

from accounting.models import RentLeaseAccountingAccountMapping
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


def get_active_account_mapping() -> RentLeaseAccountingAccountMapping | None:
    return (
        RentLeaseAccountingAccountMapping.objects.select_related(
            "monthly_income_account",
            "deposit_liability_account",
            "deposit_refund_account",
            "damage_recovery_income_account",
            "settlement_finance_account",
        )
        .filter(is_active=True)
        .first()
    )


def _mapping_metadata(mapping: RentLeaseAccountingAccountMapping | None) -> dict:
    if mapping is None:
        return {"mapping_configured": False}
    return {
        "mapping_configured": True,
        "mapping_id": mapping.id,
        "monthly_income_account_code": mapping.monthly_income_account.code,
        "deposit_liability_account_code": mapping.deposit_liability_account.code,
        "deposit_refund_account_code": mapping.deposit_refund_account.code,
        "damage_recovery_income_account_code": mapping.damage_recovery_income_account.code,
        "settlement_finance_account_id": mapping.settlement_finance_account_id,
    }


def sync_rent_lease_monthly_income(*, subscription: Subscription, amount, performed_by=None) -> dict:
    mapping = get_active_account_mapping()
    result = _deferred(
        event="RENT_LEASE_MONTHLY_PAYMENT",
        source_model="Subscription",
        source_id=subscription.id,
        reason=(
            "Rent/lease posting bridge is not enabled yet; source records remain authoritative."
            if mapping
            else "No active rent/lease account mapping configured; source records remain authoritative."
        ),
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "ACCOUNTING_SYNC_SKIPPED", **asdict(result), "amount": str(amount), **_mapping_metadata(mapping)},
    )
    return asdict(result)


def sync_security_deposit_liability(*, subscription: Subscription, amount, performed_by=None) -> dict:
    mapping = get_active_account_mapping()
    result = _deferred(
        event="SECURITY_DEPOSIT_COLLECTED",
        source_model="Subscription",
        source_id=subscription.id,
        reason=(
            "Deposit liability posting bridge is not enabled yet; source records remain authoritative."
            if mapping
            else "No active rent/lease account mapping configured; source records remain authoritative."
        ),
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "ACCOUNTING_SYNC_SKIPPED", **asdict(result), "amount": str(amount), **_mapping_metadata(mapping)},
    )
    return asdict(result)


def sync_deposit_refund_liability_reduction(*, subscription: Subscription, amount, performed_by=None) -> dict:
    mapping = get_active_account_mapping()
    result = _deferred(
        event="SECURITY_DEPOSIT_REFUNDED",
        source_model="Subscription",
        source_id=subscription.id,
        reason=(
            "Refund liability-reduction bridge is not enabled yet; source records remain authoritative."
            if mapping
            else "No active rent/lease account mapping configured; source records remain authoritative."
        ),
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "ACCOUNTING_SYNC_SKIPPED", **asdict(result), "amount": str(amount), **_mapping_metadata(mapping)},
    )
    return asdict(result)


def sync_damage_deduction_income(*, subscription: Subscription, amount, performed_by=None) -> dict:
    mapping = get_active_account_mapping()
    result = _deferred(
        event="SECURITY_DEPOSIT_DAMAGE_DEDUCTION",
        source_model="Subscription",
        source_id=subscription.id,
        reason=(
            "Damage-recovery posting bridge is not enabled yet; source records remain authoritative."
            if mapping
            else "No active rent/lease account mapping configured; source records remain authoritative."
        ),
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"event": "ACCOUNTING_SYNC_SKIPPED", **asdict(result), "amount": str(amount), **_mapping_metadata(mapping)},
    )
    return asdict(result)

