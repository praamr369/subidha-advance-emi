class KycReviewAction(models.Model):
    """Immutable audit record written for every KYC state transition.

    Works across all owner types. owner_type + owner_id identify the
    party; document_model + document_id identify the specific document (if
    the action applies to a single document rather than the overall KYC
    profile).
    """

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    owner_type = models.CharField(
        max_length=20,
        choices=KycOwnerType.choices,
        db_index=True,
    )
    owner_id = models.PositiveIntegerField(db_index=True)

    document_model = models.CharField(max_length=80, blank=True, default="")
    document_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)

    action = models.CharField(
        max_length=30,
        choices=KycReviewActionType.choices,
        db_index=True,
    )
    old_status = models.CharField(max_length=30, blank=True, default="")
    new_status = models.CharField(max_length=30, blank=True, default="")
    reason = models.TextField(blank=True, default="")

    upload_source = models.CharField(
        max_length=30,
        choices=KycUploadSource.choices,
        blank=True,
        default="",
    )

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="kyc_review_actions",
        null=True,
        blank=True,
    )

    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "kyc_review_actions"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["owner_type", "owner_id", "created_at"]),
            models.Index(fields=["owner_type", "action"]),
            models.Index(fields=["document_model", "document_id"]),
        ]

    def save(self, *args, **kwargs):
        self.reason = (self.reason or "").strip()
        self.document_model = (self.document_model or "").strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"KycReviewAction[{self.owner_type}#{self.owner_id}] "
            f"{self.action} by {self.performed_by_id}"
        )