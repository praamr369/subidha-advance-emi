"""Enterprise Migration Center models.

All tables are additive. Nothing here mutates production business tables;
production writes happen only inside import services, and every write is
tracked on the staging row so batch rollback can undo exactly what it created.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone


class MigrationSourceType(models.TextChoices):
    WORKBENCH = "WORKBENCH", "Web Workbench (manual entry)"
    MYBILLBOOK = "MYBILLBOOK", "myBillBook"
    GENERIC_CSV = "GENERIC_CSV", "Generic CSV"
    EXCEL = "EXCEL", "Excel"
    TALLY = "TALLY", "Tally"
    BUSY = "BUSY", "Busy"
    MARG = "MARG", "Marg ERP"
    VYAPAR = "VYAPAR", "Vyapar"
    ZOHO_BOOKS = "ZOHO_BOOKS", "Zoho Books"
    MSSQL = "MSSQL", "Microsoft SQL Server"
    CUSTOM = "CUSTOM", "Custom ERP"


class MigrationBatchStatus(models.TextChoices):
    UPLOADED = "UPLOADED", "Uploaded"
    MAPPED = "MAPPED", "Mapped"
    VALIDATED = "VALIDATED", "Validated"
    PREVIEWED = "PREVIEWED", "Previewed"
    APPROVED = "APPROVED", "Approved"
    IMPORTING = "IMPORTING", "Importing"
    IMPORTED = "IMPORTED", "Imported"
    PARTIALLY_IMPORTED = "PARTIALLY_IMPORTED", "Partially Imported"
    FAILED = "FAILED", "Failed"
    ROLLED_BACK = "ROLLED_BACK", "Rolled Back"
    CANCELLED = "CANCELLED", "Cancelled"


class StagingRowStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    VALID = "VALID", "Valid"
    WARNING = "WARNING", "Warning"
    ERROR = "ERROR", "Error"
    DUPLICATE = "DUPLICATE", "Duplicate"
    IMPORTED = "IMPORTED", "Imported"
    SKIPPED = "SKIPPED", "Skipped"
    FAILED = "FAILED", "Failed"
    ROLLED_BACK = "ROLLED_BACK", "Rolled Back"


class DuplicateResolution(models.TextChoices):
    NONE = "NONE", "Not a duplicate"
    SKIP = "SKIP", "Skip"
    MERGE = "MERGE", "Merge (fill blanks on existing)"
    UPDATE = "UPDATE", "Update existing"
    CREATE_NEW = "CREATE_NEW", "Create new anyway"


class MigrationTimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class MigrationBatch(MigrationTimeStampedModel):
    batch_number = models.CharField(max_length=20, unique=True, db_index=True)
    source_type = models.CharField(max_length=20, choices=MigrationSourceType.choices, db_index=True)
    dataset_key = models.CharField(max_length=40, db_index=True)
    status = models.CharField(
        max_length=20,
        choices=MigrationBatchStatus.choices,
        default=MigrationBatchStatus.UPLOADED,
        db_index=True,
    )
    original_filename = models.CharField(max_length=255, blank=True, default="")
    file_checksum_sha256 = models.CharField(max_length=64, blank=True, default="", db_index=True)
    file_size_bytes = models.PositiveBigIntegerField(default=0)
    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    warning_rows = models.PositiveIntegerField(default=0)
    error_rows = models.PositiveIntegerField(default=0)
    duplicate_rows = models.PositiveIntegerField(default=0)
    imported_rows = models.PositiveIntegerField(default=0)
    skipped_rows = models.PositiveIntegerField(default=0)
    failed_rows = models.PositiveIntegerField(default=0)
    mapping = models.JSONField(default=dict, blank=True)
    source_headers = models.JSONField(default=list, blank=True)
    preview_summary = models.JSONField(null=True, blank=True)
    reconciliation_snapshot = models.JSONField(null=True, blank=True)
    expected_total = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    import_started_at = models.DateTimeField(null=True, blank=True)
    import_finished_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="approved_migration_batches",
    )
    rolled_back_at = models.DateTimeField(null=True, blank=True)
    rolled_back_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="rolled_back_migration_batches",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="migration_batches",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "migration_center_batches"
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.batch_number} ({self.dataset_key})"

    @classmethod
    def next_batch_number(cls) -> str:
        year = timezone.now().year
        prefix = f"MB-{year}-"
        with transaction.atomic():
            last = (
                cls.objects.select_for_update()
                .filter(batch_number__startswith=prefix)
                .order_by("-batch_number")
                .values_list("batch_number", flat=True)
                .first()
            )
            seq = int(last.rsplit("-", 1)[-1]) + 1 if last else 1
        return f"{prefix}{seq:06d}"

    @property
    def duration_seconds(self) -> float | None:
        if self.import_started_at and self.import_finished_at:
            return (self.import_finished_at - self.import_started_at).total_seconds()
        return None


class MigrationStagingRow(MigrationTimeStampedModel):
    batch = models.ForeignKey(MigrationBatch, on_delete=models.CASCADE, related_name="rows")
    row_number = models.PositiveIntegerField(db_index=True)
    raw_data = models.JSONField(default=dict)
    mapped_data = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=15,
        choices=StagingRowStatus.choices,
        default=StagingRowStatus.PENDING,
        db_index=True,
    )
    errors = models.JSONField(default=list, blank=True)
    warnings = models.JSONField(default=list, blank=True)
    duplicate_matches = models.JSONField(default=list, blank=True)
    duplicate_resolution = models.CharField(
        max_length=12,
        choices=DuplicateResolution.choices,
        default=DuplicateResolution.NONE,
    )
    # Production write tracking — exactly what this row created/updated,
    # so rollback undoes only migration-created records.
    target_model = models.CharField(max_length=100, blank=True, default="")
    target_pk = models.PositiveBigIntegerField(null=True, blank=True, db_index=True)
    extra_targets = models.JSONField(default=list, blank=True)
    prior_state = models.JSONField(null=True, blank=True)
    import_error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "migration_center_staging_rows"
        ordering = ["batch_id", "row_number"]
        constraints = [
            models.UniqueConstraint(fields=["batch", "row_number"], name="uq_migration_staging_batch_row"),
        ]

    def __str__(self) -> str:
        return f"{self.batch.batch_number}#{self.row_number}"


class MigrationMappingRule(MigrationTimeStampedModel):
    name = models.CharField(max_length=120)
    dataset_key = models.CharField(max_length=40, db_index=True)
    source_type = models.CharField(max_length=20, choices=MigrationSourceType.choices, db_index=True)
    mapping = models.JSONField(default=dict)
    is_default = models.BooleanField(default=False, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="migration_mapping_rules",
    )

    class Meta:
        db_table = "migration_center_mapping_rules"
        ordering = ["dataset_key", "name", "id"]
        constraints = [
            models.UniqueConstraint(fields=["dataset_key", "source_type", "name"], name="uq_migration_mapping_rule"),
        ]

    def __str__(self) -> str:
        return f"{self.dataset_key}:{self.name}"


class MigrationAuditLog(MigrationTimeStampedModel):
    batch = models.ForeignKey(
        MigrationBatch, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs",
    )
    action = models.CharField(max_length=60, db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="migration_audit_logs",
    )
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "migration_center_audit_logs"
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.action} @ {self.created_at:%Y-%m-%d %H:%M}"
