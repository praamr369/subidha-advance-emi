"""Unified KYC intake and review workflow models.

Additive, non-breaking. All FK references to existing models use lazy string
forms where needed to avoid import cycles. CustomerKycDocument remains the
canonical store for customer KYC (preserved for contract gating backward
compat); this module adds the audit trail (KycReviewAction) and the partner
KYC document storage (PartnerKycDocument).

Owner type matrix:
  CUSTOMER  -> subscriptions.CustomerKycDocument  (existing model)
  PARTNER   -> subscriptions.PartnerKycDocument   (this module)
  VENDOR    -> accounting.VendorKycDocument       (accounting/models.py)
  STAFF     -> accounting.StaffKycDocument        (accounting/models.py)
"""
from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


# ---------------------------------------------------------------------------
# Shared enumerations
# ---------------------------------------------------------------------------

class KycOwnerType(models.TextChoices):
    CUSTOMER = "CUSTOMER", "Customer"
    PARTNER = "PARTNER", "Partner"
    VENDOR = "VENDOR", "Vendor"
    STAFF = "STAFF", "Staff"


class KycUploadSource(models.TextChoices):
    ADMIN_UPLOAD = "ADMIN_UPLOAD", "Admin Upload"
    SELF_SERVICE_UPLOAD = "SELF_SERVICE_UPLOAD", "Self-Service Upload"
    CRM_UPLOAD = "CRM_UPLOAD", "CRM Upload"
    SUBSCRIPTION_REGISTRATION = "SUBSCRIPTION_REGISTRATION", "Subscription Registration"


class KycReviewActionType(models.TextChoices):
    SUBMIT = "SUBMIT", "Submitted for Review"
    APPROVE = "APPROVE", "Approved"
    REJECT = "REJECT", "Rejected"
    REQUEST_RESUBMISSION = "REQUEST_RESUBMISSION", "Resubmission Requested"
    EXCEPTION_APPROVE = "EXCEPTION_APPROVE", "Exception Approved (Admin Override)"
    EXPIRE = "EXPIRE", "Expired"
    UPLOAD = "UPLOAD", "Document Uploaded"


# ---------------------------------------------------------------------------
# KycReviewAction – unified audit trail for ALL KYC review decisions
# ---------------------------------------------------------------------------

class KycReviewAction(models.Model):
    """Immutable audit record written for every KYC state transition.

    Works across all owner types. owner_type + owner_id identify the
    party; document_model + document_id identify the specific document (if
    the action applies to a single document rather than the overall KYC
    profile).
    """

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    owner_type = models.CharField(
        max_length=20,
        choices=KycOwnerType.choices,
        db_index=True,
    )
    owner_id = models.PositiveIntegerField(db_index=True)

    document_model = models.CharField(max_length=80, blank=True, default="")
    document_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)

    action = models.CharField(
        max_length=30,
        choices=KycReviewActionType.choices,
        db_index=True,
    )
    old_status = models.CharField(max_length=30, blank=True, default="")
    new_status = models.CharField(max_length=30, blank=True, default="")
    reason = models.TextField(blank=True, default="")

    upload_source = models.CharField(
        max_length=30,
        choices=KycUploadSource.choices,
        blank=True,
        default="",
    )

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="kyc_review_actions",
        null=True,
        blank=True,
    )

    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "kyc_review_actions"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["owner_type", "owner_id", "created_at"]),
            models.Index(fields=["owner_type", "action"]),
            models.Index(fields=["document_model", "document_id"]),
        ]

    def save(self, *args, **kwargs):
        self.reason = (self.reason or "").strip()
        self.document_model = (self.document_model or "").strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"KycReviewAction[{self.owner_type}#{self.owner_id}] "
            f"{self.action} by {self.performed_by_id}"
        )


# ---------------------------------------------------------------------------
# PartnerKycDocument – KYC documents uploaded for a PARTNER user
# ---------------------------------------------------------------------------

def partner_kyc_doc_upload_to(instance, filename: str) -> str:
    extension = Path(filename or "").suffix.lower() or ".bin"
    partner_id = getattr(instance, "partner_user_id", None)
    doc_type = (getattr(instance, "document_type", "") or "KYC").strip().lower()
    token = uuid4().hex[:12]
    identity = f"partner-{partner_id}" if partner_id else "partner"
    return f"partners/kyc/{identity}/{doc_type}-{token}{extension}"


class PartnerKycDocumentStatus(models.TextChoices):
    SUBMITTED = "SUBMITTED", "Submitted"
    PENDING = "PENDING", "Pending Review"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    RESUBMISSION_REQUIRED = "RESUBMISSION_REQUIRED", "Resubmission Required"


class PartnerKycDocumentType(models.TextChoices):
    AADHAAR = "AADHAAR", "Aadhaar Card"
    PAN = "PAN", "PAN Card"
    PASSPORT = "PASSPORT", "Passport"
    DRIVING_LICENSE = "DRIVING_LICENSE", "Driving License"
    VOTER_ID = "VOTER_ID", "Voter ID"
    GST_CERTIFICATE = "GST_CERTIFICATE", "GST Certificate"
    BANK_PROOF = "BANK_PROOF", "Bank Proof"
    OTHER = "OTHER", "Other"


class PartnerKycDocument(models.Model):
    """KYC document uploaded for a partner user (role=PARTNER)."""

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    partner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="partner_kyc_documents",
    )
    document_type = models.CharField(
        max_length=30,
        choices=PartnerKycDocumentType.choices,
        default=PartnerKycDocumentType.OTHER,
        db_index=True,
    )
    category = models.CharField(max_length=30, blank=True, default="", db_index=True)
    document_reference = models.CharField(max_length=80, blank=True, default="")
    file = models.FileField(upload_to=partner_kyc_doc_upload_to)
    original_filename = models.CharField(max_length=255, blank=True, default="")
    content_type = models.CharField(max_length=100, blank=True, default="")
    file_size = models.PositiveBigIntegerField(default=0)
    notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=30,
        choices=PartnerKycDocumentStatus.choices,
        default=PartnerKycDocumentStatus.SUBMITTED,
        db_index=True,
    )
    upload_source = models.CharField(
        max_length=30,
        choices=KycUploadSource.choices,
        default=KycUploadSource.ADMIN_UPLOAD,
        blank=True,
        db_index=True,
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_partner_kyc_documents",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_partner_kyc_documents",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    resubmission_of = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resubmissions",
    )

    class Meta:
        db_table = "partner_kyc_documents"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["partner_user", "status"]),
            models.Index(fields=["partner_user", "document_type"]),
        ]

    def clean(self):
        errors = {}
        if not self.partner_user_id:
            errors["partner_user"] = "Partner user is required."
        if not self.file:
            errors["file"] = "Document file is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.file:
            self.original_filename = (
                self.original_filename or Path(getattr(self.file, "name", "")).name
            )[:255]
            self.file_size = int(getattr(self.file, "size", None) or self.file_size or 0)
            ct = getattr(self.file, "content_type", "") or ""
            if ct:
                self.content_type = ct[:100]
        self.notes = (self.notes or "").strip()
        self.rejection_reason = (self.rejection_reason or "").strip()
        self.document_reference = (self.document_reference or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"PartnerKYC {self.document_type} for user {self.partner_user_id} [{self.status}]"
        )
