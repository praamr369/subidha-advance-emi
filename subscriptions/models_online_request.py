from decimal import Decimal
from django.db import models
from django.utils import timezone

from subscriptions.models import Customer, Product, Batch


class OnlineRequest(models.Model):
    """Customer online request for products (quote → approval → fulfillment)"""

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

    # Linked Transactions
    approved_subscription = models.ForeignKey(
        'subscriptions.Subscription',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='online_request',
    )
    approved_direct_sale = models.ForeignKey(
        'billing.DirectSale',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='online_request',
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
