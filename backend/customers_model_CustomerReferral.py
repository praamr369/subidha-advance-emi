class CustomerReferral(TimeStampedModel):
    """
    Tracks referral relationships between customers.
    Commission is NOT payable automatically – admin must approve.
    """

    referrer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="referrals_made",
    )
    referred = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="referred_by_referrals",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_customer_referrals",
    )
    notes = models.TextField(blank=True, default="")

    commission_enabled = models.BooleanField(
        default=False,
        help_text="Set true only when admin global referral commission feature is enabled.",
    )
    commission_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    commission_approved = models.BooleanField(default=False)
    commission_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_referral_commissions",
    )
    commission_approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "customer_referrals"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["referrer", "referred"],
                name="uq_customer_referral_pair",
            ),
        ]
        indexes = [
            models.Index(fields=["referrer", "created_at"]),
            models.Index(fields=["referred"]),
            models.Index(fields=["commission_approved"]),
        ]

    def clean(self):
        errors = {}
        if self.referrer_id and self.referred_id and self.referrer_id == self.referred_id:
            errors["referred"] = "A customer cannot refer themselves."
        if self.commission_amount < Decimal("0.00"):
            errors["commission_amount"] = "Commission amount cannot be negative."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Referral: {self.referrer_id} → {self.referred_id}"