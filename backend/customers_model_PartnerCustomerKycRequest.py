class PartnerCustomerKycRequest(models.Model):
    """Partner-submitted request for admin to action a customer's KYC or login."""
    partner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="customer_kyc_requests",
        db_index=True,
    )
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.PROTECT,
        related_name="partner_kyc_requests",
        null=True,
        blank=True,
        db_index=True,
    )
    customer_name = models.CharField(max_length=200, blank=True, default="")
    customer_phone = models.CharField(max_length=20, blank=True, default="")
    request_type = models.CharField(
        max_length=30,
        choices=PartnerCustomerKycRequestType.choices,
        default=PartnerCustomerKycRequestType.KYC_UPGRADE,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=PartnerCustomerKycRequestStatus.choices,
        default=PartnerCustomerKycRequestStatus.PENDING,
        db_index=True,
    )
    admin_remarks = models.TextField(blank=True, default="")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_partner_kyc_requests",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["partner", "status"]),
            models.Index(fields=["customer", "status"]),
        ]

    def __str__(self):
        name = (
            (self.customer.name if self.customer_id else None)
            or self.customer_name
            or "Unknown"
        )
        return f"{self.request_type} — {name} ({self.status})"