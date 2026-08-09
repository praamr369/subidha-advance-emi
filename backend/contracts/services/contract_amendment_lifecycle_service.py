from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import AuditLog, ContractAmendment
from subscriptions.services.audit_service import log_audit

_CANCEL_SAFE_STATUSES = {"REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED"}
_USER_WITHDRAW_SAFE_STATUSES = {"REQUESTED"}
_TERMINAL_IMPLEMENTED_STATUSES = {"IMPLEMENTED", "APPLIED"}


def _reason_required(reason: str) -> str:
    cleaned = (reason or "").strip()
    if not cleaned:
        raise ValidationError({"reason": "Reason is required."})
    return cleaned


@transaction.atomic
def cancel_or_archive_amendment(
    *,
    amendment: ContractAmendment,
    actor,
    reason: str,
    action: str = "CANCELLED",
    actor_scope: str = "ADMIN",
) -> ContractAmendment:
    """Status-only amendment cancellation/archive.

    This never mutates the source subscription/contract or downstream financial
    records. It only moves the amendment record to CANCELLED and records reason
    metadata for audit and operator review.
    """

    reason = _reason_required(reason)
    normalized_action = (action or "CANCELLED").strip().upper()
    if normalized_action not in {"CANCELLED", "ARCHIVED", "VOIDED", "WITHDRAWN"}:
        raise ValidationError({"action": "Unsupported lifecycle action."})

    locked = ContractAmendment.objects.select_for_update().get(pk=amendment.pk)
    if locked.status in _TERMINAL_IMPLEMENTED_STATUSES:
        raise ValidationError({"detail": "Implemented/applied amendment records cannot be cancelled, voided, archived, or hard-deleted."})

    if actor_scope in {"CUSTOMER", "PARTNER"}:
        if locked.status not in _USER_WITHDRAW_SAFE_STATUSES:
            raise ValidationError({"detail": "Only REQUESTED amendments can be withdrawn by customer or partner before admin review starts."})
        normalized_action = "WITHDRAWN"
    elif locked.status not in _CANCEL_SAFE_STATUSES:
        raise ValidationError({"detail": f"Cannot cancel/archive amendment in status '{locked.status}'."})

    previous_status = locked.status
    now = timezone.now()
    locked.status = "CANCELLED"
    locked.metadata = {
        **(locked.metadata or {}),
        "lifecycle_action": normalized_action,
        "lifecycle_reason": reason,
        "lifecycle_actor_scope": actor_scope,
        "lifecycle_previous_status": previous_status,
        "lifecycle_at": now.isoformat(),
    }
    locked.admin_note = (
        f"{locked.admin_note}\n[{normalized_action}] {reason}" if locked.admin_note else f"[{normalized_action}] {reason}"
    ).strip()
    locked.save(update_fields=["status", "metadata", "admin_note", "updated_at"])

    source = locked.source_contract()
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=source or locked,
        performed_by=actor,
        metadata={
            "event": "CONTRACT_AMENDMENT_LIFECYCLE_STATUS_CHANGED",
            "amendment_id": locked.pk,
            "amendment_no": locked.amendment_no,
            "action": normalized_action,
            "previous_status": previous_status,
            "new_status": locked.status,
            "reason": reason,
            "actor_scope": actor_scope,
            "source_record_mutation": False,
        },
    )
    return locked
