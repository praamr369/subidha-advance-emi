from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from subscriptions.models import AuditLog
from subscriptions.models_business_compliance_review import (
    BusinessComplianceDocumentReviewState,
    BusinessComplianceReviewStatus,
)
from subscriptions.models_business_setup import (
    BusinessComplianceDocument,
    BusinessComplianceDocumentVerificationStatus,
    BusinessComplianceDocumentVisibility,
)
from subscriptions.services.audit_service import log_audit


def get_review_state(document: BusinessComplianceDocument) -> BusinessComplianceDocumentReviewState:
    state, _ = BusinessComplianceDocumentReviewState.objects.get_or_create(document=document)
    return state


def has_real_evidence(document: BusinessComplianceDocument) -> bool:
    return bool(document.file and getattr(document.file, "name", ""))


def review_status(document: BusinessComplianceDocument) -> str:
    if not document.is_active:
        return BusinessComplianceReviewStatus.EXPIRED
    return get_review_state(document).review_status


def public_summary_approved(document: BusinessComplianceDocument) -> bool:
    state = get_review_state(document)
    return bool(
        document.is_active
        and document.public_visibility == BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY
        and document.public_summary.strip()
        and state.review_status == BusinessComplianceReviewStatus.APPROVED
        and state.approved_public_summary
    )


def _actor_name(performed_by=None) -> str:
    if not performed_by:
        return "system"
    return getattr(performed_by, "username", "") or str(getattr(performed_by, "pk", "actor"))


def _audit(
    *,
    document: BusinessComplianceDocument,
    event: str,
    performed_by=None,
    old_status: str,
    new_status: str,
    reason: str = "",
    fields: list[str] | None = None,
) -> None:
    log_audit(
        action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED,
        instance=document,
        performed_by=performed_by,
        metadata={
            "event": event,
            "document_id": document.id,
            "document_type": document.document_type,
            "old_status": old_status,
            "new_status": new_status,
            "actor": _actor_name(performed_by),
            "reason": reason,
            "fields": fields or [],
            "approved_public_summary": public_summary_approved(document),
        },
    )


@transaction.atomic
def update_document_metadata(
    *,
    document: BusinessComplianceDocument,
    payload: dict[str, Any],
    performed_by=None,
) -> BusinessComplianceDocument:
    state = get_review_state(document)
    old_status = state.review_status
    changed: list[str] = []
    old_file_name = document.file.name if document.file else ""

    document_fields = {"document_type", "title", "public_visibility", "public_summary", "notes", "is_active"}
    state_fields = {"expires_at", "source_template_key"}

    for field, value in payload.items():
        if field in document_fields:
            setattr(document, field, value)
            changed.append(field)
        elif field in state_fields:
            setattr(state, field, value)
            changed.append(field)
        elif field == "file":
            document.file = value
            changed.append("file")

    if "file" in changed and (document.file.name if document.file else "") != old_file_name:
        state.evidence_uploaded_at = timezone.now()
        state.review_status = BusinessComplianceReviewStatus.PENDING
        state.approved_public_summary = False
        state.public_summary_approved_at = None
        state.public_summary_approved_by = None
        state.last_action_reason = "Evidence file uploaded/replaced. Review required."

    if "public_summary" in changed or "public_visibility" in changed:
        state.approved_public_summary = False
        state.public_summary_approved_at = None
        state.public_summary_approved_by = None

    document.save()
    state.save()
    _audit(
        document=document,
        event="BUSINESS_COMPLIANCE_DOCUMENT_METADATA_UPDATED",
        performed_by=performed_by,
        old_status=old_status,
        new_status=state.review_status,
        fields=changed,
    )
    return document


@transaction.atomic
def mark_under_review(document: BusinessComplianceDocument, performed_by=None) -> BusinessComplianceDocument:
    state = get_review_state(document)
    old_status = state.review_status
    state.review_status = BusinessComplianceReviewStatus.UNDER_REVIEW
    state.last_action_reason = "Submitted for admin compliance review."
    state.save(update_fields=["review_status", "last_action_reason", "updated_at"])
    document.verification_status = BusinessComplianceDocumentVerificationStatus.PENDING
    document.reviewed_by = performed_by
    document.save(update_fields=["verification_status", "reviewed_by", "updated_at"])
    _audit(
        document=document,
        event="BUSINESS_COMPLIANCE_DOCUMENT_SUBMITTED_REVIEW",
        performed_by=performed_by,
        old_status=old_status,
        new_status=state.review_status,
    )
    return document


@transaction.atomic
def approve_document(
    document: BusinessComplianceDocument,
    performed_by=None,
    public_summary_approved_flag: bool = False,
) -> BusinessComplianceDocument:
    if not has_real_evidence(document):
        raise ValueError("Approval requires a real evidence file. Seeded empty rows cannot be approved.")

    state = get_review_state(document)
    old_status = state.review_status
    now = timezone.now()

    state.review_status = BusinessComplianceReviewStatus.APPROVED
    state.reviewed_at = now
    state.rejected_reason = ""
    state.last_action_reason = "Approved after evidence review."

    if public_summary_approved_flag:
        if document.public_visibility != BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY:
            raise ValueError("Public summary approval requires PUBLIC_SUMMARY_ONLY visibility.")
        if not document.public_summary.strip():
            raise ValueError("Public summary approval requires non-empty public summary text.")
        state.approved_public_summary = True
        state.public_summary_approved_at = now
        state.public_summary_approved_by = performed_by
        state.last_action_reason = "Document approved and public-safe summary approved. Source file remains private."

    document.verification_status = BusinessComplianceDocumentVerificationStatus.VERIFIED
    document.reviewed_by = performed_by
    document.verified_at = now
    document.is_active = True
    document.save(update_fields=["verification_status", "reviewed_by", "verified_at", "is_active", "updated_at"])
    state.save()
    _audit(
        document=document,
        event="BUSINESS_COMPLIANCE_DOCUMENT_APPROVED",
        performed_by=performed_by,
        old_status=old_status,
        new_status=state.review_status,
    )
    return document


@transaction.atomic
def reject_document(document: BusinessComplianceDocument, performed_by=None, reason: str = "") -> BusinessComplianceDocument:
    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Reject reason is required.")
    state = get_review_state(document)
    old_status = state.review_status
    state.review_status = BusinessComplianceReviewStatus.REJECTED
    state.reviewed_at = timezone.now()
    state.rejected_reason = reason
    state.last_action_reason = reason
    state.approved_public_summary = False
    state.public_summary_approved_at = None
    state.public_summary_approved_by = None
    state.save()
    document.verification_status = BusinessComplianceDocumentVerificationStatus.REJECTED
    document.reviewed_by = performed_by
    document.save(update_fields=["verification_status", "reviewed_by", "updated_at"])
    _audit(
        document=document,
        event="BUSINESS_COMPLIANCE_DOCUMENT_REJECTED",
        performed_by=performed_by,
        old_status=old_status,
        new_status=state.review_status,
        reason=reason,
    )
    return document


@transaction.atomic
def expire_document(document: BusinessComplianceDocument, performed_by=None, reason: str = "") -> BusinessComplianceDocument:
    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Expiry/deactivation reason is required.")
    state = get_review_state(document)
    old_status = state.review_status
    state.review_status = BusinessComplianceReviewStatus.EXPIRED
    state.reviewed_at = timezone.now()
    state.last_action_reason = reason
    state.approved_public_summary = False
    state.public_summary_approved_at = None
    state.public_summary_approved_by = None
    state.save()
    document.is_active = False
    document.reviewed_by = performed_by
    document.save(update_fields=["is_active", "reviewed_by", "updated_at"])
    _audit(
        document=document,
        event="BUSINESS_COMPLIANCE_DOCUMENT_EXPIRED",
        performed_by=performed_by,
        old_status=old_status,
        new_status=state.review_status,
        reason=reason,
    )
    return document


@transaction.atomic
def approve_public_summary(document: BusinessComplianceDocument, performed_by=None) -> BusinessComplianceDocument:
    state = get_review_state(document)
    if state.review_status != BusinessComplianceReviewStatus.APPROVED:
        raise ValueError("Public summary approval requires an approved compliance document.")
    if document.public_visibility != BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY:
        raise ValueError("Public summary approval requires PUBLIC_SUMMARY_ONLY visibility.")
    if not document.public_summary.strip():
        raise ValueError("Public summary approval requires non-empty public summary text.")
    old_status = state.review_status
    state.approved_public_summary = True
    state.public_summary_approved_at = timezone.now()
    state.public_summary_approved_by = performed_by
    state.last_action_reason = "Public-safe summary approved. Source file remains private."
    state.save()
    _audit(
        document=document,
        event="BUSINESS_COMPLIANCE_PUBLIC_SUMMARY_APPROVED",
        performed_by=performed_by,
        old_status=old_status,
        new_status=state.review_status,
    )
    return document


@transaction.atomic
def revoke_public_summary(document: BusinessComplianceDocument, performed_by=None) -> BusinessComplianceDocument:
    state = get_review_state(document)
    old_status = state.review_status
    state.approved_public_summary = False
    state.public_summary_approved_at = None
    state.public_summary_approved_by = None
    state.last_action_reason = "Public summary approval revoked."
    state.save()
    _audit(
        document=document,
        event="BUSINESS_COMPLIANCE_PUBLIC_SUMMARY_REVOKED",
        performed_by=performed_by,
        old_status=old_status,
        new_status=state.review_status,
    )
    return document
