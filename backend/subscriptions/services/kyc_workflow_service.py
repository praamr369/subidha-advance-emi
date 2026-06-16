"""Unified KYC intake and review workflow service.

Additive. Does NOT touch EMI calculation, payment posting, receipt
generation, journal logic, or reconciliation. Reads and writes only
KYC-specific models. The existing customer contract gating
(get_contract_kyc_readiness / enforce_contract_kyc_gate) remains
unchanged and continues reading CustomerKycDocument.

Owner type routing:
  CUSTOMER -> subscriptions.CustomerKycDocument (existing model, preserved)
  PARTNER  -> subscriptions.PartnerKycDocument   (new)
  VENDOR   -> accounting.VendorKycDocument        (new)
  STAFF    -> accounting.StaffKycDocument         (new)
"""
from __future__ import annotations

from typing import Optional

from django.db import transaction
from django.utils import timezone

from subscriptions.models_kyc_workflow import (
    KycOwnerType,
    KycReviewAction,
    KycReviewActionType,
    KycUploadSource,
    PartnerKycDocument,
    PartnerKycDocumentStatus,
)

# ---------------------------------------------------------------------------
# Allowed file types (shared policy)
# ---------------------------------------------------------------------------
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "application/pdf"}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def _validate_file(file):
    """Raise ValueError for disallowed type or size."""
    ct = (getattr(file, "content_type", "") or "").lower()
    if ct not in ALLOWED_CONTENT_TYPES:
        raise ValueError("Unsupported file type. Allowed: JPG, PNG, PDF.")
    size = int(getattr(file, "size", 0) or 0)
    if size <= 0:
        raise ValueError("Uploaded file is empty.")
    if size > MAX_FILE_SIZE_BYTES:
        raise ValueError("File must be 5 MB or smaller.")


def _mask_reference(reference: str) -> str:
    """Return masked version – last 4 chars visible, rest replaced by *."""
    if not reference or len(reference) <= 4:
        return reference or ""
    return "*" * (len(reference) - 4) + reference[-4:]


# ---------------------------------------------------------------------------
# KycReviewAction writer (shared)
# ---------------------------------------------------------------------------

def _record_action(
    *,
    owner_type: str,
    owner_id: int,
    action: str,
    performed_by,
    old_status: str = "",
    new_status: str = "",
    reason: str = "",
    upload_source: str = "",
    document_model: str = "",
    document_id: Optional[int] = None,
    metadata: Optional[dict] = None,
) -> KycReviewAction:
    return KycReviewAction.objects.create(
        owner_type=owner_type,
        owner_id=owner_id,
        action=action,
        performed_by=performed_by,
        old_status=old_status,
        new_status=new_status,
        reason=(reason or "").strip(),
        upload_source=upload_source or "",
        document_model=document_model or "",
        document_id=document_id,
        metadata=metadata or {},
    )


# ---------------------------------------------------------------------------
# CUSTOMER KYC – admin upload (new entry point alongside existing self-service)
# ---------------------------------------------------------------------------

@transaction.atomic
def admin_upload_customer_kyc(
    *,
    customer,
    file,
    document_type: str,
    category: str = "",
    notes: str = "",
    document_reference: str = "",
    performed_by,
    upload_source: str = KycUploadSource.ADMIN_UPLOAD,
) -> "CustomerKycDocument":
    from subscriptions.models import (
        Customer,
        CustomerKycDocument,
        CustomerKycDocumentStatus,
        CustomerKycDocumentType,
        KycDocumentCategory,
        KycStatus,
    )

    _validate_file(file)
    doc = CustomerKycDocument(
        customer=customer,
        document_type=document_type or CustomerKycDocumentType.OTHER,
        category=category or KycDocumentCategory.UNSPECIFIED,
        file=file,
        notes=(notes or "").strip(),
        status=CustomerKycDocumentStatus.SUBMITTED,
        uploaded_by=performed_by,
        upload_source=upload_source,
    )
    doc.save()

    if customer.kyc_status not in (
        KycStatus.APPROVED,
        KycStatus.VERIFIED,
        KycStatus.EXCEPTION_APPROVED,
    ):
        old_status = customer.kyc_status
        customer.kyc_status = KycStatus.SUBMITTED
        customer.save(update_fields=["kyc_status"])
        _record_action(
            owner_type=KycOwnerType.CUSTOMER,
            owner_id=customer.pk,
            action=KycReviewActionType.UPLOAD,
            performed_by=performed_by,
            old_status=old_status,
            new_status=KycStatus.SUBMITTED,
            upload_source=upload_source,
            document_model="CustomerKycDocument",
            document_id=doc.pk,
        )
    return doc


@transaction.atomic
def admin_request_customer_kyc_resubmission(
    *,
    customer,
    document,
    reason: str,
    performed_by,
) -> "CustomerKycDocument":
    from subscriptions.models import CustomerKycDocument, CustomerKycDocumentStatus

    if not reason or not reason.strip():
        raise ValueError("A reason is required when requesting resubmission.")

    old_status = document.status
    document.status = CustomerKycDocumentStatus.RESUBMISSION_REQUIRED
    document.rejection_reason = reason.strip()
    document.reviewed_by = performed_by
    document.reviewed_at = timezone.now()
    document.save(
        update_fields=["status", "rejection_reason", "reviewed_by", "reviewed_at"]
    )
    _record_action(
        owner_type=KycOwnerType.CUSTOMER,
        owner_id=customer.pk,
        action=KycReviewActionType.REQUEST_RESUBMISSION,
        performed_by=performed_by,
        old_status=old_status,
        new_status=CustomerKycDocumentStatus.RESUBMISSION_REQUIRED,
        reason=reason,
        document_model="CustomerKycDocument",
        document_id=document.pk,
    )
    return document


# ---------------------------------------------------------------------------
# PARTNER KYC
# ---------------------------------------------------------------------------

@transaction.atomic
def admin_upload_partner_kyc(
    *,
    partner_user,
    file,
    document_type: str,
    category: str = "",
    notes: str = "",
    document_reference: str = "",
    performed_by,
    upload_source: str = KycUploadSource.ADMIN_UPLOAD,
) -> PartnerKycDocument:
    _validate_file(file)
    doc = PartnerKycDocument(
        partner_user=partner_user,
        document_type=document_type or "OTHER",
        category=category or "",
        file=file,
        notes=(notes or "").strip(),
        document_reference=(document_reference or "").strip(),
        status=PartnerKycDocumentStatus.SUBMITTED,
        uploaded_by=performed_by,
        upload_source=upload_source,
    )
    doc.save()
    _record_action(
        owner_type=KycOwnerType.PARTNER,
        owner_id=partner_user.pk,
        action=KycReviewActionType.UPLOAD,
        performed_by=performed_by,
        old_status="",
        new_status=PartnerKycDocumentStatus.SUBMITTED,
        upload_source=upload_source,
        document_model="PartnerKycDocument",
        document_id=doc.pk,
    )
    return doc


@transaction.atomic
def partner_self_upload_kyc(
    *,
    partner_user,
    file,
    document_type: str,
    category: str = "",
    notes: str = "",
    resubmission_of_id: Optional[int] = None,
) -> PartnerKycDocument:
    """Self-service upload by the partner user. Never auto-approves."""
    _validate_file(file)
    resubmission_of = None
    if resubmission_of_id:
        resubmission_of = PartnerKycDocument.objects.filter(
            pk=resubmission_of_id, partner_user=partner_user
        ).first()

    doc = PartnerKycDocument(
        partner_user=partner_user,
        document_type=document_type or "OTHER",
        category=category or "",
        file=file,
        notes=(notes or "").strip(),
        status=PartnerKycDocumentStatus.SUBMITTED,
        uploaded_by=partner_user,
        upload_source=KycUploadSource.SELF_SERVICE_UPLOAD,
        resubmission_of=resubmission_of,
    )
    doc.save()
    _record_action(
        owner_type=KycOwnerType.PARTNER,
        owner_id=partner_user.pk,
        action=KycReviewActionType.UPLOAD,
        performed_by=partner_user,
        old_status="",
        new_status=PartnerKycDocumentStatus.SUBMITTED,
        upload_source=KycUploadSource.SELF_SERVICE_UPLOAD,
        document_model="PartnerKycDocument",
        document_id=doc.pk,
    )
    return doc


@transaction.atomic
def admin_approve_partner_kyc_document(
    *,
    partner_user,
    document: PartnerKycDocument,
    performed_by,
) -> PartnerKycDocument:
    old_status = document.status
    document.status = PartnerKycDocumentStatus.APPROVED
    document.reviewed_by = performed_by
    document.reviewed_at = timezone.now()
    document.rejection_reason = ""
    document.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])
    _record_action(
        owner_type=KycOwnerType.PARTNER,
        owner_id=partner_user.pk,
        action=KycReviewActionType.APPROVE,
        performed_by=performed_by,
        old_status=old_status,
        new_status=PartnerKycDocumentStatus.APPROVED,
        document_model="PartnerKycDocument",
        document_id=document.pk,
    )
    return document


@transaction.atomic
def admin_reject_partner_kyc_document(
    *,
    partner_user,
    document: PartnerKycDocument,
    reason: str,
    performed_by,
) -> PartnerKycDocument:
    if not reason or not reason.strip():
        raise ValueError("Rejection reason is required.")
    old_status = document.status
    document.status = PartnerKycDocumentStatus.REJECTED
    document.reviewed_by = performed_by
    document.reviewed_at = timezone.now()
    document.rejection_reason = reason.strip()
    document.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])
    _record_action(
        owner_type=KycOwnerType.PARTNER,
        owner_id=partner_user.pk,
        action=KycReviewActionType.REJECT,
        performed_by=performed_by,
        old_status=old_status,
        new_status=PartnerKycDocumentStatus.REJECTED,
        reason=reason,
        document_model="PartnerKycDocument",
        document_id=document.pk,
    )
    return document


@transaction.atomic
def admin_request_partner_kyc_resubmission(
    *,
    partner_user,
    document: PartnerKycDocument,
    reason: str,
    performed_by,
) -> PartnerKycDocument:
    if not reason or not reason.strip():
        raise ValueError("A reason is required when requesting resubmission.")
    old_status = document.status
    document.status = PartnerKycDocumentStatus.RESUBMISSION_REQUIRED
    document.reviewed_by = performed_by
    document.reviewed_at = timezone.now()
    document.rejection_reason = reason.strip()
    document.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])
    _record_action(
        owner_type=KycOwnerType.PARTNER,
        owner_id=partner_user.pk,
        action=KycReviewActionType.REQUEST_RESUBMISSION,
        performed_by=performed_by,
        old_status=old_status,
        new_status=PartnerKycDocumentStatus.RESUBMISSION_REQUIRED,
        reason=reason,
        document_model="PartnerKycDocument",
        document_id=document.pk,
    )
    return document


# ---------------------------------------------------------------------------
# VENDOR KYC
# ---------------------------------------------------------------------------

@transaction.atomic
def admin_upload_vendor_kyc(
    *,
    vendor,
    file,
    document_type: str,
    category: str = "",
    notes: str = "",
    document_reference: str = "",
    performed_by,
    upload_source: str = KycUploadSource.ADMIN_UPLOAD,
):
    from accounting.models import VendorKycDocument, KycDocumentGenericStatus

    _validate_file(file)
    doc = VendorKycDocument(
        vendor=vendor,
        document_type=document_type or "OTHER",
        category=category or "",
        file=file,
        notes=(notes or "").strip(),
        document_reference=(document_reference or "").strip(),
        status=KycDocumentGenericStatus.SUBMITTED,
        uploaded_by=performed_by,
        upload_source=upload_source,
    )
    doc.save()
    _record_action(
        owner_type=KycOwnerType.VENDOR,
        owner_id=vendor.pk,
        action=KycReviewActionType.UPLOAD,
        performed_by=performed_by,
        old_status="",
        new_status=KycDocumentGenericStatus.SUBMITTED,
        upload_source=upload_source,
        document_model="VendorKycDocument",
        document_id=doc.pk,
    )
    return doc


@transaction.atomic
def vendor_self_upload_kyc(
    *,
    vendor,
    file,
    document_type: str,
    category: str = "",
    notes: str = "",
    performed_by,
    resubmission_of_id: Optional[int] = None,
):
    """Self-service upload by a vendor portal user. Never auto-approves.

    ``performed_by`` is the logged-in vendor user (Vendor.linked_user); it is
    recorded as the uploader and audit actor. Status is always SUBMITTED.
    """
    from accounting.models import VendorKycDocument, KycDocumentGenericStatus

    _validate_file(file)
    resubmission_of = None
    if resubmission_of_id:
        resubmission_of = VendorKycDocument.objects.filter(
            pk=resubmission_of_id, vendor=vendor
        ).first()

    doc = VendorKycDocument(
        vendor=vendor,
        document_type=document_type or "OTHER",
        category=category or "",
        file=file,
        notes=(notes or "").strip(),
        status=KycDocumentGenericStatus.SUBMITTED,
        uploaded_by=performed_by,
        upload_source=KycUploadSource.SELF_SERVICE_UPLOAD,
        resubmission_of=resubmission_of,
    )
    doc.save()
    _record_action(
        owner_type=KycOwnerType.VENDOR,
        owner_id=vendor.pk,
        action=KycReviewActionType.UPLOAD,
        performed_by=performed_by,
        old_status="",
        new_status=KycDocumentGenericStatus.SUBMITTED,
        upload_source=KycUploadSource.SELF_SERVICE_UPLOAD,
        document_model="VendorKycDocument",
        document_id=doc.pk,
    )
    return doc


@transaction.atomic
def admin_approve_vendor_kyc_document(*, vendor, document, performed_by):
    from accounting.models import KycDocumentGenericStatus

    old_status = document.status
    document.status = KycDocumentGenericStatus.APPROVED
    document.reviewed_by = performed_by
    document.reviewed_at = timezone.now()
    document.rejection_reason = ""
    document.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])
    _record_action(
        owner_type=KycOwnerType.VENDOR,
        owner_id=vendor.pk,
        action=KycReviewActionType.APPROVE,
        performed_by=performed_by,
        old_status=old_status,
        new_status=KycDocumentGenericStatus.APPROVED,
        document_model="VendorKycDocument",
        document_id=document.pk,
    )
    return document


@transaction.atomic
def admin_reject_vendor_kyc_document(*, vendor, document, reason: str, performed_by):
    from accounting.models import KycDocumentGenericStatus

    if not reason or not reason.strip():
        raise ValueError("Rejection reason is required.")
    old_status = document.status
    document.status = KycDocumentGenericStatus.REJECTED
    document.reviewed_by = performed_by
    document.reviewed_at = timezone.now()
    document.rejection_reason = reason.strip()
    document.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])
    _record_action(
        owner_type=KycOwnerType.VENDOR,
        owner_id=vendor.pk,
        action=KycReviewActionType.REJECT,
        performed_by=performed_by,
        old_status=old_status,
        new_status=KycDocumentGenericStatus.REJECTED,
        reason=reason,
        document_model="VendorKycDocument",
        document_id=document.pk,
    )
    return document


@transaction.atomic
def admin_request_vendor_kyc_resubmission(*, vendor, document, reason: str, performed_by):
    from accounting.models import KycDocumentGenericStatus

    if not reason or not reason.strip():
        raise ValueError("A reason is required when requesting resubmission.")
    old_status = document.status
    document.status = KycDocumentGenericStatus.RESUBMISSION_REQUIRED
    document.reviewed_by = performed_by
    document.reviewed_at = timezone.now()
    document.rejection_reason = reason.strip()
    document.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])
    _record_action(
        owner_type=KycOwnerType.VENDOR,
        owner_id=vendor.pk,
        action=KycReviewActionType.REQUEST_RESUBMISSION,
        performed_by=performed_by,
        old_status=old_status,
        new_status=KycDocumentGenericStatus.RESUBMISSION_REQUIRED,
        reason=reason,
        document_model="VendorKycDocument",
        document_id=document.pk,
    )
    return document


# ---------------------------------------------------------------------------
# STAFF KYC
# ---------------------------------------------------------------------------

@transaction.atomic
def admin_upload_staff_kyc(
    *,
    employee,
    file,
    document_type: str,
    category: str = "",
    notes: str = "",
    document_reference: str = "",
    performed_by,
    upload_source: str = KycUploadSource.ADMIN_UPLOAD,
):
    from accounting.models import StaffKycDocument, KycDocumentGenericStatus

    _validate_file(file)
    doc = StaffKycDocument(
        employee=employee,
        document_type=document_type or "OTHER",
        category=category or "",
        file=file,
        notes=(notes or "").strip(),
        document_reference=(document_reference or "").strip(),
        status=KycDocumentGenericStatus.SUBMITTED,
        uploaded_by=performed_by,
        upload_source=upload_source,
    )
    doc.save()
    _record_action(
        owner_type=KycOwnerType.STAFF,
        owner_id=employee.pk,
        action=KycReviewActionType.UPLOAD,
        performed_by=performed_by,
        old_status="",
        new_status=KycDocumentGenericStatus.SUBMITTED,
        upload_source=upload_source,
        document_model="StaffKycDocument",
        document_id=doc.pk,
    )
    return doc


@transaction.atomic
def staff_self_upload_kyc(
    *,
    employee,
    file,
    document_type: str,
    category: str = "",
    notes: str = "",
    performed_by,
    resubmission_of_id: Optional[int] = None,
):
    """Self-service upload by a staff portal user. Never auto-approves.

    ``performed_by`` is the logged-in staff user (StaffIdentity.user); it is
    recorded as the uploader and audit actor. Status is always SUBMITTED.
    """
    from accounting.models import StaffKycDocument, KycDocumentGenericStatus

    _validate_file(file)
    resubmission_of = None
    if resubmission_of_id:
        resubmission_of = StaffKycDocument.objects.filter(
            pk=resubmission_of_id, employee=employee
        ).first()

    doc = StaffKycDocument(
        employee=employee,
        document_type=document_type or "OTHER",
        category=category or "",
        file=file,
        notes=(notes or "").strip(),
        status=KycDocumentGenericStatus.SUBMITTED,
        uploaded_by=performed_by,
        upload_source=KycUploadSource.SELF_SERVICE_UPLOAD,
        resubmission_of=resubmission_of,
    )
    doc.save()
    _record_action(
        owner_type=KycOwnerType.STAFF,
        owner_id=employee.pk,
        action=KycReviewActionType.UPLOAD,
        performed_by=performed_by,
        old_status="",
        new_status=KycDocumentGenericStatus.SUBMITTED,
        upload_source=KycUploadSource.SELF_SERVICE_UPLOAD,
        document_model="StaffKycDocument",
        document_id=doc.pk,
    )
    return doc


@transaction.atomic
def admin_approve_staff_kyc_document(*, employee, document, performed_by):
    from accounting.models import KycDocumentGenericStatus

    old_status = document.status
    document.status = KycDocumentGenericStatus.APPROVED
    document.reviewed_by = performed_by
    document.reviewed_at = timezone.now()
    document.rejection_reason = ""
    document.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])
    _record_action(
        owner_type=KycOwnerType.STAFF,
        owner_id=employee.pk,
        action=KycReviewActionType.APPROVE,
        performed_by=performed_by,
        old_status=old_status,
        new_status=KycDocumentGenericStatus.APPROVED,
        document_model="StaffKycDocument",
        document_id=document.pk,
    )
    return document


@transaction.atomic
def admin_reject_staff_kyc_document(*, employee, document, reason: str, performed_by):
    from accounting.models import KycDocumentGenericStatus

    if not reason or not reason.strip():
        raise ValueError("Rejection reason is required.")
    old_status = document.status
    document.status = KycDocumentGenericStatus.REJECTED
    document.reviewed_by = performed_by
    document.reviewed_at = timezone.now()
    document.rejection_reason = reason.strip()
    document.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])
    _record_action(
        owner_type=KycOwnerType.STAFF,
        owner_id=employee.pk,
        action=KycReviewActionType.REJECT,
        performed_by=performed_by,
        old_status=old_status,
        new_status=KycDocumentGenericStatus.REJECTED,
        reason=reason,
        document_model="StaffKycDocument",
        document_id=document.pk,
    )
    return document


@transaction.atomic
def admin_request_staff_kyc_resubmission(*, employee, document, reason: str, performed_by):
    from accounting.models import KycDocumentGenericStatus

    if not reason or not reason.strip():
        raise ValueError("A reason is required when requesting resubmission.")
    old_status = document.status
    document.status = KycDocumentGenericStatus.RESUBMISSION_REQUIRED
    document.reviewed_by = performed_by
    document.reviewed_at = timezone.now()
    document.rejection_reason = reason.strip()
    document.save(update_fields=["status", "reviewed_by", "reviewed_at", "rejection_reason"])
    _record_action(
        owner_type=KycOwnerType.STAFF,
        owner_id=employee.pk,
        action=KycReviewActionType.REQUEST_RESUBMISSION,
        performed_by=performed_by,
        old_status=old_status,
        new_status=KycDocumentGenericStatus.RESUBMISSION_REQUIRED,
        reason=reason,
        document_model="StaffKycDocument",
        document_id=document.pk,
    )
    return document


# ---------------------------------------------------------------------------
# Audit trail reader (generic)
# ---------------------------------------------------------------------------

def get_kyc_audit_trail(owner_type: str, owner_id: int) -> list:
    """Return serialisable list of all KYC review actions for an owner."""
    actions = (
        KycReviewAction.objects.filter(owner_type=owner_type, owner_id=owner_id)
        .select_related("performed_by")
        .order_by("-created_at")
    )
    return [
        {
            "id": a.pk,
            "action": a.action,
            "old_status": a.old_status,
            "new_status": a.new_status,
            "reason": a.reason,
            "upload_source": a.upload_source,
            "document_model": a.document_model,
            "document_id": a.document_id,
            "performed_by": getattr(a.performed_by, "username", None) if a.performed_by_id else None,
            "performed_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in actions
    ]
