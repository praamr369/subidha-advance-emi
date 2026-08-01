from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from subscriptions.models import (
    PaymentReconciliation,
    PaymentReconciliationEvent,
    ReconciliationEventType,
    ReconciliationStatus,
)
from subscriptions.services.audit_service import log_reconciliation_event


def _append_note(current: str, extra: str) -> str:
    return "\n".join(part for part in [current.strip(), extra.strip()] if part).strip()


def _require_reason(reason: str):
    if not reason or not reason.strip():
        raise serializers.ValidationError({"reason": "Reason is required."})


@transaction.atomic
def mark_reconciled(*, reconciliation_id: int, performed_by, reason: str) -> dict:
    _require_reason(reason)
    row = PaymentReconciliation.objects.select_for_update().select_related("payment").get(pk=reconciliation_id)
    old_status = row.status
    if row.status == ReconciliationStatus.MATCHED:
        return {"id": row.id, "status": row.status, "idempotent": True}
    row.status = ReconciliationStatus.MATCHED
    row.is_flagged = False
    row.reconciled_by = performed_by
    row.reconciled_at = timezone.now()
    row.notes = _append_note(row.notes, f"RECONCILED: {reason}")
    row.save(update_fields=["status", "is_flagged", "reconciled_by", "reconciled_at", "notes", "updated_at"])
    PaymentReconciliationEvent.objects.create(
        reconciliation=row,
        event_type=ReconciliationEventType.STATUS_CHANGED,
        old_status=old_status,
        new_status=row.status,
        message=reason,
        actor=performed_by,
    )
    log_reconciliation_event(
        instance=row.payment,
        performed_by=performed_by,
        event="RECONCILIATION_MARK_RECONCILED",
        metadata={"reconciliation_id": row.id, "reason": reason},
    )
    return {"id": row.id, "status": row.status, "idempotent": False}


@transaction.atomic
def mark_unreconciled(*, reconciliation_id: int, performed_by, reason: str) -> dict:
    _require_reason(reason)
    row = PaymentReconciliation.objects.select_for_update().select_related("payment").get(pk=reconciliation_id)
    old_status = row.status
    if row.status == ReconciliationStatus.PENDING:
        return {"id": row.id, "status": row.status, "idempotent": True}
    row.status = ReconciliationStatus.PENDING
    row.reconciled_by = performed_by
    row.reconciled_at = timezone.now()
    row.notes = _append_note(row.notes, f"UNRECONCILED: {reason}")
    row.save(update_fields=["status", "reconciled_by", "reconciled_at", "notes", "updated_at"])
    PaymentReconciliationEvent.objects.create(
        reconciliation=row,
        event_type=ReconciliationEventType.STATUS_CHANGED,
        old_status=old_status,
        new_status=row.status,
        message=reason,
        actor=performed_by,
    )
    log_reconciliation_event(
        instance=row.payment,
        performed_by=performed_by,
        event="RECONCILIATION_MARK_UNRECONCILED",
        metadata={"reconciliation_id": row.id, "reason": reason},
    )
    return {"id": row.id, "status": row.status, "idempotent": False}


@transaction.atomic
def attach_reference(*, reconciliation_id: int, performed_by, reference: str, reason: str) -> dict:
    _require_reason(reason)
    if not reference or not reference.strip():
        raise serializers.ValidationError({"reference": "Reference is required."})
    row = PaymentReconciliation.objects.select_for_update().select_related("payment").get(pk=reconciliation_id)
    message = f"REFERENCE: {reference.strip()} | {reason.strip()}"
    row.notes = _append_note(row.notes, message)
    row.reconciled_by = performed_by
    row.reconciled_at = timezone.now()
    row.save(update_fields=["notes", "reconciled_by", "reconciled_at", "updated_at"])
    PaymentReconciliationEvent.objects.create(
        reconciliation=row,
        event_type=ReconciliationEventType.NOTE_ADDED,
        old_status=row.status,
        new_status=row.status,
        message=message,
        actor=performed_by,
    )
    log_reconciliation_event(
        instance=row.payment,
        performed_by=performed_by,
        event="RECONCILIATION_REFERENCE_ATTACHED",
        metadata={"reconciliation_id": row.id, "reference": reference.strip(), "reason": reason.strip()},
    )
    return {"id": row.id, "status": row.status, "reference": reference.strip()}

