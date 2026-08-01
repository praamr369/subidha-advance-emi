class CustomerKycDocument(TimeStampedModel):
    """
    Customer-level KYC documents.
    Separate from SubscriptionDocument (which is linked to a specific subscription).
    Upload does NOT auto-approve; admin must approve/reject.
    """

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="kyc_documents",
    )
    document_type = models.CharField(
        max_length=30,
        choices=CustomerKycDocumentType.choices,
        default=CustomerKycDocumentType.OTHER,
        db_index=True,
    )
    # Additive readiness classification (blank-safe for existing rows). When
    # UNSPECIFIED the readiness service infers the category from document_type.
    category = models.CharField(
        max_length=30,
        choices=KycDocumentCategory.choices,
        default=KycDocumentCategory.UNSPECIFIED,
        blank=True,
        db_index=True,
    )
    file = models.FileField(upload_to=customer_kyc_doc_upload_to)
    original_filename = models.CharField(max_length=255, blank=True, default="")
    content_type = models.CharField(max_length=100, blank=True, default="")
    file_size = models.PositiveBigIntegerField(default=0)
    notes = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=30,
        choices=CustomerKycDocumentStatus.choices,
        default=CustomerKycDocumentStatus.SUBMITTED,
        db_index=True,
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_kyc_documents",
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_kyc_documents",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    expiry_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Document expiry date. Leave blank for non-expiring documents (e.g. PAN, Voter ID).",
    )
    rejection_reason = models.TextField(blank=True, default="")
    # Additive: tracks where the upload originated (admin / self-service / CRM / registration)
    upload_source = models.CharField(
        max_length=30,
        blank=True,
        default="",
        db_index=True,
    )
    # Additive: links to the document that this is replacing (resubmission chain)
    resubmission_of = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resubmissions",
    )

    class Meta:
        db_table = "customer_kyc_documents"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["customer", "status"]),
            models.Index(fields=["customer", "document_type"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def clean(self):
        errors = {}
        if not self.customer_id:
            errors["customer"] = "Customer is required."
        if not self.file:
            errors["file"] = "Document file is required."
        if self.file_size < 0:
            errors["file_size"] = "File size cannot be negative."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.file:
            self.original_filename = (
                self.original_filename or Path(getattr(self.file, "name", "")).name
            )[:255]
            self.file_size = int(getattr(self.file, "size", None) or self.file_size or 0)
            content_type = getattr(self.file, "content_type", "") or ""
            if content_type:
                self.content_type = content_type[:100]
        self.notes = (self.notes or "").strip()
        self.rejection_reason = (self.rejection_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"KYC {self.document_type} for customer {self.customer_id} [{self.status}]"