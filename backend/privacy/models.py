"""Privacy & Data Protection Models (DPDP 2023 Compliance)"""
from django.db import models
from django.conf import settings
from django.utils import timezone

from privacy.dpdp_compliance_models import (  # noqa: F401  re-export for migrations
    DataErasureGuard,
    ErasureRequestStatus,
    BreachNotification,
    BreachNotificationStatus,
    BreachSeverity,
    DataRetentionSchedule,
    PurgeJobStatus,
)


class ConsentType(models.TextChoices):
    MARKETING = "MARKETING", "Marketing Communications"
    ANALYTICS = "ANALYTICS", "Analytics & Tracking"
    COOKIES = "COOKIES", "Cookie Tracking"
    PROFILING = "PROFILING", "Behavioral Profiling"
    EMAIL = "EMAIL", "Email Communications"
    SMS = "SMS", "SMS Notifications"
    SURVEY = "SURVEY", "Customer Surveys"
    LOYALTY = "LOYALTY", "Loyalty Program"


class ConsentStatus(models.TextChoices):
    GIVEN = "GIVEN", "Consent Given"
    WITHDRAWN = "WITHDRAWN", "Consent Withdrawn"
    EXPIRED = "EXPIRED", "Consent Expired"
    PENDING = "PENDING", "Pending Confirmation"


class DataRequestType(models.TextChoices):
    # DPDP 2023 ss.11–14 — four rights only. PORTABILITY and RESTRICT are GDPR; not in DPDP.
    INFORMATION = "INFORMATION", "Right to Information / Access (s.11)"
    CORRECTION = "CORRECTION", "Right to Correction / Erasure (s.12)"
    GRIEVANCE = "GRIEVANCE", "Right to Grievance Redressal (s.13)"
    NOMINATION = "NOMINATION", "Right to Nominate (s.14)"


class DataRequestStatus(models.TextChoices):
    RECEIVED = "RECEIVED", "Request Received"
    UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
    APPROVED = "APPROVED", "Approved"
    COMPLETED = "COMPLETED", "Completed"
    REJECTED = "REJECTED", "Rejected"
    APPEALED = "APPEALED", "Under Appeal"


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class CustomerConsent(TimeStampedModel):
    """Track customer consent for data processing (DPDP 2023 s.6)"""

    customer = models.ForeignKey(
        'subscriptions.Customer',
        on_delete=models.CASCADE,
        related_name='consents',
    )

    consent_type = models.CharField(
        max_length=20,
        choices=ConsentType.choices,
        db_index=True,
    )

    status = models.CharField(
        max_length=20,
        choices=ConsentStatus.choices,
        default=ConsentStatus.PENDING,
        db_index=True,
    )

    # CTRL-DPDP-1: notice version links this consent to a specific privacy-notice revision
    # so the fiduciary can prove the exact notice the principal agreed to (DPDP 2023 s.5).
    notice_version = models.CharField(
        max_length=40,
        blank=True,
        default="",
        db_index=True,
        help_text="Version identifier of the privacy notice shown at consent time (e.g. 'v2.1').",
    )
    # Bilingual support: store the language in which consent was captured.
    language_code = models.CharField(
        max_length=10,
        blank=True,
        default="en",
        help_text="ISO 639-1 language code of the notice presented (e.g. 'en', 'hi', 'ta').",
    )

    # Consent details
    purpose_text = models.TextField(help_text="Clear statement of purpose")
    given_at = models.DateTimeField(null=True, blank=True)
    given_by_ip = models.CharField(max_length=45, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    # Audit trail
    given_via = models.CharField(
        max_length=20,
        choices=[
            ('WEB', 'Website'),
            ('MOBILE_APP', 'Mobile App'),
            ('PHONE', 'Phone Call'),
            ('IN_STORE', 'In-Store'),
            ('EMAIL', 'Email Link'),
        ],
        blank=True,
    )

    class Meta:
        db_table = 'customer_consents'
        unique_together = ('customer', 'consent_type')
        ordering = ['-given_at']

    def __str__(self):
        return f"{self.customer.name} - {self.consent_type} ({self.status})"

    def is_active(self) -> bool:
        """Check if consent is currently active"""
        if self.status != ConsentStatus.GIVEN:
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return False
        return True

    def withdraw(self):
        """Withdraw consent"""
        self.status = ConsentStatus.WITHDRAWN
        self.withdrawn_at = timezone.now()
        self.save()


class DataAccessRequest(TimeStampedModel):
    """Customer data principal rights requests (DPDP 2023 ss.11–14)"""

    from subscriptions.models import Customer

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='data_requests',
    )

    request_type = models.CharField(
        max_length=20,
        choices=DataRequestType.choices,
        db_index=True,
    )

    status = models.CharField(
        max_length=20,
        choices=DataRequestStatus.choices,
        default=DataRequestStatus.RECEIVED,
        db_index=True,
    )

    # Request details
    description = models.TextField()
    requested_at = models.DateTimeField(auto_now_add=True, db_index=True)
    due_date = models.DateTimeField()  # 30 days per DPDP 2023

    # Processing
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_data_requests',
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='completed_data_requests',
    )

    # Response
    response_format = models.CharField(
        max_length=20,
        choices=[
            ('JSON', 'JSON'),
            ('CSV', 'CSV'),
            ('PDF', 'PDF'),
            ('EMAIL', 'Email'),
        ],
        default='JSON',
    )
    response_file = models.FileField(upload_to='data_requests/', null=True, blank=True)
    response_notes = models.TextField(blank=True)

    class Meta:
        db_table = 'data_access_requests'
        ordering = ['-requested_at']

    def __str__(self):
        return f"DR-{self.id} ({self.request_type}) - {self.status}"

    @property
    def is_overdue(self) -> bool:
        """Check if request is overdue (SLA: 30 days)"""
        if self.completed_at:
            return False
        return timezone.now() > self.due_date


class PrivacyPreference(TimeStampedModel):
    """Customer privacy preferences (data processing, communications)"""

    from subscriptions.models import Customer

    customer = models.OneToOneField(
        Customer,
        on_delete=models.CASCADE,
        related_name='privacy_preference',
    )

    # Communication preferences
    email_marketing = models.BooleanField(default=True)
    sms_marketing = models.BooleanField(default=True)
    push_notifications = models.BooleanField(default=True)
    product_recommendations = models.BooleanField(default=True)

    # Data processing
    behavioral_tracking = models.BooleanField(default=False)
    analytics_tracking = models.BooleanField(default=True)
    profiling = models.BooleanField(default=False)
    third_party_sharing = models.BooleanField(default=False)

    # Privacy controls
    do_not_sell = models.BooleanField(default=False)
    limit_retention = models.BooleanField(default=False)  # Delete sooner than 7 years
    data_portability = models.BooleanField(default=False)  # Export data on request

    class Meta:
        db_table = 'privacy_preferences'

    def __str__(self):
        return f"PrivacyPref - {self.customer.name}"


class CookieConsent(TimeStampedModel):
    """Track cookie & tracking consent (CPA 2019)"""

    from subscriptions.models import Customer

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='cookie_consents',
    )

    # Anonymous visitor tracking
    session_id = models.CharField(max_length=100, null=True, blank=True, unique=True)
    browser_fingerprint = models.CharField(max_length=255, null=True, blank=True)

    # Cookie types
    essential_allowed = models.BooleanField(default=True)  # Always allowed
    analytics_allowed = models.BooleanField(default=False)
    marketing_allowed = models.BooleanField(default=False)
    third_party_allowed = models.BooleanField(default=False)

    # Details
    consent_given_at = models.DateTimeField()
    expires_at = models.DateTimeField()  # 13 months per CPA 2019
    ip_address = models.CharField(max_length=45, blank=True)
    user_agent = models.TextField(blank=True)

    class Meta:
        db_table = 'cookie_consents'
        ordering = ['-consent_given_at']

    def __str__(self):
        return f"CookieConsent - {self.customer.name if self.customer else self.session_id}"

    def is_valid(self) -> bool:
        """Check if consent is still valid"""
        return timezone.now() <= self.expires_at


class DataBreachLog(TimeStampedModel):
    """Log data breach incidents (DPDP 2023 Article 7)"""

    # Breach details
    breach_description = models.TextField()
    data_types_affected = models.JSONField()  # ['email', 'phone', 'address']
    affected_customer_count = models.PositiveIntegerField()

    # Timeline
    discovered_at = models.DateTimeField()
    reported_at = models.DateTimeField(auto_now_add=True)
    contained_at = models.DateTimeField(null=True, blank=True)
    notified_at = models.DateTimeField(null=True, blank=True)

    # Investigation
    root_cause = models.TextField(blank=True)
    remediation_steps = models.TextField(blank=True)
    authority_notified = models.BooleanField(default=False)

    # Notification status
    notification_method = models.CharField(
        max_length=100,
        choices=[
            ('EMAIL', 'Email'),
            ('SMS', 'SMS'),
            ('BOTH', 'Email & SMS'),
        ],
        blank=True,
    )
    notification_template = models.TextField(blank=True)

    class Meta:
        db_table = 'data_breach_logs'
        ordering = ['-discovered_at']

    def __str__(self):
        return f"Breach on {self.discovered_at.date()} - {self.affected_customer_count} customers"


class DataAccessLog(TimeStampedModel):
    """Audit log: who accessed what data (DPDP 2023 Article 6)"""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='data_access_logs',
    )

    customer = models.ForeignKey(
        'subscriptions.Customer',
        on_delete=models.CASCADE,
        related_name='access_logs',
    )

    # Access details
    data_categories = models.JSONField()  # ['profile', 'orders', 'payments']
    access_reason = models.CharField(
        max_length=100,
        choices=[
            ('CUSTOMER_REQUEST', 'Customer Request'),
            ('SUPPORT', 'Customer Support'),
            ('VERIFICATION', 'KYC/Verification'),
            ('PAYMENT', 'Payment Processing'),
            ('DELIVERY', 'Delivery Fulfillment'),
            ('RECOVERY', 'Recovery/Collection'),
            ('SYSTEM', 'System Maintenance'),
        ],
    )

    # Audit
    accessed_at = models.DateTimeField(auto_now_add=True, db_index=True)
    ip_address = models.CharField(max_length=45, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True)

    class Meta:
        db_table = 'data_access_logs'
        ordering = ['-accessed_at']
        indexes = [
            models.Index(fields=['customer', 'accessed_at']),
            models.Index(fields=['user', 'accessed_at']),
        ]

    def __str__(self):
        return f"{self.user} accessed {self.customer.name} data ({self.access_reason})"


class DPOGrievance(TimeStampedModel):
    """Data Protection Officer grievance & appeal tracking"""

    from subscriptions.models import Customer

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='dpo_grievances',
    )

    grievance_type = models.CharField(
        max_length=50,
        choices=[
            ('CONSENT_VIOLATION', 'Consent Violation'),
            ('DATA_BREACH', 'Data Breach'),
            ('DENIED_REQUEST', 'Denied Data Request'),
            ('PRIVACY_VIOLATION', 'Privacy Violation'),
            ('RETENTION_EXCESS', 'Excessive Retention'),
            ('UNAUTHORIZED_SHARING', 'Unauthorized Data Sharing'),
            ('OTHER', 'Other'),
        ],
    )

    title = models.CharField(max_length=255)
    description = models.TextField()

    # Status & timeline
    filed_at = models.DateTimeField(auto_now_add=True, db_index=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    stage_1_due = models.DateTimeField()  # 30 days per DPDP 2023
    stage_1_completed_at = models.DateTimeField(null=True, blank=True)
    stage_2_due = models.DateTimeField()  # 14 days
    stage_2_completed_at = models.DateTimeField(null=True, blank=True)

    # Resolution
    assigned_to_dpo = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_grievances',
    )
    resolution_notes = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=[
            ('FILED', 'Filed'),
            ('UNDER_REVIEW', 'Under Review'),
            ('RESOLVED', 'Resolved'),
            ('ESCALATED', 'Escalated to Authority'),
        ],
        default='FILED',
        db_index=True,
    )

    class Meta:
        db_table = 'dpo_grievances'
        ordering = ['-filed_at']

    def __str__(self):
        return f"DPO-{self.id} ({self.grievance_type}) - {self.status}"

    @property
    def is_overdue(self) -> bool:
        """Check if grievance is overdue (Stage 1: 30 days)"""
        if self.resolved_at:
            return False
        return timezone.now() > self.stage_1_due


class DataRetentionPolicy(TimeStampedModel):
    """Configure data retention schedule (DPDP 2023)"""

    data_category = models.CharField(
        max_length=100,
        unique=True,
        choices=[
            ('CUSTOMER_PROFILE', 'Customer Profile'),
            ('PAYMENT_RECORDS', 'Payment Records'),
            ('KYC_DOCUMENTS', 'KYC Documents'),
            ('COMMUNICATION', 'Email/SMS History'),
            ('SUPPORT_TICKETS', 'Support Tickets'),
            ('ANALYTICS', 'Analytics Data'),
            ('CALL_RECORDINGS', 'Call Recordings'),
            ('WEBSITE_LOGS', 'Website Logs'),
            ('BACKUPS', 'Backup Copies'),
        ],
    )

    retention_months = models.PositiveIntegerField(help_text="Months to retain")
    legal_requirement = models.CharField(max_length=255, blank=True)
    auto_delete = models.BooleanField(default=True)
    notify_before_delete = models.BooleanField(default=False)
    notify_days_before = models.PositiveIntegerField(default=30)

    class Meta:
        db_table = 'data_retention_policies'

    def __str__(self):
        return f"{self.data_category} - {self.retention_months} months"
