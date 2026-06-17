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
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date

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


@transaction.atomic
def admin_approve_customer_kyc_document(*, customer, document, performed_by):
    """Approve a single customer KYC document from the review queue.

    Delegates the actual review to the existing ``customer_service.approve_kyc``
    (the same per-document logic the customer admin panel uses) and additionally
    records a unified ``KycReviewAction`` so the cross-owner audit trail stays
    consistent with partner / vendor / staff. Does not duplicate review logic.
    """
    from subscriptions.services.customer_service import approve_kyc

    old_status = document.status
    approve_kyc(customer, performed_by=performed_by, document_id=document.pk)
    document.refresh_from_db()
    _record_action(
        owner_type=KycOwnerType.CUSTOMER,
        owner_id=customer.pk,
        action=KycReviewActionType.APPROVE,
        performed_by=performed_by,
        old_status=old_status,
        new_status=document.status,
        document_model="CustomerKycDocument",
        document_id=document.pk,
    )
    return document


@transaction.atomic
def admin_reject_customer_kyc_document(*, customer, document, reason: str, performed_by):
    """Reject a single customer KYC document from the review queue.

    Delegates to the existing ``customer_service.reject_kyc`` and records a
    unified ``KycReviewAction``. Reason is mandatory.
    """
    from subscriptions.services.customer_service import reject_kyc

    if not reason or not reason.strip():
        raise ValueError("Rejection reason is required.")
    old_status = document.status
    reject_kyc(customer, reason=reason, performed_by=performed_by, document_id=document.pk)
    document.refresh_from_db()
    _record_action(
        owner_type=KycOwnerType.CUSTOMER,
        owner_id=customer.pk,
        action=KycReviewActionType.REJECT,
        performed_by=performed_by,
        old_status=old_status,
        new_status=document.status,
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


# ---------------------------------------------------------------------------
# CROSS-OWNER REVIEW QUEUE + CRM PARTY KYC COCKPIT
#
# Additive, read-mostly aggregation across the four canonical KYC stores. No
# duplicate document storage is created: rows are projected directly from
# CustomerKycDocument / PartnerKycDocument / VendorKycDocument / StaffKycDocument.
# Review actions delegate to the existing per-owner service functions above.
# ---------------------------------------------------------------------------

# Documents in these statuses are "in the queue" (awaiting an admin decision or
# awaiting owner correction). APPROVED documents are excluded by default.
QUEUE_DEFAULT_STATUSES = [
    "SUBMITTED",
    "PENDING",
    "REJECTED",
    "RESUBMISSION_REQUIRED",
]

# Statuses that still allow an admin to approve from the queue.
_NON_APPROVED = {"SUBMITTED", "PENDING", "REJECTED", "RESUBMISSION_REQUIRED"}


class KycDocumentNotFound(Exception):
    """Raised when a (owner_type, document_id) pair resolves to no document."""


def _identity_customer(customer):
    if not customer:
        return ("", "", "")
    email = ""
    if getattr(customer, "user_id", None):
        email = getattr(customer.user, "email", "") or ""
    return (customer.name or "", customer.phone or "", email)


def _identity_partner(user):
    if not user:
        return ("", "", "")
    name = (user.get_full_name() or "").strip() or user.username
    return (name or "", user.phone or "", user.email or "")


def _identity_vendor(vendor):
    if not vendor:
        return ("", "", "")
    name = (vendor.display_name or "").strip() or (vendor.name or "")
    return (name, vendor.phone or "", vendor.email or "")


def _identity_staff(employee):
    if not employee:
        return ("", "", "")
    return (employee.name or "", employee.phone or "", "")


def _queue_store_configs():
    """Owner-type -> projection config for the four canonical KYC stores."""
    from subscriptions.models import Customer, CustomerKycDocument
    from accounting.models import (
        EmployeeProfile,
        StaffKycDocument,
        Vendor,
        VendorKycDocument,
    )
    from accounts.models import User

    return {
        KycOwnerType.CUSTOMER: {
            "model": CustomerKycDocument,
            "owner_model": Customer,
            "owner_attr": "customer",
            "owner_select": ["customer", "customer__user"],
            "identity": _identity_customer,
            "search_fields": ["customer__name", "customer__phone", "customer__user__email"],
            "download": lambda oid, did: f"/api/v1/admin/customers/{oid}/kyc-documents/{did}/download/",
        },
        KycOwnerType.PARTNER: {
            "model": PartnerKycDocument,
            "owner_model": User,
            "owner_attr": "partner_user",
            "owner_select": ["partner_user"],
            "identity": _identity_partner,
            "search_fields": [
                "partner_user__username",
                "partner_user__first_name",
                "partner_user__last_name",
                "partner_user__phone",
                "partner_user__email",
            ],
            "download": lambda oid, did: f"/api/v1/admin/partners/{oid}/kyc-documents/{did}/download/",
        },
        KycOwnerType.VENDOR: {
            "model": VendorKycDocument,
            "owner_model": Vendor,
            "owner_attr": "vendor",
            "owner_select": ["vendor"],
            "identity": _identity_vendor,
            "search_fields": [
                "vendor__name",
                "vendor__display_name",
                "vendor__phone",
                "vendor__email",
            ],
            "download": lambda oid, did: f"/api/v1/admin/vendors/{oid}/kyc-documents/{did}/download/",
        },
        KycOwnerType.STAFF: {
            "model": StaffKycDocument,
            "owner_model": EmployeeProfile,
            "owner_attr": "employee",
            "owner_select": ["employee"],
            "identity": _identity_staff,
            "search_fields": [
                "employee__name",
                "employee__phone",
                "employee__employee_code",
            ],
            "download": lambda oid, did: f"/api/v1/admin/hr/staff/{oid}/kyc-documents/{did}/download/",
        },
    }


def _allowed_actions(status: str, has_file: bool) -> list:
    actions = []
    if status != "APPROVED":
        actions.append("approve")
    actions.extend(["reject", "request_resubmission"])
    if has_file:
        actions.append("download")
    return actions


def _normalize_queue_row(owner_type: str, doc, cfg) -> dict:
    owner_obj = getattr(doc, cfg["owner_attr"], None)
    owner_id = getattr(doc, f"{cfg['owner_attr']}_id", None)
    name, phone, email = cfg["identity"](owner_obj)
    has_file = bool(getattr(doc, "file", None))
    return {
        "owner_type": owner_type,
        "owner_id": owner_id,
        "owner_name": name,
        "owner_phone": phone,
        "owner_email": email,
        "document_id": doc.pk,
        "document_type": doc.document_type,
        "category": getattr(doc, "category", "") or "",
        "status": doc.status,
        "uploaded_by": getattr(doc.uploaded_by, "username", None) if doc.uploaded_by_id else None,
        "upload_source": getattr(doc, "upload_source", "") or "",
        "uploaded_at": doc.created_at.isoformat() if getattr(doc, "created_at", None) else None,
        "reviewed_by": getattr(doc.reviewed_by, "username", None) if doc.reviewed_by_id else None,
        "reviewed_at": doc.reviewed_at.isoformat() if getattr(doc, "reviewed_at", None) else None,
        "rejection_reason": getattr(doc, "rejection_reason", "") or "",
        "download_url": cfg["download"](owner_id, doc.pk) if has_file else "",
        "allowed_actions": _allowed_actions(doc.status, has_file),
    }


def build_kyc_review_queue(
    *,
    owner_type: str = "",
    status: str = "",
    document_type: str = "",
    category: str = "",
    search: str = "",
    upload_source: str = "",
    date_from: str = "",
    date_to: str = "",
    limit: int = 500,
) -> dict:
    """Aggregate non-approved (by default) KYC documents across all owner types.

    Reads only the canonical stores; never duplicates documents. Returns
    normalized rows plus summary counts. Intended for admin-only callers.
    """
    configs = _queue_store_configs()
    owner_type = (owner_type or "").strip().upper()
    status = (status or "").strip().upper()
    document_type = (document_type or "").strip()
    category = (category or "").strip()
    search = (search or "").strip()
    upload_source = (upload_source or "").strip()
    try:
        limit = max(1, min(int(limit), 1000))
    except (TypeError, ValueError):
        limit = 500
    df = parse_date(date_from) if date_from else None
    dt = parse_date(date_to) if date_to else None

    rows: list = []
    by_status: dict = {}
    by_owner_type: dict = {}
    total = 0

    for owner_key, cfg in configs.items():
        if owner_type and owner_type != owner_key:
            continue
        qs = cfg["model"].objects.all()
        if status:
            qs = qs.filter(status=status)
        else:
            qs = qs.filter(status__in=QUEUE_DEFAULT_STATUSES)
        if document_type:
            qs = qs.filter(document_type=document_type)
        if category:
            qs = qs.filter(category=category)
        if upload_source:
            qs = qs.filter(upload_source=upload_source)
        if search:
            search_q = Q()
            for field in cfg["search_fields"]:
                search_q |= Q(**{f"{field}__icontains": search})
            qs = qs.filter(search_q)
        if df:
            qs = qs.filter(created_at__date__gte=df)
        if dt:
            qs = qs.filter(created_at__date__lte=dt)

        store_count = 0
        for entry in qs.values("status").annotate(c=Count("id")):
            by_status[entry["status"]] = by_status.get(entry["status"], 0) + entry["c"]
            store_count += entry["c"]
        if store_count:
            by_owner_type[owner_key] = store_count
            total += store_count

        select = list(cfg["owner_select"]) + ["uploaded_by", "reviewed_by"]
        for doc in qs.select_related(*select).order_by("-created_at", "-id")[:limit]:
            rows.append(_normalize_queue_row(owner_key, doc, cfg))

    rows.sort(key=lambda r: (r["uploaded_at"] or ""), reverse=True)
    rows = rows[:limit]
    return {
        "count": total,
        "summary": {
            "total": total,
            "by_status": by_status,
            "by_owner_type": by_owner_type,
        },
        "results": rows,
    }


def list_owner_kyc_documents(owner_type: str, owner_id: int) -> dict:
    """Return all KYC documents (every status) for one canonical owner.

    Used by the CRM party cockpit to surface the linked owner's full KYC
    picture. Reuses the same projection as the review queue.
    """
    configs = _queue_store_configs()
    owner_key = (owner_type or "").strip().upper()
    cfg = configs.get(owner_key)
    if not cfg or not owner_id:
        return {"results": [], "summary": {"total": 0, "by_status": {}}}

    qs = cfg["model"].objects.filter(**{f"{cfg['owner_attr']}_id": owner_id})
    select = list(cfg["owner_select"]) + ["uploaded_by", "reviewed_by"]
    rows = [
        _normalize_queue_row(owner_key, doc, cfg)
        for doc in qs.select_related(*select).order_by("-created_at", "-id")
    ]
    by_status: dict = {}
    for row in rows:
        by_status[row["status"]] = by_status.get(row["status"], 0) + 1
    return {"results": rows, "summary": {"total": len(rows), "by_status": by_status}}


def _resolve_owner_identity(owner_type: str, owner_id: int) -> dict:
    configs = _queue_store_configs()
    cfg = configs.get((owner_type or "").strip().upper())
    if not cfg or not owner_id:
        return {"name": "", "phone": "", "email": ""}
    qs = cfg["owner_model"].objects.filter(pk=owner_id)
    # Pull the related user for customer email without an extra query.
    if (owner_type or "").upper() == KycOwnerType.CUSTOMER:
        qs = qs.select_related("user")
    owner_obj = qs.first()
    name, phone, email = cfg["identity"](owner_obj)
    return {"name": name, "phone": phone, "email": email}


# ---------------------------------------------------------------------------
# Queue review-action dispatch (delegates to existing per-owner service code)
# ---------------------------------------------------------------------------

def _resolve_queue_document(owner_type: str, document_id: int):
    """Return (owner, document) for a (owner_type, document_id) pair."""
    ot = (owner_type or "").strip().upper()
    if ot == KycOwnerType.CUSTOMER:
        from subscriptions.models import CustomerKycDocument

        doc = CustomerKycDocument.objects.select_related("customer").filter(pk=document_id).first()
        if doc:
            return doc.customer, doc
    elif ot == KycOwnerType.PARTNER:
        doc = PartnerKycDocument.objects.select_related("partner_user").filter(pk=document_id).first()
        if doc:
            return doc.partner_user, doc
    elif ot == KycOwnerType.VENDOR:
        from accounting.models import VendorKycDocument

        doc = VendorKycDocument.objects.select_related("vendor").filter(pk=document_id).first()
        if doc:
            return doc.vendor, doc
    elif ot == KycOwnerType.STAFF:
        from accounting.models import StaffKycDocument

        doc = StaffKycDocument.objects.select_related("employee").filter(pk=document_id).first()
        if doc:
            return doc.employee, doc
    else:
        raise ValueError(f"Unknown KYC owner type: {owner_type}")
    raise KycDocumentNotFound(f"{ot} KYC document {document_id} not found.")


def queue_approve_kyc_document(*, owner_type: str, document_id: int, performed_by):
    owner, doc = _resolve_queue_document(owner_type, document_id)
    ot = owner_type.strip().upper()
    if ot == KycOwnerType.CUSTOMER:
        return admin_approve_customer_kyc_document(customer=owner, document=doc, performed_by=performed_by)
    if ot == KycOwnerType.PARTNER:
        return admin_approve_partner_kyc_document(partner_user=owner, document=doc, performed_by=performed_by)
    if ot == KycOwnerType.VENDOR:
        return admin_approve_vendor_kyc_document(vendor=owner, document=doc, performed_by=performed_by)
    return admin_approve_staff_kyc_document(employee=owner, document=doc, performed_by=performed_by)


def queue_reject_kyc_document(*, owner_type: str, document_id: int, reason: str, performed_by):
    owner, doc = _resolve_queue_document(owner_type, document_id)
    ot = owner_type.strip().upper()
    if ot == KycOwnerType.CUSTOMER:
        return admin_reject_customer_kyc_document(customer=owner, document=doc, reason=reason, performed_by=performed_by)
    if ot == KycOwnerType.PARTNER:
        return admin_reject_partner_kyc_document(partner_user=owner, document=doc, reason=reason, performed_by=performed_by)
    if ot == KycOwnerType.VENDOR:
        return admin_reject_vendor_kyc_document(vendor=owner, document=doc, reason=reason, performed_by=performed_by)
    return admin_reject_staff_kyc_document(employee=owner, document=doc, reason=reason, performed_by=performed_by)


def queue_request_kyc_resubmission(*, owner_type: str, document_id: int, reason: str, performed_by):
    owner, doc = _resolve_queue_document(owner_type, document_id)
    ot = owner_type.strip().upper()
    if ot == KycOwnerType.CUSTOMER:
        return admin_request_customer_kyc_resubmission(customer=owner, document=doc, reason=reason, performed_by=performed_by)
    if ot == KycOwnerType.PARTNER:
        return admin_request_partner_kyc_resubmission(partner_user=owner, document=doc, reason=reason, performed_by=performed_by)
    if ot == KycOwnerType.VENDOR:
        return admin_request_vendor_kyc_resubmission(vendor=owner, document=doc, reason=reason, performed_by=performed_by)
    return admin_request_staff_kyc_resubmission(employee=owner, document=doc, reason=reason, performed_by=performed_by)


# ---------------------------------------------------------------------------
# CRM Party -> canonical KYC owner resolution
# ---------------------------------------------------------------------------

_PARTY_ROLE_TO_OWNER = {
    "CUSTOMER": KycOwnerType.CUSTOMER,
    "PARTNER": KycOwnerType.PARTNER,
    "VENDOR": KycOwnerType.VENDOR,
    "STAFF": KycOwnerType.STAFF,
}

PARTY_KYC_UNAVAILABLE_REASON = (
    "Party must be converted/linked to a customer, partner, vendor, or staff "
    "profile before KYC documents can be attached."
)


def get_party_kyc_readiness(party) -> dict:
    """Resolve a CRM ``PartyMaster`` to its linked canonical KYC owner.

    For a linked party (customer/partner/vendor/staff) returns the owner's
    existing KYC documents and readiness. For an unconverted lead/contact
    returns a controlled ``kyc_available: False`` response. Never creates a
    separate party KYC document store.
    """
    links = list(party.links.all())
    owner_links = [link for link in links if link.role_type in _PARTY_ROLE_TO_OWNER]
    # Prefer a primary link, then the most recently created link.
    owner_links.sort(key=lambda link: (0 if link.is_primary else 1, -link.pk))

    linked_owners = [
        {
            "role_type": link.role_type,
            "owner_type": _PARTY_ROLE_TO_OWNER[link.role_type],
            "owner_id": link.source_pk,
            "is_primary": link.is_primary,
        }
        for link in owner_links
    ]

    if not owner_links:
        return {
            "kyc_available": False,
            "reason": PARTY_KYC_UNAVAILABLE_REASON,
            "party_id": party.pk,
            "party_no": party.party_no,
            "display_name": party.display_name,
            "linked_owners": [],
        }

    chosen = owner_links[0]
    owner_type = _PARTY_ROLE_TO_OWNER[chosen.role_type]
    owner_id = chosen.source_pk
    documents = list_owner_kyc_documents(owner_type, owner_id)
    identity = _resolve_owner_identity(owner_type, owner_id)
    return {
        "kyc_available": True,
        "party_id": party.pk,
        "party_no": party.party_no,
        "display_name": party.display_name,
        "owner_type": owner_type,
        "owner_id": owner_id,
        "owner_name": identity["name"],
        "owner_phone": identity["phone"],
        "owner_email": identity["email"],
        "documents": documents["results"],
        "summary": documents["summary"],
        "linked_owners": linked_owners,
    }
