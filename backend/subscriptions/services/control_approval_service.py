"""
P2A — Approval service for maker-checker workflows.

All mutations go through this service. Direct ORM writes are not permitted
by convention outside this module.
"""
from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from subscriptions.models_control_foundation import (
    ApprovalRequest,
    ApprovalRiskLevel,
    ApprovalStatus,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.models import AuditLog


# ─────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────

_SENSITIVE_RISK_LEVELS = frozenset({ApprovalRiskLevel.HIGH, ApprovalRiskLevel.CRITICAL})


def _guard_decided(request: ApprovalRequest) -> None:
    if request.status in (ApprovalStatus.APPROVED, ApprovalStatus.REJECTED):
        raise ValueError(
            f"ApprovalRequest {request.pk} is already {request.status}. Decided requests are immutable."
        )


def _log(action_key: str, request: ApprovalRequest, performed_by=None, extra: dict | None = None) -> None:
    log_audit(
        action_type=AuditLog.ActionType.USER_UPDATED,  # generic — no dedicated type yet
        instance=request,
        performed_by=performed_by,
        metadata={
            "event": f"APPROVAL_{action_key}",
            "approval_id": request.pk,
            "action_key": request.action_key,
            "source_model": request.source_model,
            "source_id": request.source_id,
            "status": request.status,
            **(extra or {}),
        },
    )


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

@transaction.atomic
def create_approval_request(
    *,
    source_model: str,
    source_id: str,
    action_key: str,
    requested_by,
    risk_level: str = ApprovalRiskLevel.MEDIUM,
    before_snapshot: dict | None = None,
    after_snapshot: dict | None = None,
    request_reason: str = "",
    expires_at=None,
    metadata: dict | None = None,
) -> ApprovalRequest:
    request = ApprovalRequest(
        source_model=source_model,
        source_id=str(source_id),
        action_key=action_key,
        requested_by=requested_by,
        risk_level=risk_level,
        before_snapshot=before_snapshot or {},
        after_snapshot=after_snapshot or {},
        request_reason=(request_reason or "").strip(),
        requested_at=timezone.now(),
        expires_at=expires_at,
        metadata=metadata or {},
    )
    request.full_clean()
    request.save()
    _log("REQUESTED", request, performed_by=requested_by)
    return request


@transaction.atomic
def approve_request(
    *,
    request: ApprovalRequest,
    decided_by,
    decision_reason: str = "",
) -> ApprovalRequest:
    _guard_decided(request)

    if request.risk_level in _SENSITIVE_RISK_LEVELS:
        if decided_by.pk == request.requested_by_id:
            raise ValueError(
                "Self-approval is not permitted for HIGH or CRITICAL risk actions."
            )

    request.status = ApprovalStatus.APPROVED
    request.approved_by = decided_by
    request.decided_at = timezone.now()
    request.decision_reason = (decision_reason or "").strip()
    request.full_clean()
    request.save()
    _log("APPROVED", request, performed_by=decided_by, extra={"decision_reason": decision_reason})
    return request


@transaction.atomic
def reject_request(
    *,
    request: ApprovalRequest,
    decided_by,
    decision_reason: str = "",
) -> ApprovalRequest:
    _guard_decided(request)

    request.status = ApprovalStatus.REJECTED
    request.approved_by = decided_by
    request.decided_at = timezone.now()
    request.decision_reason = (decision_reason or "").strip()
    request.full_clean()
    request.save()
    _log("REJECTED", request, performed_by=decided_by, extra={"decision_reason": decision_reason})
    return request


@transaction.atomic
def cancel_request(
    *,
    request: ApprovalRequest,
    cancelled_by,
    reason: str = "",
) -> ApprovalRequest:
    _guard_decided(request)
    if request.status == ApprovalStatus.CANCELLED:
        return request

    request.status = ApprovalStatus.CANCELLED
    request.decided_at = timezone.now()
    request.decision_reason = (reason or "").strip()
    request.full_clean()
    request.save()
    _log("CANCELLED", request, performed_by=cancelled_by, extra={"reason": reason})
    return request


def expire_pending_requests() -> int:
    """Mark PENDING requests whose expires_at has passed as EXPIRED. Returns count."""
    now = timezone.now()
    return ApprovalRequest.objects.filter(
        status=ApprovalStatus.PENDING,
        expires_at__lt=now,
    ).update(status=ApprovalStatus.EXPIRED)
