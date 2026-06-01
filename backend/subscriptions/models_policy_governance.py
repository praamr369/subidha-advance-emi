from django.conf import settings
from django.db import models

from subscriptions.models_business_setup import BusinessSetupTimeStampedModel, PolicyPage

POLICY_STATUS_CHOICES = (
    ("DRAFT", "Draft"),
    ("UNDER_REVIEW", "Under Review"),
    ("APPROVED", "Approved"),
    ("PUBLISHED", "Published"),
    ("ARCHIVED", "Archived"),
)


class PolicyVisibility(models.TextChoices):
    PUBLIC = "PUBLIC", "Public"
    INTERNAL = "INTERNAL", "Internal"


class PolicyGovernanceMetadata(BusinessSetupTimeStampedModel):
    """Additive PG-2B stored governance metadata for PolicyPage.

    Kept separate from the existing PolicyPage table so existing policy rows,
    URLs, content, and publication behavior remain backward-compatible.
    """

    policy = models.OneToOneField(
        PolicyPage,
        on_delete=models.CASCADE,
        related_name="governance_metadata",
    )
    visibility = models.CharField(max_length=16, choices=PolicyVisibility.choices, default=PolicyVisibility.PUBLIC, db_index=True)
    governance_category = models.CharField(max_length=80, blank=True, default="", db_index=True)
    coverage_group = models.CharField(max_length=120, blank=True, default="", db_index=True)
    requires_legal_review = models.BooleanField(default=True)
    requires_admin_acceptance = models.BooleanField(default=False)

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="owned_policy_governance_records", null=True, blank=True)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="reviewed_policy_governance_records", null=True, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="approved_policy_governance_records", null=True, blank=True)
    archived_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="archived_policy_governance_records", null=True, blank=True)
    internal_accepted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="accepted_internal_policy_governance_records", null=True, blank=True)

    submitted_for_review_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    review_due_date = models.DateField(null=True, blank=True, db_index=True)
    internal_acceptance_at = models.DateTimeField(null=True, blank=True)

    rejection_reason = models.TextField(blank=True, default="")
    archive_reason = models.TextField(blank=True, default="")
    source_template_key = models.CharField(max_length=120, blank=True, default="", db_index=True)

    class Meta:
        db_table = "policy_governance_metadata"
        ordering = ["policy__slug", "-policy__version", "-id"]
        indexes = [
            models.Index(fields=["visibility", "governance_category"], name="policy_gov_visibility_cat_idx"),
            models.Index(fields=["coverage_group", "visibility"], name="policy_gov_group_vis_idx"),
        ]

    def save(self, *args, **kwargs):
        self.governance_category = (self.governance_category or "").strip()
        self.coverage_group = (self.coverage_group or "").strip()
        self.rejection_reason = (self.rejection_reason or "").strip()
        self.archive_reason = (self.archive_reason or "").strip()
        self.source_template_key = (self.source_template_key or "").strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.policy.slug} v{self.policy.version} [{self.visibility}]"


# PG-2B runtime compatibility: PolicyPage remains the source row, but the
# allowed lifecycle statuses are extended additively. The companion migration
# updates the migration state/field definition.
PolicyPage._meta.get_field("status").choices = POLICY_STATUS_CHOICES
