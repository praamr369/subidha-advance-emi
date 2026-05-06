from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from billing.models import BillingInvoice, DirectSale
from crm.models import PartyMaster
from subscriptions.models import (
    Batch,
    Customer,
    Emi,
    LeaseSubscriptionProfile,
    LuckyId,
    Payment,
    Product,
    RentSubscriptionProfile,
    Subscription,
    SubscriptionDelivery,
)


class SupportTicketCategory(models.TextChoices):
    SERVICE_REQUEST = "SERVICE_REQUEST", "Service Request"
    RETURN_REQUEST = "RETURN_REQUEST", "Return Request"
    WARRANTY_CLAIM = "WARRANTY_CLAIM", "Warranty Claim"
    DELIVERY_ISSUE = "DELIVERY_ISSUE", "Delivery Issue"
    PRODUCT_DAMAGE = "PRODUCT_DAMAGE", "Product Damage"
    PAYMENT_ISSUE = "PAYMENT_ISSUE", "Payment Issue"
    EMI_QUERY = "EMI_QUERY", "EMI Query"
    RENT_QUERY = "RENT_QUERY", "Rent Query"
    LEASE_QUERY = "LEASE_QUERY", "Lease Query"
    DIRECT_SALE_QUERY = "DIRECT_SALE_QUERY", "Direct Sale Query"
    DOCUMENT_CORRECTION = "DOCUMENT_CORRECTION", "Document Correction"
    CUSTOMER_PROFILE_UPDATE = "CUSTOMER_PROFILE_UPDATE", "Customer Profile Update"
    LUCKY_DRAW_QUERY = "LUCKY_DRAW_QUERY", "Lucky Draw Query"
    PARTNER_COMPLAINT = "PARTNER_COMPLAINT", "Partner Complaint"
    GENERAL_SUPPORT = "GENERAL_SUPPORT", "General Support"


class SupportTicketStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
    IN_REVIEW = "IN_REVIEW", "In Review"
    WAITING_FOR_CUSTOMER = "WAITING_FOR_CUSTOMER", "Waiting For Customer"
    WAITING_FOR_INTERNAL_ACTION = "WAITING_FOR_INTERNAL_ACTION", "Waiting For Internal Action"
    RESOLVED = "RESOLVED", "Resolved"
    REJECTED = "REJECTED", "Rejected"
    CLOSED = "CLOSED", "Closed"
    REOPENED = "REOPENED", "Reopened"


class SupportTicketPriority(models.TextChoices):
    LOW = "LOW", "Low"
    NORMAL = "NORMAL", "Normal"
    HIGH = "HIGH", "High"
    URGENT = "URGENT", "Urgent"


class SupportTicketSource(models.TextChoices):
    CUSTOMER_PORTAL = "CUSTOMER_PORTAL", "Customer Portal"
    ADMIN = "ADMIN", "Admin"
    PHONE = "PHONE", "Phone"
    EMAIL = "EMAIL", "Email"
    WALK_IN = "WALK_IN", "Walk In"
    OTHER = "OTHER", "Other"


class SupportTicketEventType(models.TextChoices):
    CREATED = "created", "Created"
    COMMENTED = "commented", "Commented"
    INTERNAL_NOTE_ADDED = "internal_note_added", "Internal Note Added"
    ASSIGNED = "assigned", "Assigned"
    LINKED = "linked", "Linked"
    PRIORITY_CHANGED = "priority_changed", "Priority Changed"
    STATUS_CHANGED = "status_changed", "Status Changed"
    RESOLVED = "resolved", "Resolved"
    CLOSED = "closed", "Closed"
    REOPENED = "reopened", "Reopened"


class SupportTicketLinkType(models.TextChoices):
    CUSTOMER = "customer", "Customer"
    SUBSCRIPTION = "subscription", "Subscription"
    EMI = "emi", "EMI"
    PAYMENT = "payment", "Payment"
    PRODUCT = "product", "Product"
    BATCH = "batch", "Batch"
    LUCKY_ID = "lucky_id", "Lucky ID"
    DIRECT_SALE = "direct_sale", "Direct Sale"
    BILLING_INVOICE = "billing_invoice", "Billing Invoice"
    DELIVERY = "delivery", "Delivery"
    RENT_CONTRACT = "rent_contract", "Rent Contract"
    LEASE_CONTRACT = "lease_contract", "Lease Contract"
    PARTNER = "partner", "Partner"


class SupportTicketTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SupportTicket(SupportTicketTimeStampedModel):
    ticket_no = models.CharField(max_length=40, unique=True, db_index=True)
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_tickets",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="support_tickets_created",
    )
    category = models.CharField(
        max_length=40,
        choices=SupportTicketCategory.choices,
        db_index=True,
    )
    status = models.CharField(
        max_length=40,
        choices=SupportTicketStatus.choices,
        default=SupportTicketStatus.OPEN,
        db_index=True,
    )
    priority = models.CharField(
        max_length=12,
        choices=SupportTicketPriority.choices,
        default=SupportTicketPriority.NORMAL,
        db_index=True,
    )
    subject = models.CharField(max_length=200)
    description = models.TextField()
    source = models.CharField(
        max_length=24,
        choices=SupportTicketSource.choices,
        default=SupportTicketSource.CUSTOMER_PORTAL,
        db_index=True,
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_tickets_assigned",
    )
    due_at = models.DateTimeField(null=True, blank=True, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_tickets_resolved",
    )
    closed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_tickets_closed",
    )
    resolution_summary = models.TextField(blank=True, default="")
    preferred_contact_time = models.CharField(max_length=120, blank=True, default="")

    class Meta:
        db_table = "support_tickets"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["customer", "status", "created_at"]),
            models.Index(fields=["status", "priority", "created_at"]),
            models.Index(fields=["assigned_to", "status"]),
            models.Index(fields=["category", "created_at"]),
        ]

    def clean(self):
        errors = {}
        if not (self.subject or "").strip():
            errors["subject"] = "Subject is required."
        if not (self.description or "").strip():
            errors["description"] = "Description is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.subject = (self.subject or "").strip()
        self.description = (self.description or "").strip()
        self.resolution_summary = (self.resolution_summary or "").strip()
        self.preferred_contact_time = (self.preferred_contact_time or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.ticket_no


class SupportTicketEvent(models.Model):
    ticket = models.ForeignKey(
        SupportTicket,
        on_delete=models.CASCADE,
        related_name="events",
    )
    event_type = models.CharField(
        max_length=32,
        choices=SupportTicketEventType.choices,
        db_index=True,
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_ticket_events",
    )
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "support_ticket_events"
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["ticket", "created_at"]),
        ]


class SupportTicketComment(models.Model):
    ticket = models.ForeignKey(
        SupportTicket,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="support_ticket_comments",
    )
    body = models.TextField()
    is_internal = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "support_ticket_comments"
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["ticket", "is_internal", "created_at"]),
        ]

    def save(self, *args, **kwargs):
        self.body = (self.body or "").strip()
        if not self.body:
            raise ValidationError({"body": "Comment cannot be empty."})
        super().save(*args, **kwargs)


class SupportTicketAttachment(models.Model):
    ticket = models.ForeignKey(
        SupportTicket,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to="support_tickets/%Y/%m/", blank=True, null=True, max_length=500)
    original_name = models.CharField(max_length=255, blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="support_ticket_attachments",
    )
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "support_ticket_attachments"
        ordering = ["created_at", "id"]


class SupportTicketLink(SupportTicketTimeStampedModel):
    ticket = models.ForeignKey(
        SupportTicket,
        on_delete=models.CASCADE,
        related_name="links",
    )
    link_type = models.CharField(
        max_length=24,
        choices=SupportTicketLinkType.choices,
        db_index=True,
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    emi = models.ForeignKey(
        Emi,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    payment = models.ForeignKey(
        Payment,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    batch = models.ForeignKey(
        Batch,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    lucky_id = models.ForeignKey(
        LuckyId,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    direct_sale = models.ForeignKey(
        DirectSale,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    billing_invoice = models.ForeignKey(
        BillingInvoice,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    delivery = models.ForeignKey(
        SubscriptionDelivery,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    rent_contract = models.ForeignKey(
        RentSubscriptionProfile,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    lease_contract = models.ForeignKey(
        LeaseSubscriptionProfile,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    partner = models.ForeignKey(
        PartyMaster,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="support_ticket_links",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="support_ticket_links_created",
    )

    class Meta:
        db_table = "support_ticket_links"
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["ticket", "link_type"]),
            models.Index(fields=["subscription"]),
            models.Index(fields=["payment"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["ticket", "link_type", "customer"],
                name="uniq_support_link_ticket_customer",
                condition=models.Q(customer__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "subscription"],
                name="uniq_support_link_ticket_subscription",
                condition=models.Q(subscription__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "emi"],
                name="uniq_support_link_ticket_emi",
                condition=models.Q(emi__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "payment"],
                name="uniq_support_link_ticket_payment",
                condition=models.Q(payment__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "product"],
                name="uniq_support_link_ticket_product",
                condition=models.Q(product__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "batch"],
                name="uniq_support_link_ticket_batch",
                condition=models.Q(batch__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "lucky_id"],
                name="uniq_support_link_ticket_lucky_id",
                condition=models.Q(lucky_id__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "direct_sale"],
                name="uniq_support_link_ticket_direct_sale",
                condition=models.Q(direct_sale__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "billing_invoice"],
                name="uniq_support_link_ticket_billing_invoice",
                condition=models.Q(billing_invoice__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "delivery"],
                name="uniq_support_link_ticket_delivery",
                condition=models.Q(delivery__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "rent_contract"],
                name="uniq_support_link_ticket_rent_contract",
                condition=models.Q(rent_contract__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "lease_contract"],
                name="uniq_support_link_ticket_lease_contract",
                condition=models.Q(lease_contract__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["ticket", "link_type", "partner"],
                name="uniq_support_link_ticket_partner",
                condition=models.Q(partner__isnull=False),
            ),
        ]

    def clean(self):
        fk_fields = [
            "customer",
            "subscription",
            "emi",
            "payment",
            "product",
            "batch",
            "lucky_id",
            "direct_sale",
            "billing_invoice",
            "delivery",
            "rent_contract",
            "lease_contract",
            "partner",
        ]
        set_count = sum(1 for f in fk_fields if getattr(self, f"{f}_id", None))
        if set_count != 1:
            raise ValidationError("Exactly one linked object must be set.")
        lt = (self.link_type or "").strip()
        mapping = {
            SupportTicketLinkType.CUSTOMER: "customer",
            SupportTicketLinkType.SUBSCRIPTION: "subscription",
            SupportTicketLinkType.EMI: "emi",
            SupportTicketLinkType.PAYMENT: "payment",
            SupportTicketLinkType.PRODUCT: "product",
            SupportTicketLinkType.BATCH: "batch",
            SupportTicketLinkType.LUCKY_ID: "lucky_id",
            SupportTicketLinkType.DIRECT_SALE: "direct_sale",
            SupportTicketLinkType.BILLING_INVOICE: "billing_invoice",
            SupportTicketLinkType.DELIVERY: "delivery",
            SupportTicketLinkType.RENT_CONTRACT: "rent_contract",
            SupportTicketLinkType.LEASE_CONTRACT: "lease_contract",
            SupportTicketLinkType.PARTNER: "partner",
        }
        expected = mapping.get(lt)
        if expected and getattr(self, f"{expected}_id", None) is None:
            raise ValidationError({"link_type": f"Link type {lt} requires {expected} to be set."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
