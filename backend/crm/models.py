from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone
from products_core.models import Product
from lucky_plan.models import Batch
from subscriptions.base_models import *
from subscriptions.enums import *
from customers.models import Customer
from decimal import Decimal


def generate_party_no() -> str:
    import uuid
    return f"PTY-{timezone.now().strftime('%Y%m%d%H%M%S%f')}-{uuid.uuid4().hex[:6].upper()}"


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


class LeadSource(models.TextChoices):
    WALK_IN = "WALK_IN", "Walk In"
    REFERRAL = "REFERRAL", "Referral"
    ONLINE_ENQUIRY = "ONLINE_ENQUIRY", "Online Enquiry"
    PARTNER = "PARTNER", "Partner"
    BROCHURE = "BROCHURE", "Brochure"
    EVENT = "EVENT", "Event"
    SOCIAL_MEDIA = "SOCIAL_MEDIA", "Social Media"
    PHONE_CALL = "PHONE_CALL", "Phone Call"
    INTERNAL = "INTERNAL", "Internal"
    OTHER = "OTHER", "Other"


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
        "customers.Customer",
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
    source = models.CharField(max_length=60, choices=LeadSource.choices, db_index=True)
    notes = models.TextField(blank=True, default="")
    public_lead = models.ForeignKey(
        "crm.PublicLead",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crm_pipeline_lead",
    )
    interested_product = models.ForeignKey(
        "products_core.Product",
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
    # When the lead last entered its current stage. Used for accurate stage-age
    # and stalled-lead SLA reporting. Auto-stamped on create and on stage change.
    stage_changed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    converted_customer = models.ForeignKey(
        "customers.Customer",
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
        raw_source = (self.source or "").strip().upper()
        self.source = raw_source if raw_source in LeadSource.values else LeadSource.OTHER
        self.notes = (self.notes or "").strip()
        if self.stage_changed_at is None:
            self.stage_changed_at = timezone.now()
        self.full_clean()
        super().save(*args, **kwargs)


class Opportunity(CrmTimeStampedModel):
    lead = models.ForeignKey(
        Lead,
        on_delete=models.CASCADE,
        related_name="opportunities",
    )
    customer = models.ForeignKey(
        "customers.Customer",
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
        "customers.Customer",
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
        "customers.Customer",
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


# ---------------------------------------------------------------------------
# StaffSalesTarget — monthly sales targets per staff member
# ---------------------------------------------------------------------------

class StaffSalesTarget(CrmTimeStampedModel):
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sales_targets",
        db_index=True,
    )
    month = models.PositiveSmallIntegerField()
    year = models.PositiveSmallIntegerField()
    target_leads = models.PositiveIntegerField(default=0)
    target_conversions = models.PositiveIntegerField(default=0)
    target_revenue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "crm_staff_sales_targets"
        unique_together = [("staff", "month", "year")]
        ordering = ["-year", "-month", "staff"]
        indexes = [
            models.Index(fields=["year", "month"]),
        ]

    def __str__(self):
        return f"Target({self.staff_id}) {self.year}-{self.month:02d}"

    def clean(self):
        from django.core.exceptions import ValidationError as DjValidationError
        if not (1 <= (self.month or 0) <= 12):
            raise DjValidationError({"month": "Month must be between 1 and 12."})
        if not self.year or self.year < 2020:
            raise DjValidationError({"year": "Year must be 2020 or later."})



class PublicLead(TimeStampedModel):

    name = models.CharField(max_length=100)

    phone = models.CharField(max_length=10, db_index=True)

    email = models.EmailField(blank=True, default="")

    city = models.CharField(max_length=100, blank=True, default="")

    product = models.ForeignKey(

        Product,

        on_delete=models.SET_NULL,

        related_name="public_leads",

        null=True,

        blank=True,

    )

    interested_product = models.CharField(max_length=255, blank=True, default="")

    preferred_emi_amount = models.DecimalField(

        max_digits=12,

        decimal_places=2,

        null=True,

        blank=True,

    )

    notes = models.TextField(blank=True, default="")

    admin_notes = models.TextField(blank=True, default="")

    status = models.CharField(

        max_length=20,

        choices=PublicLeadStatus.choices,

        default=PublicLeadStatus.NEW,

        db_index=True,

    )

    intent = models.CharField(

        max_length=20,

        choices=PublicLeadIntent.choices,

        default=PublicLeadIntent.GENERAL,

        db_index=True,

    )

    source = models.CharField(max_length=40, default="PUBLIC_SITE")

    follow_up_required = models.BooleanField(default=False, db_index=True)

    follow_up_on = models.DateField(null=True, blank=True, db_index=True)

    follow_up_note = models.TextField(blank=True, default="")

    assigned_to = models.ForeignKey(

        settings.AUTH_USER_MODEL,

        on_delete=models.SET_NULL,

        related_name="assigned_public_leads",

        null=True,

        blank=True,

    )

    # Registration tracking (no auth ΓåÆ Customer with auth account)

    converted_customer = models.ForeignKey("customers.Customer",

        on_delete=models.SET_NULL,

        related_name="converted_public_leads",

        null=True,

        blank=True,

        help_text="Customer account created when public lead registers",

    )



    # Quote workflow tracking (PublicLead ΓåÆ OnlineRequest)

    converted_online_request = models.ForeignKey("crm.OnlineRequest",

        on_delete=models.SET_NULL,

        related_name="public_lead_source",

        null=True,

        blank=True,

        help_text="OnlineRequest created when enquiry moved to quote workflow",

    )



    # Final request tracking (OnlineRequest ΓåÆ ProductRequest/SubscriptionRequest)

    converted_product_request = models.ForeignKey("crm.ProductRequest",

        on_delete=models.SET_NULL,

        related_name="public_lead_source",

        null=True,

        blank=True,

        help_text="ProductRequest created when quote accepted",

    )

    converted_subscription_request = models.ForeignKey("crm.SubscriptionRequest",

        on_delete=models.SET_NULL,

        related_name="public_lead_source",

        null=True,

        blank=True,

        help_text="SubscriptionRequest created when quote accepted",

    )



    # Final fulfillment tracking

    converted_subscription = models.ForeignKey("contracts.Subscription",

        on_delete=models.SET_NULL,

        related_name="converted_public_leads",

        null=True,

        blank=True,

    )

    converted_direct_sale = models.ForeignKey(

        "billing.DirectSale",

        on_delete=models.SET_NULL,

        related_name="converted_public_leads",

        null=True,

        blank=True,

    )

    converted_by = models.ForeignKey(

        settings.AUTH_USER_MODEL,

        on_delete=models.SET_NULL,

        related_name="converted_public_leads",

        null=True,

        blank=True,

    )

    assigned_at = models.DateTimeField(null=True, blank=True, db_index=True)

    contacted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    converted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    closed_at = models.DateTimeField(null=True, blank=True, db_index=True)



    class Meta:

        db_table = "public_leads"

        ordering = ["-created_at", "-id"]

        indexes = [

            models.Index(fields=["phone"]),

            models.Index(fields=["status"]),

            models.Index(fields=["name"]),

            models.Index(fields=["created_at"]),

            models.Index(fields=["converted_customer", "created_at"]),

            models.Index(fields=["converted_subscription", "created_at"]),

            models.Index(fields=["converted_direct_sale", "created_at"]),

        ]



    def clean(self):

        errors = {}



        if not self.name or not self.name.strip():

            errors["name"] = "Lead name is required."



        normalized_phone = (self.phone or "").strip()

        if not normalized_phone:

            errors["phone"] = "Phone number is required."

        if self.follow_up_required and self.follow_up_on is None:

            errors["follow_up_on"] = "Follow-up date is required when follow-up is marked required."



        if errors:

            raise ValidationError(errors)



    def save(self, *args, **kwargs):

        self.name = (self.name or "").strip()

        self.phone = (self.phone or "").strip()

        self.city = (self.city or "").strip()

        self.interested_product = (self.interested_product or "").strip()

        self.notes = (self.notes or "").strip()

        self.admin_notes = (self.admin_notes or "").strip()

        self.intent = (self.intent or PublicLeadIntent.GENERAL).strip().upper()

        self.source = (self.source or "").strip() or "PUBLIC_SITE"

        self.follow_up_note = (self.follow_up_note or "").strip()

        self.full_clean()

        super().save(*args, **kwargs)



    def __str__(self):

        return f"Lead #{self.id} - {self.name} ({self.phone})"






class SubscriptionRequest(TimeStampedModel):

    requester = models.ForeignKey(

        settings.AUTH_USER_MODEL,

        on_delete=models.PROTECT,

        related_name="subscription_requests",

    )

    requester_role_snapshot = models.CharField(max_length=20, db_index=True)

    partner = models.ForeignKey(

        settings.AUTH_USER_MODEL,

        on_delete=models.PROTECT,

        related_name="partner_subscription_requests",

        null=True,

        blank=True,

    )

    customer = models.ForeignKey("customers.Customer",

        on_delete=models.PROTECT,

        related_name="subscription_requests",

        null=True,

        blank=True,

    )

    requested_customer_name = models.CharField(max_length=100, blank=True, default="")

    requested_customer_phone = models.CharField(max_length=15, blank=True, default="")

    requested_customer_email = models.EmailField(blank=True, default="")

    requested_customer_address = models.TextField(blank=True, default="")

    requested_customer_city = models.CharField(max_length=100, blank=True, default="")

    product = models.ForeignKey("products_core.Product",

        on_delete=models.PROTECT,

        related_name="subscription_requests",

    )

    batch = models.ForeignKey("lucky_plan.Batch",

        on_delete=models.PROTECT,

        related_name="subscription_requests",

    )

    preferred_lucky_number = models.PositiveSmallIntegerField()

    requested_tenure_months_snapshot = models.PositiveIntegerField()

    notes = models.TextField(blank=True, default="")



    # Source tracking (CRM Pipeline)

    source_public_lead = models.ForeignKey("crm.PublicLead",

        on_delete=models.SET_NULL,

        related_name="subscription_requests_from_lead",

        null=True,

        blank=True,

        help_text="Original PublicLead if this request came from public enquiry",

    )



    status = models.CharField(

        max_length=32,

        choices=SubscriptionRequestStatus.choices,

        default=SubscriptionRequestStatus.SUBMITTED,

        db_index=True,

    )

    reviewed_by = models.ForeignKey(

        settings.AUTH_USER_MODEL,

        on_delete=models.PROTECT,

        related_name="reviewed_subscription_requests",

        null=True,

        blank=True,

    )

    reviewed_at = models.DateTimeField(null=True, blank=True, db_index=True)

    review_note = models.TextField(blank=True, default="")

    # Fulfillment conversions

    approved_subscription = models.OneToOneField(

        "contracts.Subscription",

        on_delete=models.PROTECT,

        related_name="subscription_request",

        null=True,

        blank=True,

        help_text="Subscription created (Advance EMI, Rent, or Lease)",

    )

    approved_direct_sale = models.OneToOneField(

        "billing.DirectSale",

        on_delete=models.SET_NULL,

        related_name="subscription_request",

        null=True,

        blank=True,

        help_text="Direct sale/invoice created",

    )

    approved_rent_profile = models.OneToOneField("contracts.RentSubscriptionProfile",

        on_delete=models.SET_NULL,

        related_name="subscription_request",

        null=True,

        blank=True,

        help_text="Rent-specific profile (if subscription is RENT type)",

    )

    approved_lease_profile = models.OneToOneField("contracts.LeaseSubscriptionProfile",

        on_delete=models.SET_NULL,

        related_name="subscription_request",

        null=True,

        blank=True,

        help_text="Lease-specific profile (if subscription is LEASE type)",

    )

    updated_at = models.DateTimeField(auto_now=True, db_index=True)



    class Meta:

        db_table = "subscription_requests"

        ordering = ["-created_at", "-id"]

        indexes = [

            models.Index(fields=["requester", "status"]),

            models.Index(fields=["partner", "status"]),

            models.Index(fields=["customer", "status"]),

            models.Index(fields=["product", "batch"]),

            models.Index(fields=["batch", "status"]),

            models.Index(fields=["created_at"]),

        ]

        constraints = [

            models.CheckConstraint(

                condition=Q(preferred_lucky_number__gte=0)

                & Q(preferred_lucky_number__lte=99),

                name="chk_subscription_request_lucky_number_range",

            ),

            models.CheckConstraint(

                condition=Q(requested_tenure_months_snapshot__gt=0),

                name="chk_subscription_request_tenure_positive",

            ),

        ]



    def clean(self):

        errors = {}



        valid_role_snapshots = {"ADMIN", "PARTNER", "CUSTOMER", "CASHIER"}



        if not self.requester_role_snapshot or not self.requester_role_snapshot.strip():

            errors["requester_role_snapshot"] = "Requester role snapshot is required."

        elif self.requester_role_snapshot not in valid_role_snapshots:

            errors["requester_role_snapshot"] = "Requester role snapshot is invalid."



        if self.requester_role_snapshot == "CUSTOMER":

            if self.partner_id:

                errors["partner"] = "Customer subscription requests cannot carry a partner."

            if self.customer_id and self.customer.user_id != self.requester_id:

                errors["customer"] = "Customer requests must be linked to the requesting customer profile."



        if self.requester_role_snapshot == "PARTNER" and self.partner_id != self.requester_id:

            errors["partner"] = "Partner requests must use the requesting partner identity."



        if not self.customer_id:

            if not self.requested_customer_name or not self.requested_customer_name.strip():

                errors["requested_customer_name"] = "Customer name is required when no customer is linked."

            if not self.requested_customer_phone or not self.requested_customer_phone.strip():

                errors["requested_customer_phone"] = "Customer phone is required when no customer is linked."

            if not self.requested_customer_email or not self.requested_customer_email.strip():

                errors["requested_customer_email"] = "Customer email is required when no customer is linked."



        if self.approved_subscription_id and self.status != SubscriptionRequestStatus.APPROVED:

            errors["status"] = "Approved subscription can only exist for approved requests."



        if self.status == SubscriptionRequestStatus.APPROVED:

            if not self.approved_subscription_id:

                errors["approved_subscription"] = "Approved subscription is required for approved requests."

            if not self.reviewed_by_id or not self.reviewed_at:

                errors["reviewed_by"] = "Approved requests must store review metadata."



        if self.status == SubscriptionRequestStatus.REJECTED:

            if not self.reviewed_by_id or not self.reviewed_at:

                errors["reviewed_by"] = "Rejected requests must store review metadata."



        if self.customer_id and self.approved_subscription_id:

            if self.approved_subscription.customer_id != self.customer_id:

                errors["approved_subscription"] = "Approved subscription must belong to the resolved customer."



        if self.approved_subscription_id:

            if self.approved_subscription.product_id != self.product_id:

                errors["approved_subscription"] = "Approved subscription must match the requested product."

            if self.approved_subscription.batch_id != self.batch_id:

                errors["approved_subscription"] = "Approved subscription must match the requested batch."



        if errors:

            raise ValidationError(errors)



    def save(self, *args, **kwargs):

        self.requester_role_snapshot = (self.requester_role_snapshot or "").strip().upper()

        self.requested_customer_name = (self.requested_customer_name or "").strip()

        self.requested_customer_phone = (self.requested_customer_phone or "").strip()

        self.requested_customer_email = (self.requested_customer_email or "").strip()

        self.requested_customer_address = (self.requested_customer_address or "").strip()

        self.requested_customer_city = (self.requested_customer_city or "").strip()

        self.notes = (self.notes or "").strip()

        self.review_note = (self.review_note or "").strip()



        if self.customer_id:

            self.requested_customer_name = self.requested_customer_name or self.customer.name

            self.requested_customer_phone = self.requested_customer_phone or self.customer.phone

            self.requested_customer_email = (

                self.requested_customer_email

                or getattr(self.customer.user, "email", "")

                or ""

            )

            self.requested_customer_address = (

                self.requested_customer_address or self.customer.address

            )

            self.requested_customer_city = self.requested_customer_city or self.customer.city



        if not self.requested_tenure_months_snapshot and self.batch_id:

            self.requested_tenure_months_snapshot = self.batch.duration_months



        self.full_clean()

        super().save(*args, **kwargs)



    def __str__(self):

        return f"SubscriptionRequest #{self.pk} - {self.status}"






class ProductRequest(TimeStampedModel):

    requester = models.ForeignKey(

        settings.AUTH_USER_MODEL,

        on_delete=models.PROTECT,

        related_name="product_requests",

    )

    requester_role_snapshot = models.CharField(max_length=20, db_index=True)

    partner = models.ForeignKey(

        settings.AUTH_USER_MODEL,

        on_delete=models.PROTECT,

        related_name="partner_product_requests",

        null=True,

        blank=True,

    )

    customer = models.ForeignKey("customers.Customer",

        on_delete=models.PROTECT,

        related_name="product_requests",

        null=True,

        blank=True,

    )

    requested_customer_name = models.CharField(max_length=100, blank=True, default="")

    requested_customer_phone = models.CharField(max_length=15, blank=True, default="")

    requested_customer_email = models.EmailField(blank=True, default="")

    requested_customer_address = models.TextField(blank=True, default="")

    requested_customer_city = models.CharField(max_length=100, blank=True, default="")

    product = models.ForeignKey("products_core.Product",

        on_delete=models.PROTECT,

        related_name="product_requests",

    )

    request_type = models.CharField(

        max_length=20,

        choices=ProductRequestType.choices,

        db_index=True,

    )

    # Required for EMI

    batch = models.ForeignKey("lucky_plan.Batch",

        on_delete=models.PROTECT,

        related_name="product_requests",

        null=True,

        blank=True,

    )

    preferred_lucky_number = models.PositiveSmallIntegerField(null=True, blank=True)

    requested_tenure_months_snapshot = models.PositiveIntegerField(null=True, blank=True)



    notes = models.TextField(blank=True, default="")



    # Source tracking (CRM Pipeline)

    source_public_lead = models.ForeignKey("crm.PublicLead",

        on_delete=models.SET_NULL,

        related_name="product_requests_from_lead",

        null=True,

        blank=True,

        help_text="Original PublicLead if this request came from public enquiry",

    )



    status = models.CharField(

        max_length=20,

        choices=ProductRequestStatus.choices,

        default=ProductRequestStatus.SUBMITTED,

        db_index=True,

    )

    reviewed_by = models.ForeignKey(

        settings.AUTH_USER_MODEL,

        on_delete=models.PROTECT,

        related_name="reviewed_product_requests",

        null=True,

        blank=True,

    )

    reviewed_at = models.DateTimeField(null=True, blank=True, db_index=True)

    review_note = models.TextField(blank=True, default="")

    

    # Fulfillment conversions (all request types can convert to these)

    approved_subscription = models.OneToOneField(

        "contracts.Subscription",

        on_delete=models.PROTECT,

        related_name="product_request",

        null=True,

        blank=True,

        help_text="Subscription created (Advance EMI, Rent, or Lease)",

    )

    approved_direct_sale = models.OneToOneField(

        "billing.DirectSale",

        on_delete=models.PROTECT,

        related_name="product_request",

        null=True,

        blank=True,

        help_text="Direct sale/invoice created",

    )

    approved_rent_profile = models.OneToOneField("contracts.RentSubscriptionProfile",

        on_delete=models.SET_NULL,

        related_name="product_request",

        null=True,

        blank=True,

        help_text="Rent-specific profile (if subscription is RENT type)",

    )

    approved_lease_profile = models.OneToOneField("contracts.LeaseSubscriptionProfile",

        on_delete=models.SET_NULL,

        related_name="product_request",

        null=True,

        blank=True,

        help_text="Lease-specific profile (if subscription is LEASE type)",

    )

    updated_at = models.DateTimeField(auto_now=True, db_index=True)



    class Meta:

        db_table = "product_requests"

        ordering = ["-created_at", "-id"]

        indexes = [

            models.Index(fields=["requester", "status"]),

            models.Index(fields=["customer", "status"]),

            models.Index(fields=["request_type", "status"]),

            models.Index(fields=["created_at"]),

        ]

        constraints = [

            models.CheckConstraint(

                condition=Q(preferred_lucky_number__isnull=True) | (Q(preferred_lucky_number__gte=0) & Q(preferred_lucky_number__lte=99)),

                name="chk_product_request_lucky_number_range",

            ),

        ]



    def clean(self):

        errors = {}

        valid_role_snapshots = {"ADMIN", "PARTNER", "CUSTOMER", "CASHIER"}



        if not self.requester_role_snapshot or not self.requester_role_snapshot.strip():

            errors["requester_role_snapshot"] = "Requester role snapshot is required."

        elif self.requester_role_snapshot not in valid_role_snapshots:

            errors["requester_role_snapshot"] = "Requester role snapshot is invalid."



        if self.requester_role_snapshot == "CUSTOMER":

            if self.partner_id:

                errors["partner"] = "Customer requests cannot carry a partner."

            if self.customer_id and self.customer.user_id != self.requester_id:

                errors["customer"] = "Customer requests must be linked to the requesting customer profile."



        if self.requester_role_snapshot == "PARTNER" and self.partner_id != self.requester_id:

            errors["partner"] = "Partner requests must use the requesting partner identity."



        if not self.customer_id:

            if not self.requested_customer_name or not self.requested_customer_name.strip():

                errors["requested_customer_name"] = "Customer name is required when no customer is linked."

            if not self.requested_customer_phone or not self.requested_customer_phone.strip():

                errors["requested_customer_phone"] = "Customer phone is required when no customer is linked."



        if self.request_type == ProductRequestType.ADVANCE_EMI:

            if not self.batch_id:

                errors["batch"] = "Batch is required for EMI requests."

            if self.preferred_lucky_number is None:

                errors["preferred_lucky_number"] = "Lucky number is required for EMI requests."



        if self.status == ProductRequestStatus.APPROVED:

            if not self.approved_subscription_id and not self.approved_direct_sale_id:

                errors["status"] = "Approved requests must link to an approved subscription or direct sale."

            if not self.reviewed_by_id or not self.reviewed_at:

                errors["reviewed_by"] = "Approved requests must store review metadata."



        if self.status == ProductRequestStatus.REJECTED:

            if not self.reviewed_by_id or not self.reviewed_at:

                errors["reviewed_by"] = "Rejected requests must store review metadata."



        if errors:

            raise ValidationError(errors)



    def save(self, *args, **kwargs):

        self.requester_role_snapshot = (self.requester_role_snapshot or "").strip().upper()

        self.requested_customer_name = (self.requested_customer_name or "").strip()

        self.requested_customer_phone = (self.requested_customer_phone or "").strip()

        self.requested_customer_email = (self.requested_customer_email or "").strip()

        self.requested_customer_address = (self.requested_customer_address or "").strip()

        self.requested_customer_city = (self.requested_customer_city or "").strip()

        self.notes = (self.notes or "").strip()

        self.review_note = (self.review_note or "").strip()



        if self.customer_id:

            self.requested_customer_name = self.requested_customer_name or self.customer.name

            self.requested_customer_phone = self.requested_customer_phone or self.customer.phone

            self.requested_customer_email = (

                self.requested_customer_email

                or getattr(self.customer.user, "email", "")

                or ""

            )

            self.requested_customer_address = (

                self.requested_customer_address or self.customer.address

            )

            self.requested_customer_city = self.requested_customer_city or self.customer.city



        if self.request_type == ProductRequestType.ADVANCE_EMI and not self.requested_tenure_months_snapshot and self.batch_id:

            self.requested_tenure_months_snapshot = self.batch.duration_months



        self.full_clean()

        super().save(*args, **kwargs)



    def __str__(self):

        return f"ProductRequest #{self.pk} - {self.request_type} - {self.status}"





# =====================================================



# BATCH

# =====================================================




class OnlineRequest(models.Model):

    """Customer online request for products (quote ΓåÆ approval ΓåÆ fulfillment)"""



    STATUS_CHOICES = (

        ('DRAFT', 'Draft'),

        ('QUOTE_SENT', 'Quote Sent'),

        ('QUOTE_ACCEPTED', 'Quote Accepted'),

        ('APPROVED', 'Approved'),

        ('REJECTED', 'Rejected'),

        ('COMPLETED', 'Completed'),

        ('CANCELLED', 'Cancelled'),

    )



    REQUEST_TYPE_CHOICES = (

        ('ADVANCE_EMI', 'Advance EMI'),

        ('DIRECT_SALE', 'Direct Sale'),

        ('RENT', 'Rent'),

        ('LEASE', 'Lease'),

    )



    # Identification

    request_number = models.CharField(

        max_length=50,

        unique=True,

        db_index=True,

        help_text='Auto-generated request number (e.g., ORQ-2026-00001)',

    )



    # Customer & Product

    customer = models.ForeignKey(

        Customer,

        on_delete=models.CASCADE,

        related_name='online_requests',

        db_index=True,

    )

    product = models.ForeignKey(

        Product,

        on_delete=models.CASCADE,

        related_name='online_requests',

    )

    batch = models.ForeignKey(

        Batch,

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='online_requests',

    )



    # Request Details

    request_type = models.CharField(

        max_length=20,

        choices=REQUEST_TYPE_CHOICES,

        db_index=True,

    )

    quantity = models.IntegerField(default=1)

    preferred_tenure = models.IntegerField(null=True, blank=True, help_text='Months')

    preferred_lucky_number = models.IntegerField(null=True, blank=True)



    # Pricing

    unit_price = models.DecimalField(

        max_digits=12,

        decimal_places=2,

        null=True,

        blank=True,

    )

    sub_total = models.DecimalField(

        max_digits=12,

        decimal_places=2,

        null=True,

        blank=True,

        help_text='quantity * unit_price',

    )

    tax_percentage = models.DecimalField(

        max_digits=5,

        decimal_places=2,

        default=Decimal('18.00'),

        help_text='GST percentage (default 18%)',

    )

    gst_amount = models.DecimalField(

        max_digits=12,

        decimal_places=2,

        null=True,

        blank=True,

    )

    delivery_cost = models.DecimalField(

        max_digits=12,

        decimal_places=2,

        null=True,

        blank=True,

        default=Decimal('0.00'),

    )

    total_amount = models.DecimalField(

        max_digits=12,

        decimal_places=2,

        null=True,

        blank=True,

        help_text='sub_total + gst_amount + delivery_cost',

    )

    discount_amount = models.DecimalField(

        max_digits=12,

        decimal_places=2,

        default=Decimal('0.00'),

    )



    # Status & Approval

    status = models.CharField(

        max_length=20,

        choices=STATUS_CHOICES,

        default='DRAFT',

        db_index=True,

    )

    approved_by = models.ForeignKey(

        'accounts.User',

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='approved_online_requests',

    )

    approved_at = models.DateTimeField(null=True, blank=True)

    approval_notes = models.TextField(blank=True)



    # Quotes

    quote_generated_at = models.DateTimeField(null=True, blank=True)

    quote_expiry_date = models.DateField(null=True, blank=True)



    # Source Tracking (CRM Pipeline)

    source_public_lead = models.ForeignKey(

        'crm.PublicLead',

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='online_requests_from_lead',

        help_text='Original PublicLead if this request came from public enquiry',

    )



    # Conversion Tracking (Quote ΓåÆ ProductRequest/SubscriptionRequest)

    converted_product_request = models.OneToOneField(

        'crm.ProductRequest',

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='online_request_source',

        help_text='ProductRequest created when quote is accepted',

    )

    converted_subscription_request = models.OneToOneField(

        'crm.SubscriptionRequest',

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='online_request_source',

        help_text='SubscriptionRequest created when quote is accepted',

    )



    # Fulfillment Conversions (Quote accepted ΓåÆ final transaction)

    approved_subscription = models.ForeignKey(

        'contracts.Subscription',

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='online_request',

        help_text='Subscription created (Advance EMI, Rent, or Lease)',

    )

    approved_direct_sale = models.ForeignKey(

        'billing.DirectSale',

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='online_request',

        help_text='Direct sale/invoice created',

    )

    approved_rent_profile = models.OneToOneField("contracts.RentSubscriptionProfile",

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='online_request',

        help_text='Rent-specific profile (if subscription is RENT type)',

    )

    approved_lease_profile = models.OneToOneField("contracts.LeaseSubscriptionProfile",

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='online_request',

        help_text='Lease-specific profile (if subscription is LEASE type)',

    )



    # Unified CRM Pipeline Fields

    approval_status = models.CharField(

        max_length=20,

        choices=[

            ('DRAFT', 'Draft - Awaiting Quote'),

            ('QUOTED', 'Quoted - Awaiting Approval'),

            ('APPROVED', 'Approved - Contract Created'),

            ('CONVERTED', 'Converted - Sale/Subscription Active'),

            ('REJECTED', 'Rejected'),

            ('LOST', 'Lost Lead'),

        ],

        default='DRAFT',

        db_index=True,

        help_text='Unified workflow status (separate from status field)',

    )



    # Approval Decision

    approved_entity_type = models.CharField(

        max_length=20,

        choices=[

            ('DIRECT_SALE', 'Direct Sale'),

            ('SUBSCRIPTION', 'EMI/Subscription'),

            ('RENT', 'Rent Contract'),

            ('LEASE', 'Lease Contract'),

        ],

        null=True,

        blank=True,

        help_text='Which contract type was approved',

    )



    auto_conversion_enabled = models.BooleanField(

        default=True,

        help_text='Auto-create contract on approval',

    )



    conversion_notes = models.TextField(

        blank=True,

        help_text='Notes about conversion/approval',

    )



    expected_close_date = models.DateField(

        null=True,

        blank=True,

        help_text='Expected sale close date',

    )



    # Timestamps

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    updated_at = models.DateTimeField(auto_now=True)



    class Meta:

        db_table = 'online_request'

        ordering = ['-created_at']

        verbose_name = 'Online Request'

        verbose_name_plural = 'Online Requests'

        indexes = [

            models.Index(fields=['customer', '-created_at']),

            models.Index(fields=['status', '-created_at']),

            models.Index(fields=['request_type', '-created_at']),

            models.Index(fields=['approved_by', 'status']),

        ]



    def __str__(self):

        return f"{self.request_number} - {self.customer.name} ({self.get_status_display()})"



    @property

    def is_quote_expired(self):

        if self.quote_expiry_date:

            return timezone.now().date() > self.quote_expiry_date

        return False



    @property

    def can_accept_quote(self):

        return self.status == 'QUOTE_SENT' and not self.is_quote_expired



    @property

    def can_approve(self):

        return self.status == 'QUOTE_ACCEPTED'






class OnlineRequestAction(models.Model):

    """Audit log for online request lifecycle"""



    ACTION_TYPES = (

        ('CREATED', 'Created'),

        ('QUOTE_GENERATED', 'Quote Generated'),

        ('QUOTE_SENT', 'Quote Sent'),

        ('QUOTE_ACCEPTED', 'Quote Accepted'),

        ('APPROVED', 'Approved'),

        ('REJECTED', 'Rejected'),

        ('COMPLETED', 'Completed'),

        ('CANCELLED', 'Cancelled'),

        ('UPDATED', 'Updated'),

    )



    request = models.ForeignKey(

        OnlineRequest,

        on_delete=models.CASCADE,

        related_name='actions',

    )

    action_type = models.CharField(max_length=20, choices=ACTION_TYPES)

    performed_by = models.ForeignKey(

        'accounts.User',

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='online_request_actions',

    )

    notes = models.TextField(blank=True)

    metadata = models.JSONField(default=dict, blank=True, help_text='Additional context')

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)



    class Meta:

        db_table = 'online_request_action'

        ordering = ['-created_at']

        verbose_name = 'Online Request Action'

        verbose_name_plural = 'Online Request Actions'

        indexes = [

            models.Index(fields=['request', '-created_at']),

            models.Index(fields=['action_type']),

        ]



    def __str__(self):

        return f"{self.request.request_number} - {self.get_action_type_display()}"



class CRMPipeline(models.Model):

    """

    Unified tracking of leads through sales pipeline.

    Single source of truth for lead stage, conversion status, and revenue.

    """



    STAGE_CHOICES = [

        ('LEAD', 'Lead'),

        ('ENQUIRY', 'Online Enquiry'),

        ('QUOTED', 'Quoted'),

        ('APPROVED', 'Approved'),

        ('CONVERTED', 'Converted to Contract'),

        ('ACTIVE', 'Active Sale/Subscription'),

        ('LOST', 'Lost'),

        ('WON', 'Won'),

    ]



    TYPE_CHOICES = [

        ('DIRECT_SALE', 'Direct Sale'),

        ('SUBSCRIPTION', 'EMI/Subscription'),

        ('RENT', 'Rent'),

        ('LEASE', 'Lease'),

    ]



    # Links to source data

    lead = models.OneToOneField(

        'crm.PublicLead',

        on_delete=models.CASCADE,

        related_name='crm_pipeline',

        help_text='Original public lead',

    )



    online_request = models.OneToOneField(

        'crm.OnlineRequest',

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='crm_pipeline',

        help_text='Online enquiry from customer',

    )



    # Pipeline Stage & Type

    current_stage = models.CharField(

        max_length=20,

        choices=STAGE_CHOICES,

        default='LEAD',

        db_index=True,

    )



    request_type = models.CharField(

        max_length=20,

        choices=TYPE_CHOICES,

        null=True,

        blank=True,

        db_index=True,

    )



    # Approval Tracking

    approved_by = models.ForeignKey(

        settings.AUTH_USER_MODEL,

        on_delete=models.SET_NULL,

        null=True,

        blank=True,

        related_name='crm_pipeline_approvals',

    )



    approved_at = models.DateTimeField(null=True, blank=True)



    # Conversion Tracking

    converted_to = models.CharField(

        max_length=20,

        choices=TYPE_CHOICES,

        null=True,

        blank=True,

        help_text='Which contract type was created',

    )



    converted_entity_id = models.IntegerField(

        null=True,

        blank=True,

        help_text='ID of DirectSale/Subscription/RentProfile/LeaseProfile',

    )



    # Revenue Tracking

    quoted_amount = models.DecimalField(

        max_digits=12,

        decimal_places=2,

        default=0,

        help_text='Amount quoted to customer',

    )



    revenue = models.DecimalField(

        max_digits=12,

        decimal_places=2,

        default=0,

        help_text='Confirmed contract value',

    )



    probability = models.IntegerField(

        default=50,

        help_text='Sales probability percentage',

    )



    expected_close_date = models.DateField(

        null=True,

        blank=True,

        help_text='Expected date for conversion',

    )



    # Activity Tracking

    notes = models.TextField(blank=True)



    # Timestamps

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    updated_at = models.DateTimeField(auto_now=True)



    class Meta:

        db_table = 'crm_pipeline'

        ordering = ['-created_at']

        indexes = [

            models.Index(fields=['current_stage', 'created_at']),

            models.Index(fields=['approved_by', 'approved_at']),

            models.Index(fields=['lead', 'current_stage']),

        ]



    def __str__(self):

        customer_name = self.lead.customer_name if self.lead else 'Unknown'

        return f'{customer_name} - {self.current_stage}'



    @property

    def is_approved(self):

        """Check if lead has been approved"""

        return self.current_stage in ['APPROVED', 'CONVERTED', 'ACTIVE', 'WON']



    @property

    def is_converted(self):

        """Check if approved and converted to contract"""

        return self.converted_to is not None



    @property

    def days_in_pipeline(self):

        """Days since lead was created"""

        from django.utils import timezone
        delta = timezone.now() - self.created_at

        return delta.days



    def move_to_stage(self, new_stage):

        """Move lead to new stage (validates transitions)"""

        valid_transitions = {

            'LEAD': ['ENQUIRY', 'LOST'],

            'ENQUIRY': ['QUOTED', 'LOST'],

            'QUOTED': ['APPROVED', 'LOST'],

            'APPROVED': ['CONVERTED'],

            'CONVERTED': ['ACTIVE', 'WON'],

            'LOST': [],

            'WON': [],

            'ACTIVE': ['WON'],

        }



        if new_stage not in valid_transitions.get(self.current_stage, []):

            raise ValueError(f'Cannot move from {self.current_stage} to {new_stage}')



        self.current_stage = new_stage

        self.save()



# --- Folded from subscriptions (Phase E of the split): CRM workbench items. ---
from crm.models_workbench import *  # noqa: E402,F401,F403
