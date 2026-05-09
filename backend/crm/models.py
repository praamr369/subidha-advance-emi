from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


def generate_party_no() -> str:
    return f"PTY-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"


class CrmTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class PartyKind(models.TextChoices):
    PERSON = "PERSON", "Person"
    ORGANIZATION = "ORGANIZATION", "Organization"
    HOUSEHOLD = "HOUSEHOLD", "Household"
    UNKNOWN = "UNKNOWN", "Unknown"


class PartyLinkRole(models.TextChoices):
    LEAD = "LEAD", "Lead"
    CUSTOMER = "CUSTOMER", "Customer"
    PARTNER = "PARTNER", "Partner"
    VENDOR = "VENDOR", "Vendor"
    STAFF = "STAFF", "Staff"


class PartyInteractionType(models.TextChoices):
    GENERAL = "GENERAL", "General"
    CONTACT_NOTE = "CONTACT_NOTE", "Contact Note"
    FOLLOW_UP = "FOLLOW_UP", "Follow Up"
    HANDOFF = "HANDOFF", "Handoff"


class PartyInteractionStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    DONE = "DONE", "Done"
    CANCELLED = "CANCELLED", "Cancelled"


class LeadPlanType(models.TextChoices):
    LUCKY_PLAN = "LUCKY_PLAN", "Lucky Plan"
    RENT = "RENT", "Rent"
    LEASE = "LEASE", "Lease"
    DIRECT_SALE = "DIRECT_SALE", "Direct Sale"


class LeadStage(models.TextChoices):
    NEW = "NEW", "New"
    CONTACTED = "CONTACTED", "Contacted"
    INTERESTED = "INTERESTED", "Interested"
    KYC_PENDING = "KYC_PENDING", "KYC Pending"
    READY_TO_CONVERT = "READY_TO_CONVERT", "Ready To Convert"
    CONVERTED = "CONVERTED", "Converted"
    LOST = "LOST", "Lost"


class OpportunityStage(models.TextChoices):
    OPEN = "OPEN", "Open"
    WON = "WON", "Won"
    LOST = "LOST", "Lost"


class FollowUpTaskStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    DONE = "DONE", "Done"
    CANCELLED = "CANCELLED", "Cancelled"


class PartyMaster(CrmTimeStampedModel):
    party_no = models.CharField(
        max_length=40,
        unique=True,
        default=generate_party_no,
        db_index=True,
    )
    display_name = models.CharField(max_length=160, db_index=True)
    party_kind = models.CharField(
        max_length=20,
        choices=PartyKind.choices,
        default=PartyKind.UNKNOWN,
        db_index=True,
    )
    primary_phone = models.CharField(max_length=20, blank=True, default="", db_index=True)
    primary_email = models.EmailField(blank=True, default="", db_index=True)
    city = models.CharField(max_length=100, blank=True, default="", db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    notes_summary = models.TextField(blank=True, default="")

    class Meta:
        db_table = "crm_parties"
        ordering = ["display_name", "id"]
        indexes = [
            models.Index(fields=["is_active", "display_name"]),
            models.Index(fields=["primary_phone", "display_name"]),
            models.Index(fields=["primary_email", "display_name"]),
        ]

    def clean(self):
        errors = {}
        if not self.display_name or not self.display_name.strip():
            errors["display_name"] = "Party display name is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.party_no = (self.party_no or generate_party_no()).strip().upper()
        self.display_name = (self.display_name or "").strip()
        self.primary_phone = (self.primary_phone or "").strip()
        self.primary_email = (self.primary_email or "").strip().lower()
        self.city = (self.city or "").strip()
        self.notes_summary = (self.notes_summary or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.party_no


class PartyLink(CrmTimeStampedModel):
    party = models.ForeignKey(
        PartyMaster,
        on_delete=models.CASCADE,
        related_name="links",
    )
    role_type = models.CharField(
        max_length=20,
        choices=PartyLinkRole.choices,
        db_index=True,
    )
    source_app_label = models.CharField(max_length=40, db_index=True)
    source_model = models.CharField(max_length=80, db_index=True)
    source_pk = models.PositiveIntegerField(db_index=True)
    source_reference = models.CharField(max_length=100, blank=True, default="", db_index=True)
    is_primary = models.BooleanField(default=False, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "crm_party_links"
        ordering = ["role_type", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["party", "role_type"]),
            models.Index(fields=["source_model", "source_pk"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["role_type", "source_app_label", "source_model", "source_pk"],
                name="crm_party_link_unique_source_role",
            ),
        ]

    def clean(self):
        errors = {}
        if not self.source_app_label or not self.source_app_label.strip():
            errors["source_app_label"] = "Source app label is required."
        if not self.source_model or not self.source_model.strip():
            errors["source_model"] = "Source model is required."
        if self.source_pk <= 0:
            errors["source_pk"] = "Source primary key must be greater than zero."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.source_app_label = (self.source_app_label or "").strip()
        self.source_model = (self.source_model or "").strip()
        self.source_reference = (self.source_reference or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.role_type}:{self.source_model}#{self.source_pk}"


class PartyInteraction(CrmTimeStampedModel):
    party = models.ForeignKey(
        PartyMaster,
        on_delete=models.CASCADE,
        related_name="interactions",
    )
    interaction_type = models.CharField(
        max_length=20,
        choices=PartyInteractionType.choices,
        default=PartyInteractionType.GENERAL,
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=PartyInteractionStatus.choices,
        default=PartyInteractionStatus.OPEN,
        db_index=True,
    )
    subject = models.CharField(max_length=160, blank=True, default="")
    note = models.TextField()
    happened_at = models.DateTimeField(default=timezone.now, db_index=True)
    next_follow_up_at = models.DateTimeField(null=True, blank=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="crm_party_interactions",
        null=True,
        blank=True,
    )
    reminder = models.ForeignKey(
        "reminders.PaymentReminder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_party_interactions",
    )
    related_source_model = models.CharField(max_length=80, blank=True, default="", db_index=True)
    related_source_pk = models.PositiveIntegerField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "crm_party_interactions"
        ordering = ["-happened_at", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["party", "status", "next_follow_up_at"]),
            models.Index(fields=["party", "happened_at"]),
            models.Index(fields=["related_source_model", "related_source_pk"]),
        ]

    def clean(self):
        errors = {}
        if not self.note or not self.note.strip():
            errors["note"] = "Interaction note is required."
        if self.related_source_pk and not (self.related_source_model or "").strip():
            errors["related_source_model"] = "Related source model is required when related source id is set."
        if self.status == PartyInteractionStatus.DONE and self.completed_at is None:
            errors["completed_at"] = "Completed interactions must record completed_at."
        if self.status == PartyInteractionStatus.CANCELLED and self.completed_at is None:
            errors["completed_at"] = "Cancelled interactions must record completed_at."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.subject = (self.subject or "").strip()
        self.note = (self.note or "").strip()
        self.related_source_model = (self.related_source_model or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.party_id}:{self.interaction_type}:{self.status}"


class CustomerTag(CrmTimeStampedModel):
    name = models.CharField(max_length=64, unique=True, db_index=True)
    color = models.CharField(max_length=20, blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "crm_customer_tags"
        ordering = ["name", "id"]

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.color = (self.color or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class CustomerRiskFlag(CrmTimeStampedModel):
    customer = models.ForeignKey(
        "subscriptions.Customer",
        on_delete=models.CASCADE,
        related_name="crm_risk_flags",
    )
    code = models.CharField(max_length=64, db_index=True)
    reason = models.TextField(blank=True, default="")
    severity = models.CharField(max_length=20, default="MEDIUM", db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_raised_risk_flags",
    )

    class Meta:
        db_table = "crm_customer_risk_flags"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["customer", "is_active", "severity"]),
        ]

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.reason = (self.reason or "").strip()
        self.severity = (self.severity or "MEDIUM").strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)


class Lead(CrmTimeStampedModel):
    name = models.CharField(max_length=120, db_index=True)
    phone = models.CharField(max_length=20, db_index=True)
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    source = models.CharField(max_length=60, db_index=True)
    interested_product = models.ForeignKey(
        "subscriptions.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_leads",
    )
    interested_plan_type = models.CharField(
        max_length=20,
        choices=LeadPlanType.choices,
        default=LeadPlanType.LUCKY_PLAN,
        db_index=True,
    )
    stage = models.CharField(
        max_length=30,
        choices=LeadStage.choices,
        default=LeadStage.NEW,
        db_index=True,
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_assigned_leads",
    )
    next_follow_up_at = models.DateTimeField(null=True, blank=True, db_index=True)
    converted_customer = models.ForeignKey(
        "subscriptions.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_converted_leads",
    )

    class Meta:
        db_table = "crm_leads"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["phone", "stage"]),
            models.Index(fields=["assigned_to", "next_follow_up_at"]),
        ]

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.phone = (self.phone or "").strip()
        self.email = (self.email or "").strip().lower()
        self.address = (self.address or "").strip()
        self.source = (self.source or "").strip().upper() or "INTERNAL"
        self.full_clean()
        super().save(*args, **kwargs)


class Opportunity(CrmTimeStampedModel):
    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="opportunities",
    )
    customer = models.ForeignKey(
        "subscriptions.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_opportunities",
    )
    title = models.CharField(max_length=160)
    estimated_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stage = models.CharField(max_length=20, choices=OpportunityStage.choices, default=OpportunityStage.OPEN, db_index=True)
    expected_close_date = models.DateField(null=True, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_owned_opportunities",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "crm_opportunities"
        ordering = ["-created_at", "-id"]

    def save(self, *args, **kwargs):
        self.title = (self.title or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class FollowUpTask(CrmTimeStampedModel):
    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="follow_up_tasks",
    )
    customer = models.ForeignKey(
        "subscriptions.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_follow_up_tasks",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_follow_up_tasks",
    )
    due_at = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=20, choices=FollowUpTaskStatus.choices, default=FollowUpTaskStatus.OPEN, db_index=True)
    call_note = models.TextField(blank=True, default="")
    completed_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "crm_follow_up_tasks"
        ordering = ["due_at", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "due_at"]),
            models.Index(fields=["assigned_to", "status", "due_at"]),
        ]

    def save(self, *args, **kwargs):
        self.call_note = (self.call_note or "").strip()
        if self.status != FollowUpTaskStatus.OPEN and self.completed_at is None:
            self.completed_at = timezone.now()
        self.full_clean()
        super().save(*args, **kwargs)


class CustomerInteraction(CrmTimeStampedModel):
    customer = models.ForeignKey(
        "subscriptions.Customer",
        on_delete=models.CASCADE,
        related_name="crm_interactions",
    )
    lead = models.ForeignKey(
        Lead,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="customer_interactions",
    )
    interaction_type = models.CharField(max_length=40, default="CALL", db_index=True)
    note = models.TextField()
    happened_at = models.DateTimeField(default=timezone.now, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_customer_interactions",
    )

    class Meta:
        db_table = "crm_customer_interactions"
        ordering = ["-happened_at", "-id"]

    def save(self, *args, **kwargs):
        self.interaction_type = (self.interaction_type or "CALL").strip().upper()
        self.note = (self.note or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

