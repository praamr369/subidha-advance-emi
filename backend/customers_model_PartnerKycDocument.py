class PartnerKycDocument(models.Model):
    """KYC document uploaded for a partner user (role=PARTNER)."""

    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    partner_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="partner_kyc_documents",
    )
    document_type = models.CharField(
        max_length=30,
        choices=PartnerKycDocumentType.choices,
        default=PartnerKycDocumentType.OTHER,
        db_index=True,
    )
    category = models.CharField(max_length=30, blank=True, default="", db_index=True)
    document_reference = models.CharField(max_length=80, blank=True, default="")
    file = models.FileField(upload_to=partner_kyc_doc_upload_to)
    original_filename = models.CharField(max_length=255, blank=True, default="")
    content_type = models.CharField(max_length=100, blank=True, default="")
    file_size = models.PositiveBigIntegerField(default=0)
    notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=30,
        choices=PartnerKycDocumentStatus.choices,
        default=PartnerKycDocumentStatus.SUBMITTED,
        db_index=True,
    )
    upload_source = models.CharField(
        max_length=30,
        choices=KycUploadSource.choices,
        default=KycUploadSource.ADMIN_UPLOAD,
        blank=True,
        db_index=True,
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_partner_kyc_documents",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_partner_kyc_documents",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    expiry_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Document expiry date. Leave blank for non-expiring documents.",
    )
    rejection_reason = models.TextField(blank=True, default="")
    resubmission_of = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resubmissions",
    )

    class Meta:
        db_table = "partner_kyc_documents"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["partner_user", "status"]),
            models.Index(fields=["partner_user", "document_type"]),
        ]

    def clean(self):
        errors = {}
        if not self.partner_user_id:
            errors["partner_user"] = "Partner user is required."
        if not self.file:
            errors["file"] = "Document file is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.file:
            self.original_filename = (
                self.original_filename or Path(getattr(self.file, "name", "")).name
            )[:255]
            self.file_size = int(getattr(self.file, "size", None) or self.file_size or 0)
            ct = getattr(self.file, "content_type", "") or ""
            if ct:
                self.content_type = ct[:100]
        self.notes = (self.notes or "").strip()
        self.rejection_reason = (self.rejection_reason or "").strip()
        self.document_reference = (self.document_reference or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"PartnerKYC {self.document_type} for user {self.partner_user_id} [{self.status}]"
        )