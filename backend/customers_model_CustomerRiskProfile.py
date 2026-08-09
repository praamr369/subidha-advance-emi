class CustomerRiskProfile(TimeStampedModel):
    """
    Advisory risk summary for a customer.

    Populated / refreshed by customer_risk_service.recalculate_customer_risk_profile().
    Enforcement is opt-in via the CUSTOMER_RISK_ENFORCEMENT_ENABLED policy key
    (default False). When enforcement is disabled this record is informational only
    and never gates existing workflows.
    """

    customer = models.OneToOneField(
        Customer,
        on_delete=models.CASCADE,
        related_name="risk_profile",
    )
    risk_score = models.PositiveSmallIntegerField(default=0, db_index=True)
    risk_band = models.CharField(
        max_length=10,
        choices=CustomerRiskBand.choices,
        default=CustomerRiskBand.LOW,
        db_index=True,
    )
    reason_codes = models.JSONField(default=list, blank=True)
    last_calculated_at = models.DateTimeField(null=True, blank=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "subscriptions_customer_risk_profiles"
        ordering = ["-last_calculated_at", "-id"]
        indexes = [
            models.Index(fields=["risk_band", "last_calculated_at"]),
        ]

    def __str__(self):
        return f"RiskProfile({self.customer_id}): {self.risk_band} [{self.risk_score}]"