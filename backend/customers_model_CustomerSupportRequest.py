class CustomerSupportRequest(TimeStampedModel):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="support_requests",
    )
    payment = models.ForeignKey(
        "Payment",
        on_delete=models.PROTECT,
        related_name="support_requests",
        null=True,
        blank=True,
    )
    subscription = models.ForeignKey(
        "Subscription",
        on_delete=models.PROTECT,
        related_name="support_requests",
        null=True,
        blank=True,
    )
    category = models.CharField(
        max_length=30,
        choices=SupportRequestCategory.choices,
        default=SupportRequestCategory.OTHER,
        db_index=True,
    )
    message = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=SupportRequestStatus.choices,
        default=SupportRequestStatus.SUBMITTED,
        db_index=True,
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="assigned_support_requests",
        null=True,
        blank=True,
    )
    assigned_at = models.DateTimeField(null=True, blank=True, db_index=True)
    internal_notes = models.TextField(blank=True, default="")
    resolved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="resolved_support_requests",
        null=True,
        blank=True,
    )
    resolution_summary = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        db_table = "customer_support_requests"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["customer", "created_at"]),
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["category", "created_at"]),
            models.Index(fields=["assigned_to", "created_at"]),
            models.Index(fields=["payment"]),
            models.Index(fields=["subscription"]),
            models.Index(fields=["resolved_by", "created_at"]),
        ]

    def clean(self):
        errors = {}

        if not self.message or not self.message.strip():
            errors["message"] = "Support message is required."

        if self.payment_id and self.customer_id:
            if self.payment.customer_id != self.customer_id:
                errors["payment"] = "Selected payment does not belong to this customer."

        if self.subscription_id and self.customer_id:
            if self.subscription.customer_id != self.customer_id:
                errors["subscription"] = "Selected subscription does not belong to this customer."

        if self.payment_id and self.subscription_id:
            if self.payment.subscription_id != self.subscription_id:
                errors["subscription"] = "Selected payment does not belong to the selected subscription."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.message = (self.message or "").strip()
        self.internal_notes = (self.internal_notes or "").strip()
        self.resolution_summary = (self.resolution_summary or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"SupportRequest #{self.pk} - Customer #{self.customer_id}"