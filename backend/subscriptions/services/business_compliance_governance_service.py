from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db import transaction

from subscriptions.models import AuditLog
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
    if not document.is_active:
        return "EXPIRED"
    if document.verification_status == BusinessComplianceDocumentVerificationStatus.VERIFIED:
        return "APPROVED"
    if document.verification_status == BusinessComplianceDocumentVerificationStatus.REJECTED:
        return "REJECTED"
    if document.verification_status == BusinessComplianceDocumentVerificationStatus.NOT_PROVIDED:
        return "NOT_PROVIDED"
    return "PENDING"


def is_publicly_downloadable(document: BusinessComplianceDocument) -> bool:
    return False


def _approved_exists(document_types: set[str]) -> bool:
    return BusinessComplianceDocument.objects.filter(
        document_type__in=document_types,
        verification_status=BusinessComplianceDocumentVerificationStatus.VERIFIED,
        is_active=True,
    ).exists()


def _pending_count() -> int:
    return BusinessComplianceDocument.objects.filter(
        verification_status=BusinessComplianceDocumentVerificationStatus.PENDING,
        is_active=True,
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
    pending_review_count = _pending_count()

    blockers: list[str] = []
    warnings: list[str] = []
    if not active_profile_exists:
        blockers.append("Active business profile is missing.")
    if missing_required:
        blockers.append(f"{len(missing_required)} required business compliance evidence item(s) are missing or not approved.")
    if recommended_missing:
        warnings.append(f"{len(recommended_missing)} recommended compliance evidence item(s) are missing or not approved.")
    if pending_review_count:
        warnings.append(f"{pending_review_count} compliance document row(s) are pending review.")

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
        "recommended_missing_count": len(recommended_missing),
        "required_checks": requirement_checks,
        "recommended_checks": recommended_checks,
        "templates": list_business_compliance_templates(),
        "privacy_rule": "Private files are never public-downloadable by default. Public pages expose only verified public-safe summaries.",
    }
