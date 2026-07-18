"""Unified CRM Pipeline for lead-to-sale conversion tracking"""

from django.db import models
from django.contrib.auth.models import User


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
        'subscriptions.PublicLead',
        on_delete=models.CASCADE,
        related_name='crm_pipeline',
        help_text='Original public lead',
    )

    online_request = models.OneToOneField(
        'subscriptions.OnlineRequest',
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
        User,
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
