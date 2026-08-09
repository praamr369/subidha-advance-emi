class Customer(TimeStampedModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="customer_profile",
    )
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15)
    kyc_status = models.CharField(
        max_length=20,
        choices=KycStatus.choices,
        default=KycStatus.PENDING,
        db_index=True,
    )
    kyc_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="kyc_reviewed_customers",
        null=True,
        blank=True,
    )
    kyc_reviewed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    kyc_rejection_reason = models.TextField(blank=True, default="")
    # AML / PEP compliance flags (all nullable/blank-safe, additive)
    is_pep = models.BooleanField(default=False, db_index=True, verbose_name="Politically Exposed Person (PEP)")
    pep_flagged_at = models.DateTimeField(null=True, blank=True)
    pep_flagged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pep_flagged_customers",
    )
    aml_cleared = models.BooleanField(default=False, db_index=True, verbose_name="AML Screening Cleared")
    aml_cleared_at = models.DateTimeField(null=True, blank=True)
    address = models.TextField(blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    # Smart address fields — auto-filled from pincode lookup (additive, blank-safe).
    district = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")
    pincode = models.CharField(max_length=10, blank=True, default="", db_index=True)

    # Phase 1 – additive fields (all nullable/blank-safe for existing rows)
    customer_source = models.CharField(
        max_length=20,
        choices=CustomerSource.choices,
        default=CustomerSource.ADMIN,
        blank=True,
        db_index=True,
    )
    created_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="customers_created",
        null=True,
        blank=True,
    )
    created_by_partner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="partner_created_customers",
        null=True,
        blank=True,
    )
    profile_photo = models.ImageField(
        upload_to=customer_photo_upload_to,
        null=True,
        blank=True,
    )
    customer_code = models.CharField(
        max_length=40,
        blank=True,
        default="",
        db_index=True,
        help_text="Human-readable short code for receipts/contracts (auto-generated if blank).",
    )

    # Reminder channel preference — additive, null/blank-safe for existing rows.
    preferred_reminder_channel = models.CharField(
        max_length=16,
        blank=True,
        default="",
        db_index=True,
        help_text="Customer's preferred channel for payment reminders (SMS / WHATSAPP / EMAIL / CALL). Blank = no preference recorded.",
    )
    whatsapp_opted_in = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True when the customer has explicitly opted in to receive WhatsApp reminders.",
    )

    class Meta:
        db_table = "customers"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["phone"]),
            models.Index(fields=["kyc_status"]),
            models.Index(fields=["name"]),
            models.Index(fields=["kyc_reviewed_at"]),
            models.Index(fields=["city"]),
            models.Index(fields=["customer_source"]),
            models.Index(fields=["customer_code"]),
        ]

    def clean(self):
        if not self.name or not self.name.strip():
            raise ValidationError({"name": "Customer name is required."})

        normalized_phone = (self.phone or "").strip()
        if not normalized_phone:
            raise ValidationError({"phone": "Phone number is required."})

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.phone = (self.phone or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def total_paid_amount(self) -> Decimal:
        return q2(
            Payment.objects.filter(customer=self).aggregate(total=Sum("amount"))["total"]
            or MONEY_ZERO
        )

    def __str__(self):
        return f"{self.name} ({self.phone})"