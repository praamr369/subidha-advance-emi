"""Contract amendment service."""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    ContractAmendment,
    ContractAmendmentStatus,
    ContractAmendmentType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit

_AMENDABLE_STATUSES = {
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.APPROVED,
    SubscriptionStatus.PAYMENT_PENDING,
    SubscriptionStatus.DELIVERY_PENDING,
    SubscriptionStatus.HANDED_OVER,
}


@transaction.atomic
def create_amendment(
    *,
    subscription: Subscription,
    amendment_type: str,
    previous_values: dict,
    new_values: dict,
    reason: str,
    requested_by,
    notes: str = "",
) -> ContractAmendment:
    if subscription.status not in _AMENDABLE_STATUSES:
        raise ValidationError(
            f"Cannot request an amendment on a contract in status '{subscription.status}'."
        )
    if not reason or not reason.strip():
        raise ValidationError({"reason": "Amendment reason is required."})
    if amendment_type not in ContractAmendmentType.values:
        raise ValidationError({"amendment_type": f"Unknown amendment type: {amendment_type!r}"})

    amendment = ContractAmendment.objects.create(
        subscription=subscription,
        amendment_type=amendment_type,
        status=ContractAmendmentStatus.REQUESTED,
        previous_values=previous_values or {},
        new_values=new_values or {},
        reason=reason.strip(),
        requested_by=requested_by,
        notes=(notes or "").strip(),
    )

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_REQUESTED,
        instance=subscription,
        performed_by=requested_by,
        metadata={"amendment_id": amendment.pk, "amendment_type": amendment_type},
    )
    return amendment


@transaction.atomic
def approve_amendment(*, amendment: ContractAmendment, approved_by) -> ContractAmendment:
    if amendment.status != ContractAmendmentStatus.REQUESTED:
        raise ValidationError(
            f"Cannot approve amendment in status '{amendment.status}'. Must be REQUESTED."
        )

    amendment.status = ContractAmendmentStatus.APPROVED
    amendment.approved_by = approved_by
    amendment.approved_at = timezone.now()
    amendment.save(update_fields=["status", "approved_by", "approved_at"])

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPROVED,
        instance=amendment.subscription,
        performed_by=approved_by,
        metadata={"amendment_id": amendment.pk},
    )
    return amendment


@transaction.atomic
def reject_amendment(
    *, amendment: ContractAmendment, rejected_by, rejection_reason: str
) -> ContractAmendment:
    if amendment.status != ContractAmendmentStatus.REQUESTED:
        raise ValidationError(
            f"Cannot reject amendment in status '{amendment.status}'. Must be REQUESTED."
        )
    if not rejection_reason or not rejection_reason.strip():
        raise ValidationError({"rejection_reason": "Rejection reason is required."})

    amendment.status = ContractAmendmentStatus.REJECTED
    amendment.rejection_reason = rejection_reason.strip()
    amendment.save(update_fields=["status", "rejection_reason"])

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_REJECTED,
        instance=amendment.subscription,
        performed_by=rejected_by,
        metadata={"amendment_id": amendment.pk, "reason": rejection_reason[:200]},
    )
    return amendment


@transaction.atomic
def apply_amendment(*, amendment: ContractAmendment, applied_by) -> ContractAmendment:
    if amendment.status != ContractAmendmentStatus.APPROVED:
        raise ValidationError(
            f"Cannot apply amendment in status '{amendment.status}'. Must be APPROVED."
        )

    amendment.status = ContractAmendmentStatus.APPLIED
    amendment.applied_at = timezone.now()
    amendment.save(update_fields=["status", "applied_at"])

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_AMENDMENT_APPLIED,
        instance=amendment.subscription,
        performed_by=applied_by,
        metadata={
            "amendment_id": amendment.pk,
            "amendment_type": amendment.amendment_type,
            "previous_values": amendment.previous_values,
            "new_values": amendment.new_values,
        },
    )
    return amendment
