from django.conf import settings
from django.db import models

from subscriptions.models_business_setup import BusinessComplianceDocument, BusinessSetupTimeStampedModel


class BusinessComplianceReviewStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    EXPIRED = "EXPIRED", "Expired"


class BusinessComplianceDocumentReviewState(BusinessSetupTimeStampedModel):
    """
    Additive BC-2 review workflow state for BusinessComplianceDocument.

    Kept in a separate table so existing compliance document rows, file storage,
    and BC-1 API compatibility remain intact. The source document remains the
    evidence record; this row stores workflow/audit control state only.
    """

    document = models.OneToOneField(
        BusinessComplianceDocument,
        on_delete=models.CASCADE,
        related_name="review_state",
    )
    review_status = models.CharField(
        max_length=20,
        choices=BusinessComplianceReviewStatus.choices,
        default=BusinessComplianceReviewStatus.PENDING,
        db_index=True,
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejected_reason = models.TextField(blank=True, default="")
    expires_at = models.DateField(null=True, blank=True, db_index=True)

    approved_public_summary = models.BooleanField(default=False, db_index=True)
    public_summary_approved_at = models.DateTimeField(null=True, blank=True)
    public_summary_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="approved_business_compliance_public_summaries",
        null=True,
        blank=True,
    )

    source_template_key = models.CharField(max_length=80, blank=True, default="", db_index=True)
    evidence_uploaded_at = models.DateTimeField(null=True, blank=True)
    last_action_reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = "business_compliance_document_review_states"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["review_status", "approved_public_summary"], name="bc_doc_review_status_pub_idx"),
            models.Index(fields=["expires_at", "review_status"], name="bc_doc_review_expiry_idx"),
        ]

    def save(self, *args, **kwargs):
        self.rejected_reason = (self.rejected_reason or "").strip()
        self.source_template_key = (self.source_template_key or "").strip().lower()
        self.last_action_reason = (self.last_action_reason or "").strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.document_id} [{self.review_status}]"
