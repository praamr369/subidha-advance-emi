class CustomerDispute(TimeStampedModel):
    """Customer dispute lifecycle — payment, delivery, product, billing, KYC."""

    dispute_ref = models.CharField(max_length=30, unique=True, db_index=True)
    customer = models.ForeignKey(
        "Customer", on_delete=models.CASCADE, related_name="disputes"
    )
    subscription = models.ForeignKey(
        "Subscription", on_delete=models.SET_NULL, null=True, blank=True, related_name="disputes"
    )
    dispute_type = models.CharField(
        max_length=30, choices=DisputeType.choices, db_index=True
    )
    subject = models.CharField(max_length=200)
    description = models.TextField()
    stage = models.CharField(
        max_length=20, choices=DisputeStage.choices, default=DisputeStage.OPEN, db_index=True
    )
    priority = models.CharField(
        max_length=10,
        choices=[("LOW", "Low"), ("MEDIUM", "Medium"), ("HIGH", "High")],
        default="MEDIUM",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_disputes",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_disputes",
    )

    # SLA Timeline
    open_due_at = models.DateTimeField(null=True, blank=True)  # Deadline for OPEN stage
    review_due_at = models.DateTimeField(null=True, blank=True)  # Deadline for UNDER_REVIEW stage
    resolve_due_at = models.DateTimeField(null=True, blank=True)  # Deadline for RESOLVED/REJECTED stage

    # Stage transitions
    review_started_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    resolution_notes = models.TextField(blank=True, default="")
    resolution_decision = models.TextField(blank=True, default="")  # Why it was resolved/rejected

    def save(self, *args, **kwargs):
        # Auto-set SLA deadlines on creation
        if not self.pk and not self.open_due_at:
            self.open_due_at = timezone.now() + timezone.timedelta(days=7)
            self.review_due_at = timezone.now() + timezone.timedelta(days=14)
            self.resolve_due_at = timezone.now() + timezone.timedelta(days=21)
        super().save(*args, **kwargs)

    class Meta:
        db_table = "subscriptions_customer_disputes"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Dispute {self.dispute_ref} [{self.stage}] — {self.customer_id}"

    @property
    def is_sla_compliant(self) -> bool:
        """Check if dispute is on track with SLA."""
        now = timezone.now()
        if self.stage == DisputeStage.OPEN:
            return self.open_due_at is None or now <= self.open_due_at
        if self.stage == DisputeStage.UNDER_REVIEW:
            return self.review_due_at is None or now <= self.review_due_at
        return True  # RESOLVED, REJECTED, ESCALATED don't have active SLA

    @property
    def is_sla_breached(self) -> bool:
        """Check if SLA deadline has been missed."""
        now = timezone.now()
        if self.stage == DisputeStage.OPEN:
            return self.open_due_at is not None and now > self.open_due_at
        if self.stage == DisputeStage.UNDER_REVIEW:
            return self.review_due_at is not None and now > self.review_due_at
        return False

    @property
    def days_since_creation(self) -> int:
        """Days elapsed since dispute was created."""
        return (timezone.now() - self.created_at).days if self.created_at else 0