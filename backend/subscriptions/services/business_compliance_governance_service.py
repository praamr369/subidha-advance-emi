from __future__ import annotations

from dataclasses import dataclass
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
    BusinessComplianceDocumentType,
    BusinessComplianceDocumentVerificationStatus,
    BusinessComplianceDocumentVisibility,
    BusinessProfile,
)
from subscriptions.services.audit_service import log_audit

REQUIRED = "REQUIRED"
RECOMMENDED = "RECOMMENDED"
OPTIONAL = "OPTIONAL"
PRIVATE_ONLY = "PRIVATE_ONLY"
SUMMARY_ONLY = "SUMMARY_ONLY"
PUBLIC_AFTER_APPROVAL = "PUBLIC_AFTER_APPROVAL"


@dataclass(frozen=True)
class BusinessComplianceTemplate:
    key: str
    label: str
    document_type: str
    required_level: str
    visibility_default: str
    allowed_public_exposure: str
    description: str
    recommended_action: str
    readiness_impact: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "document_type": self.document_type,
            "required_level": self.required_level,
            "visibility_default": self.visibility_default,
            "allowed_public_exposure": self.allowed_public_exposure,
            "description": self.description,
            "recommended_action": self.recommended_action,
            "readiness_impact": self.readiness_impact,
        }


BUSINESS_COMPLIANCE_TEMPLATES: tuple[BusinessComplianceTemplate, ...] = (
    BusinessComplianceTemplate(
        key="ownership-proof",
        label="Ownership Proof",
        document_type=BusinessComplianceDocumentType.OWNERSHIP_PROOF,
        required_level=REQUIRED,
        visibility_default=BusinessComplianceDocumentVisibility.PRIVATE,
        allowed_public_exposure=SUMMARY_ONLY,
        description="Proof that the business has the right to operate from the premises if owned.",
        recommended_action="Upload ownership/tax/property proof, keep file private, and add only a public-safe summary after review.",
        readiness_impact="Required premises evidence. Ready only after verified/approved evidence exists.",
    ),
    BusinessComplianceTemplate(
        key="rental-agreement",
        label="Rental Agreement",
        document_type=BusinessComplianceDocumentType.RENTAL_AGREEMENT,
        required_level=REQUIRED,
        visibility_default=BusinessComplianceDocumentVisibility.PRIVATE,
        allowed_public_exposure=SUMMARY_ONLY,
        description="Proof that the business has the right to operate from rented shop premises when applicable.",
        recommended_action="Upload rental/lease agreement if the premises are rented. Do not make the file publicly downloadable.",
        readiness_impact="Required when rented premises apply; accepted as premises evidence when verified.",
    ),
    BusinessComplianceTemplate(
        key="business-address-proof",
        label="Business Address Proof",
        document_type=BusinessComplianceDocumentType.SHOP_LICENSE,
        required_level=REQUIRED,
        visibility_default=BusinessComplianceDocumentVisibility.PRIVATE,
        allowed_public_exposure=SUMMARY_ONLY,
        description="Shop address support such as electricity bill, trade proof, shop/license proof, or local address proof.",
        recommended_action="Upload an address-support document and keep the source file private.",
        readiness_impact="Required location evidence. Ready only after verified address proof exists.",
    ),
    BusinessComplianceTemplate(
        key="pan-or-tax-proof",
        label="PAN / Tax Proof",
        document_type=BusinessComplianceDocumentType.PAN_OR_TAX_PROOF,
        required_level=REQUIRED,
        visibility_default=BusinessComplianceDocumentVisibility.PRIVATE,
        allowed_public_exposure=PRIVATE_ONLY,
        description="Tax identity support for the shop/proprietor/business.",
        recommended_action="Upload PAN/tax proof for internal verification only. Do not expose the file or number publicly by default.",
        readiness_impact="Required tax identity evidence. Ready only after verified internal evidence exists.",
    ),
    BusinessComplianceTemplate(
        key="bank-proof",
        label="Bank Proof",
        document_type=BusinessComplianceDocumentType.BANK_PROOF,
        required_level=REQUIRED,
        visibility_default=BusinessComplianceDocumentVisibility.PRIVATE,
        allowed_public_exposure=PRIVATE_ONLY,
        description="Business collection/refund bank evidence.",
        recommended_action="Upload cancelled cheque/passbook/bank proof for admin finance control only.",
        readiness_impact="Required collection/refund evidence. Ready only after verified bank proof exists.",
    ),
    BusinessComplianceTemplate(
        key="udyam-certificate",
        label="Udyam Certificate",
        document_type=BusinessComplianceDocumentType.UDYAM_CERTIFICATE,
        required_level=RECOMMENDED,
        visibility_default=BusinessComplianceDocumentVisibility.PRIVATE,
        allowed_public_exposure=SUMMARY_ONLY,
        description="MSME/Udyam status evidence where issued.",
        recommended_action="Upload only if actually issued. Do not claim Udyam/MSME status from a draft row.",
        readiness_impact="Recommended. Missing evidence creates a warning only.",
    ),
    BusinessComplianceTemplate(
        key="gst-certificate",
        label="GST Certificate",
        document_type=BusinessComplianceDocumentType.GST_CERTIFICATE,
        required_level=RECOMMENDED,
        visibility_default=BusinessComplianceDocumentVisibility.PRIVATE,
        allowed_public_exposure=SUMMARY_ONLY,
        description="GST registration evidence where GST registration is actually issued/enabled.",
        recommended_action="Upload only if GST registration exists. Do not fake GST status.",
        readiness_impact="Recommended unless GST workflow is separately enforced; missing evidence creates a warning only.",
    ),
    BusinessComplianceTemplate(
        key="shop-license",
        label="Shop / Trade License",
        document_type=BusinessComplianceDocumentType.SHOP_LICENSE,
        required_level=RECOMMENDED,
        visibility_default=BusinessComplianceDocumentVisibility.PRIVATE,
        allowed_public_exposure=SUMMARY_ONLY,
        description="Local shop, trade, or license proof if available.",
        recommended_action="Upload available local shop/trade/license proof and expose only a reviewed public summary.",
        readiness_impact="Recommended evidence. Missing evidence creates a warning only.",
    ),
    BusinessComplianceTemplate(
        key="proprietor-id-proof",
        label="Proprietor ID Proof",
        document_type=BusinessComplianceDocumentType.OTHER,
        required_level=OPTIONAL,
        visibility_default=BusinessComplianceDocumentVisibility.PRIVATE,
        allowed_public_exposure=PRIVATE_ONLY,
        description="Proprietor identity support for internal governance where required.",
        recommended_action="Store identity evidence privately only when needed for internal verification.",
        readiness_impact="Optional. Does not block readiness.",
    ),
    BusinessComplianceTemplate(
        key="other-compliance-proof",
        label="Other Compliance Proof",
        document_type=BusinessComplianceDocumentType.OTHER,
        required_level=OPTIONAL,
        visibility_default=BusinessComplianceDocumentVisibility.PRIVATE,
        allowed_public_exposure=PRIVATE_ONLY,
        description="Additional compliance evidence not covered by standard document types.",
        recommended_action="Use for additional private compliance records only when needed.",
        readiness_impact="Optional. Does not block readiness.",
    ),
)


def list_business_compliance_templates() -> list[dict[str, Any]]:
    return [template.as_dict() for template in BUSINESS_COMPLIANCE_TEMPLATES]


def _template_by_key(key: str) -> BusinessComplianceTemplate | None:
    cleaned = (key or "").strip().lower()
    return next((template for template in BUSINESS_COMPLIANCE_TEMPLATES if template.key == cleaned), None)


def _template_for_document(document: BusinessComplianceDocument) -> BusinessComplianceTemplate | None:
    title = (document.title or "").strip()
    return next(
        (
            template
            for template in BUSINESS_COMPLIANCE_TEMPLATES
            if template.document_type == document.document_type and template.label == title
        ),
        None,
    )


def _existing_template_row(template: BusinessComplianceTemplate) -> BusinessComplianceDocument | None:
    return (
        BusinessComplianceDocument.objects.filter(
            document_type=template.document_type,
            title=template.label,
            is_active=True,
        )
        .order_by("-created_at", "-id")
        .first()
    )


def _actor_name(performed_by=None) -> str:
    if not performed_by:
        return "system"
    return getattr(performed_by, "username", "") or str(getattr(performed_by, "pk", "actor"))


def get_document_review_state(document: BusinessComplianceDocument) -> BusinessComplianceDocumentReviewState:
    state, _ = BusinessComplianceDocumentReviewState.objects.get_or_create(document=document)
    return state


def document_has_evidence(document: BusinessComplianceDocument) -> bool:
    return bool(getattr(document, "file", None))


def review_status_for_document(document: BusinessComplianceDocument) -> str:
    if hasattr(document, "review_state"):
        return document.review_state.review_status
    if not document.is_active:
        return BusinessComplianceReviewStatus.EXPIRED
    if document.verification_status == BusinessComplianceDocumentVerificationStatus.VERIFIED:
        return BusinessComplianceReviewStatus.APPROVED
    if document.verification_status == BusinessComplianceDocumentVerificationStatus.REJECTED:
        return BusinessComplianceReviewStatus.REJECTED
    return BusinessComplianceReviewStatus.PENDING


def public_summary_is_approved(document: BusinessComplianceDocument) -> bool:
    if not hasattr(document, "review_state"):
        return False
    state = document.review_state
    return bool(state.approved_public_summary and state.review_status == BusinessComplianceReviewStatus.APPROVED)


def _log_document_event(
    *,
    document: BusinessComplianceDocument,
    performed_by=None,
    event: str,
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
            "approved_public_summary": public_summary_is_approved(document),
        },
    )


@transaction.atomic
def seed_business_compliance_rows(*, performed_by=None) -> dict[str, Any]:
    created: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for template in BUSINESS_COMPLIANCE_TEMPLATES:
        if template.required_level == OPTIONAL:
            skipped.append({"key": template.key, "reason": "optional_template_not_seeded"})
            continue

        existing = _existing_template_row(template)
        if existing is not None:
            state = get_document_review_state(existing)
            if not state.source_template_key:
                state.source_template_key = template.key
                state.save(update_fields=["source_template_key", "updated_at"])
            skipped.append({"key": template.key, "document_id": existing.id, "reason": "existing_row"})
            continue

        row = BusinessComplianceDocument.objects.create(
            document_type=template.document_type,
            title=template.label,
            public_visibility=BusinessComplianceDocumentVisibility.PRIVATE,
            verification_status=BusinessComplianceDocumentVerificationStatus.PENDING,
            public_summary="",
            notes=f"Seeded from compliance checklist template: {template.key}. Upload real evidence before review.",
            uploaded_by=performed_by,
        )
        BusinessComplianceDocumentReviewState.objects.create(document=row, source_template_key=template.key)
        created.append({"key": template.key, "document_id": row.id})

    marker = BusinessComplianceDocument.objects.order_by("-id").first()
    if marker is not None and created:
        log_audit(
            action_type=AuditLog.ActionType.PUBLIC_SITE_UPDATED,
            instance=marker,
            performed_by=performed_by,
            metadata={
                "event": "BUSINESS_COMPLIANCE_ROWS_SEEDED",
                "created": created,
                "skipped": skipped,
                "mutation_policy": "Created empty PRIVATE/PENDING metadata rows only; no fake files, no verified status.",
            },
        )

    return {"created_count": len(created), "skipped_count": len(skipped), "created": created, "skipped": skipped}


def compliance_status_for_document(document: BusinessComplianceDocument) -> str:
    return review_status_for_document(document)


def is_publicly_downloadable(document: BusinessComplianceDocument) -> bool:
    return False


@transaction.atomic
def update_document_metadata(*, document: BusinessComplianceDocument, payload: dict[str, Any], performed_by=None) -> BusinessComplianceDocument:
    state = get_document_review_state(document)
    old_status = state.review_status
    editable_document_fields = {"document_type", "title", "public_visibility", "public_summary", "notes", "is_active"}
    editable_state_fields = {"expires_at", "source_template_key"}
    changed: list[str] = []

    old_file_name = document.file.name if document.file else ""
    for field, value in payload.items():
        if field in editable_document_fields:
            setattr(document, field, value)
            changed.append(field)
        elif field in editable_state_fields:
            setattr(state, field, value)
            changed.append(field)
        elif field == "file":
            setattr(document, field, value)
            changed.append("file")

    if "file" in changed and (document.file.name if document.file else "") != old_file_name:
        state.evidence_uploaded_at = timezone.now()
        if state.review_status in {BusinessComplianceReviewStatus.REJECTED, BusinessComplianceReviewStatus.EXPIRED}:
            state.review_status = BusinessComplianceReviewStatus.PENDING
        state.approved_public_summary = False
        state.public_summary_approved_at = None
        state.public_summary_approved_by = None

    document.reviewed_by = performed_by if "verification_status" in changed else document.reviewed_by
    document.save()
    state.save()
    _log_document_event(
        document=document,
        performed_by=performed_by,
        event="BUSINESS_COMPLIANCE_DOCUMENT_METADATA_UPDATED",
        old_status=old_status,
        new_status=state.review_status,
        fields=changed,
    )
    return document


@transaction.atomic
def mark_under_review(document: BusinessComplianceDocument, performed_by=None) -> BusinessComplianceDocument:
    state = get_document_review_state(document)
    old_status = state.review_status
    state.review_status = BusinessComplianceReviewStatus.UNDER_REVIEW
    state.last_action_reason = "Submitted for admin compliance review."
    state.save(update_fields=["review_status", "last_action_reason", "updated_at"])
    document.verification_status = BusinessComplianceDocumentVerificationStatus.PENDING
    document.reviewed_by = performed_by
    document.save(update_fields=["verification_status", "reviewed_by", "updated_at"])
    _log_document_event(document=document, performed_by=performed_by, event="BUSINESS_COMPLIANCE_DOCUMENT_SUBMITTED_REVIEW", old_status=old_status, new_status=state.review_status)
    return document


@transaction.atomic
def approve_document(document: BusinessComplianceDocument, performed_by=None, public_summary_approved: bool = False) -> BusinessComplianceDocument:
    if not document_has_evidence(document):
        raise ValueError("Approval requires a real evidence file. Seeded empty rows cannot be approved.")
    state = get_document_review_state(document)
    old_status = state.review_status
    now = timezone.now()
    state.review_status = BusinessComplianceReviewStatus.APPROVED
    state.reviewed_at = now
    state.rejected_reason = ""
    state.last_action_reason = "Approved after evidence review."
    document.verification_status = BusinessComplianceDocumentVerificationStatus.VERIFIED
    document.reviewed_by = performed_by
    document.verified_at = now
    document.is_active = True
    if public_summary_approved:
        document = approve_public_summary(document, performed_by=performed_by, save_document=False)
        state = get_document_review_state(document)
    document.save(update_fields=["verification_status", "reviewed_by", "verified_at", "is_active", "updated_at"])
    state.save()
    _log_document_event(document=document, performed_by=performed_by, event="BUSINESS_COMPLIANCE_DOCUMENT_APPROVED", old_status=old_status, new_status=state.review_status)
    return document


@transaction.atomic
def reject_document(document: BusinessComplianceDocument, performed_by=None, reason: str = "") -> BusinessComplianceDocument:
    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Reject reason is required.")
    state = get_document_review_state(document)
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
    _log_document_event(document=document, performed_by=performed_by, event="BUSINESS_COMPLIANCE_DOCUMENT_REJECTED", old_status=old_status, new_status=state.review_status, reason=reason)
    return document


@transaction.atomic
def expire_document(document: BusinessComplianceDocument, performed_by=None, reason: str = "") -> BusinessComplianceDocument:
    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Expiry/deactivation reason is required.")
    state = get_document_review_state(document)
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
    _log_document_event(document=document, performed_by=performed_by, event="BUSINESS_COMPLIANCE_DOCUMENT_EXPIRED", old_status=old_status, new_status=state.review_status, reason=reason)
    return document


@transaction.atomic
def approve_public_summary(document: BusinessComplianceDocument, performed_by=None, save_document: bool = True) -> BusinessComplianceDocument:
    state = get_document_review_state(document)
    if state.review_status != BusinessComplianceReviewStatus.APPROVED:
        raise ValueError("Public summary approval requires an approved compliance document.")
    if document.public_visibility != BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY:
        raise ValueError("Public summary approval requires PUBLIC_SUMMARY_ONLY visibility.")
    if not (document.public_summary or "").strip():
        raise ValueError("Public summary approval requires non-empty public summary text.")
    old_status = state.review_status
    state.approved_public_summary = True
    state.public_summary_approved_at = timezone.now()
    state.public_summary_approved_by = performed_by
    state.last_action_reason = "Public-safe summary approved. Source file remains private."
    if save_document:
        state.save()
        _log_document_event(document=document, performed_by=performed_by, event="BUSINESS_COMPLIANCE_PUBLIC_SUMMARY_APPROVED", old_status=old_status, new_status=state.review_status)
    return document


@transaction.atomic
def revoke_public_summary(document: BusinessComplianceDocument, performed_by=None) -> BusinessComplianceDocument:
    state = get_document_review_state(document)
    old_status = state.review_status
    state.approved_public_summary = False
    state.public_summary_approved_at = None
    state.public_summary_approved_by = None
    state.last_action_reason = "Public summary approval revoked."
    state.save()
    _log_document_event(document=document, performed_by=performed_by, event="BUSINESS_COMPLIANCE_PUBLIC_SUMMARY_REVOKED", old_status=old_status, new_status=state.review_status)
    return document


def _approved_exists(document_types: set[str]) -> bool:
    return BusinessComplianceDocument.objects.filter(
        document_type__in=document_types,
        verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
        is_active=True,
        file__isnull=False,
        review_state__review_status=BusinessComplianceReviewStatus.APPROVED,
    ).exclude(file="").exists()


def _pending_count() -> int:
    return BusinessComplianceDocument.objects.filter(
        is_active=True,
        review_state__review_status__in=[BusinessComplianceReviewStatus.PENDING, BusinessComplianceReviewStatus.UNDER_REVIEW],
    ).count()


def build_business_compliance_readiness() -> dict[str, Any]:
    active_profile_exists = BusinessProfile.objects.filter(is_active=True).exists()

    requirement_checks = [
        {
            "key": "premises_proof",
            "label": "Ownership proof or rental agreement",
            "ready": _approved_exists({BusinessComplianceDocumentType.OWNERSHIP_PROOF, BusinessComplianceDocumentType.RENTAL_AGREEMENT}),
        },
        {
            "key": "business_address_proof",
            "label": "Business address proof",
            "ready": _approved_exists({BusinessComplianceDocumentType.SHOP_LICENSE, BusinessComplianceDocumentType.OTHER}),
        },
        {
            "key": "pan_or_tax_proof",
            "label": "PAN / tax proof",
            "ready": _approved_exists({BusinessComplianceDocumentType.PAN_OR_TAX_PROOF}),
        },
        {
            "key": "bank_proof",
            "label": "Bank proof",
            "ready": _approved_exists({BusinessComplianceDocumentType.BANK_PROOF}),
        },
    ]
    missing_required = [row for row in requirement_checks if not row["ready"]]
    approved_required_count = len(requirement_checks) - len(missing_required)

    recommended_checks = [
        {
            "key": "udyam_certificate",
            "label": "Udyam certificate",
            "ready": _approved_exists({BusinessComplianceDocumentType.UDYAM_CERTIFICATE}),
        },
        {
            "key": "gst_certificate",
            "label": "GST certificate",
            "ready": _approved_exists({BusinessComplianceDocumentType.GST_CERTIFICATE}),
        },
        {
            "key": "shop_license",
            "label": "Shop / trade license",
            "ready": _approved_exists({BusinessComplianceDocumentType.SHOP_LICENSE}),
        },
    ]
    recommended_missing = [row for row in recommended_checks if not row["ready"]]

    active_documents = BusinessComplianceDocument.objects.filter(is_active=True)
    pending_review_count = _pending_count()
    rejected_count = BusinessComplianceDocumentReviewState.objects.filter(review_status=BusinessComplianceReviewStatus.REJECTED).count()
    expired_count = BusinessComplianceDocumentReviewState.objects.filter(review_status=BusinessComplianceReviewStatus.EXPIRED).count()
    missing_file_count = active_documents.filter(file__isnull=True).count() + active_documents.filter(file="").count()
    public_summary_pending_count = active_documents.filter(
        public_visibility=BusinessComplianceDocumentVisibility.PUBLIC_SUMMARY_ONLY,
        verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
    ).filter(review_state__approved_public_summary=False).count()

    blockers: list[str] = []
    warnings: list[str] = []
    if not active_profile_exists:
        blockers.append("Active business profile is missing.")
    if missing_required:
        blockers.append(f"{len(missing_required)} required business compliance evidence item(s) are missing, unapproved, or missing real files.")
    if missing_file_count:
        blockers.append(f"{missing_file_count} active compliance document row(s) have no evidence file.")
    if recommended_missing:
        warnings.append(f"{len(recommended_missing)} recommended compliance evidence item(s) are missing or not approved.")
    if pending_review_count:
        warnings.append(f"{pending_review_count} compliance document row(s) are pending or under review.")
    if rejected_count:
        warnings.append(f"{rejected_count} compliance document row(s) are rejected and need correction or replacement.")
    if expired_count:
        warnings.append(f"{expired_count} compliance document row(s) are expired/deactivated and preserved for history.")
    if public_summary_pending_count:
        warnings.append(f"{public_summary_pending_count} public summary item(s) need separate approval before public exposure.")

    status = "BLOCKED" if blockers else ("NEEDS_SETUP" if warnings else "READY")

    return {
        "status": status,
        "blockers": blockers,
        "warnings": warnings,
        "route_hint": "/admin/settings/business-compliance",
        "missing_required_count": len(missing_required),
        "pending_review_count": pending_review_count,
        "approved_required_count": approved_required_count,
        "required_count": len(requirement_checks),
        "rejected_count": rejected_count,
        "expired_count": expired_count,
        "missing_file_count": missing_file_count,
        "public_summary_pending_count": public_summary_pending_count,
        "recommended_missing_count": len(recommended_missing),
        "required_checks": requirement_checks,
        "recommended_checks": recommended_checks,
        "templates": list_business_compliance_templates(),
        "privacy_rule": "Private files are never public-downloadable by default. Public pages expose only approved public-safe summaries, never source files.",
    }
