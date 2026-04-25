from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from accounting.models import JournalEntry
from inventory.models import InventoryItem, InventoryItemType, StockLocation

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")


def generate_bom_no() -> str:
    return f"BOM-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"


def generate_production_job_no() -> str:
    return f"JOB-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"


def _status_locked(previous_status: str | None, next_status: str | None, *, allowed: set[tuple[str, str]]) -> bool:
    if previous_status is None:
        return False
    if previous_status == next_status:
        return False
    return (previous_status, next_status) not in allowed


def _guard_final_status(instance, *, immutable_statuses: set[str], allowed: set[tuple[str, str]] | None = None):
    if not instance.pk:
        return
    existing = instance.__class__.objects.filter(pk=instance.pk).only("status").first()
    if existing is None or existing.status not in immutable_statuses:
        return
    if _status_locked(existing.status, getattr(instance, "status", None), allowed=allowed or set()):
        raise ValidationError({"status": f"{instance.__class__.__name__} is immutable once it reaches {existing.status}."})


def _guard_posted_line(instance, *, flag_field: str = "is_posted"):
    if not instance.pk:
        return
    existing = instance.__class__.objects.filter(pk=instance.pk).only(flag_field).first()
    if existing is None or not getattr(existing, flag_field, False):
        return
    raise ValidationError({flag_field: f"{instance.__class__.__name__} is immutable once posted."})


class ManufacturingTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ManufacturingBomStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"


class ProductionJobStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    RELEASED = "RELEASED", "Released"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


class ManufacturingCostingStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    READY = "READY", "Ready"
    DEFERRED = "DEFERRED", "Deferred"


class ManufacturingAccountingStatus(models.TextChoices):
    NOT_REQUIRED = "NOT_REQUIRED", "Not Required"
    PENDING = "PENDING", "Pending"
    POSTED = "POSTED", "Posted"
    DEFERRED = "DEFERRED", "Deferred"


class ProductionMaterialEntryKind(models.TextChoices):
    ISSUE = "ISSUE", "Issue"
    RETURN = "RETURN", "Return"


class ManufacturingBom(ManufacturingTimeStampedModel):
    bom_no = models.CharField(max_length=40, unique=True, default=generate_bom_no, db_index=True)
    finished_good_inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="manufacturing_boms",
    )
    revision_no = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=12,
        choices=ManufacturingBomStatus.choices,
        default=ManufacturingBomStatus.DRAFT,
        db_index=True,
    )
    is_default = models.BooleanField(default=False, db_index=True)
    effective_from = models.DateField(null=True, blank=True, db_index=True)
    effective_to = models.DateField(null=True, blank=True, db_index=True)
    notes = models.TextField(blank=True, default="")
    activated_at = models.DateTimeField(null=True, blank=True, db_index=True)
    activated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="activated_manufacturing_boms",
    )

    class Meta:
        db_table = "manufacturing_boms"
        ordering = ["finished_good_inventory_item__product__name", "-revision_no", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["finished_good_inventory_item", "revision_no"],
                name="manufacturing_bom_unique_revision_per_fg",
            ),
            models.UniqueConstraint(
                fields=["finished_good_inventory_item"],
                condition=Q(is_default=True, status=ManufacturingBomStatus.ACTIVE),
                name="manufacturing_bom_single_active_default_per_fg",
            ),
        ]
        indexes = [
            models.Index(fields=["finished_good_inventory_item", "status", "revision_no"]),
        ]

    def clean(self):
        errors = {}
        if self.finished_good_inventory_item_id:
            fg_item = self.finished_good_inventory_item
            if not fg_item.stock_tracking_enabled:
                errors["finished_good_inventory_item"] = "Finished good BOM items must be stock-tracked."
            if fg_item.stock_item_type == InventoryItemType.RAW_MATERIAL:
                errors["finished_good_inventory_item"] = "Finished good BOM items cannot be raw-material profiles."
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            errors["effective_to"] = "Effective-to date cannot be earlier than effective-from date."
        if self.status == ManufacturingBomStatus.ACTIVE and not self.lines.exists() and self.pk:
            errors["status"] = "BOM must contain at least one line before activation."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _guard_final_status(
            self,
            immutable_statuses={ManufacturingBomStatus.ACTIVE},
            allowed={(ManufacturingBomStatus.ACTIVE, ManufacturingBomStatus.INACTIVE)},
        )
        self.bom_no = (self.bom_no or generate_bom_no()).strip().upper()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.bom_no


class ManufacturingBomLine(ManufacturingTimeStampedModel):
    bom = models.ForeignKey(
        ManufacturingBom,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="manufacturing_bom_lines",
    )
    quantity_per_unit = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    wastage_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00")), MaxValueValidator(Decimal("100.00"))],
    )
    sort_order = models.PositiveSmallIntegerField(default=1)
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "manufacturing_bom_lines"
        ordering = ["sort_order", "id"]

    def clean(self):
        errors = {}
        if self.inventory_item_id:
            item = self.inventory_item
            if not item.stock_tracking_enabled:
                errors["inventory_item"] = "BOM lines require stock-tracked inventory items."
            if item.stock_item_type not in {InventoryItemType.RAW_MATERIAL, InventoryItemType.ACCESSORY}:
                errors["inventory_item"] = "BOM lines must use raw-material or accessory inventory profiles."
            if self.bom_id and self.bom.finished_good_inventory_item_id == self.inventory_item_id:
                errors["inventory_item"] = "BOM line item cannot match the finished-good inventory item."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class ProductionJob(ManufacturingTimeStampedModel):
    job_no = models.CharField(max_length=40, unique=True, default=generate_production_job_no, db_index=True)
    job_date = models.DateField(default=timezone.localdate, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=ProductionJobStatus.choices,
        default=ProductionJobStatus.DRAFT,
        db_index=True,
    )
    bom = models.ForeignKey(
        ManufacturingBom,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="production_jobs",
    )
    finished_good_inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="production_jobs",
    )
    stock_location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="production_jobs",
    )
    planned_output_qty = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    completed_output_qty = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=QUANTITY_ZERO,
        validators=[MinValueValidator(QUANTITY_ZERO)],
    )
    total_issued_cost = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    total_received_cost = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    total_scrap_cost = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    wip_cost = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    # Phase 2: additional cost components for full production cost tracking
    labor_cost = models.DecimalField(
        max_digits=12, decimal_places=2, default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
        help_text="Direct labor cost for this production job.",
    )
    overhead_cost = models.DecimalField(
        max_digits=12, decimal_places=2, default=MONEY_ZERO,
        validators=[MinValueValidator(MONEY_ZERO)],
        help_text="Overhead (factory/admin) cost allocated to this job.",
    )
    costing_status = models.CharField(
        max_length=12,
        choices=ManufacturingCostingStatus.choices,
        default=ManufacturingCostingStatus.PENDING,
        db_index=True,
    )
    accounting_status = models.CharField(
        max_length=16,
        choices=ManufacturingAccountingStatus.choices,
        default=ManufacturingAccountingStatus.NOT_REQUIRED,
        db_index=True,
    )
    notes = models.TextField(blank=True, default="")
    posting_notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_production_jobs",
    )
    released_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="released_production_jobs",
    )
    released_at = models.DateTimeField(null=True, blank=True, db_index=True)
    started_at = models.DateTimeField(null=True, blank=True, db_index=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="completed_production_jobs",
    )
    completed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cancelled_production_jobs",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    cancel_reason = models.TextField(blank=True, default="")

    @property
    def raw_material_cost_total(self) -> Decimal:
        """Total material cost from issued materials (Phase 2 alias for total_issued_cost)."""
        return self.total_issued_cost or MONEY_ZERO

    @property
    def total_production_cost(self) -> Decimal:
        """Sum of material, labor, and overhead costs for this job."""
        return (
            (self.total_issued_cost or MONEY_ZERO)
            + (self.labor_cost or MONEY_ZERO)
            + (self.overhead_cost or MONEY_ZERO)
        )

    @property
    def finished_goods_unit_cost(self) -> Decimal:
        """Per-unit cost for completed output. Returns zero if no output recorded."""
        output_qty = self.completed_output_qty or QUANTITY_ZERO
        if output_qty <= QUANTITY_ZERO:
            return MONEY_ZERO
        return (self.total_production_cost / Decimal(str(output_qty))).quantize(Decimal("0.01"))

    class Meta:
        db_table = "manufacturing_production_jobs"
        ordering = ["-job_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "job_date"]),
            models.Index(fields=["finished_good_inventory_item", "status"]),
            models.Index(fields=["bom", "job_date"]),
        ]

    def clean(self):
        errors = {}
        if self.finished_good_inventory_item_id:
            fg_item = self.finished_good_inventory_item
            if not fg_item.stock_tracking_enabled:
                errors["finished_good_inventory_item"] = "Production jobs require stock-tracked finished goods."
            if fg_item.stock_item_type == InventoryItemType.RAW_MATERIAL:
                errors["finished_good_inventory_item"] = "Production jobs cannot target raw-material inventory profiles."
        if self.bom_id and self.bom.finished_good_inventory_item_id != self.finished_good_inventory_item_id:
            errors["bom"] = "Selected BOM must belong to the same finished-good inventory item."
        if self.completed_output_qty > self.planned_output_qty:
            errors["completed_output_qty"] = "Completed output cannot exceed planned output quantity."
        if self.status == ProductionJobStatus.COMPLETED:
            if self.completed_output_qty <= QUANTITY_ZERO:
                errors["completed_output_qty"] = "Completed jobs must have finished-goods output."
            if self.wip_cost != MONEY_ZERO:
                errors["wip_cost"] = "Completed jobs must not leave residual WIP cost."
        if self.status == ProductionJobStatus.CANCELLED and not (self.cancel_reason or "").strip():
            errors["cancel_reason"] = "Cancelled jobs must store a cancellation reason."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _guard_final_status(
            self,
            immutable_statuses={ProductionJobStatus.COMPLETED, ProductionJobStatus.CANCELLED},
        )
        self.job_no = (self.job_no or generate_production_job_no()).strip().upper()
        self.notes = (self.notes or "").strip()
        self.posting_notes = (self.posting_notes or "").strip()
        self.cancel_reason = (self.cancel_reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.job_no


class ProductionMaterialIssueLine(ManufacturingTimeStampedModel):
    production_job = models.ForeignKey(
        ProductionJob,
        on_delete=models.CASCADE,
        related_name="material_issue_lines",
    )
    bom_line = models.ForeignKey(
        ManufacturingBomLine,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="production_issue_lines",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="production_material_issue_lines",
    )
    entry_kind = models.CharField(
        max_length=10,
        choices=ProductionMaterialEntryKind.choices,
        default=ProductionMaterialEntryKind.ISSUE,
        db_index=True,
    )
    description = models.CharField(max_length=255)
    planned_quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=QUANTITY_ZERO,
        validators=[MinValueValidator(QUANTITY_ZERO)],
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    unit_cost_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    line_total_cost = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    notes = models.TextField(blank=True, default="")
    is_posted = models.BooleanField(default=False, db_index=True)
    posted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_production_material_issue_lines",
    )
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="production_material_issue_line",
    )

    class Meta:
        db_table = "manufacturing_production_material_issue_lines"
        ordering = ["id"]
        indexes = [
            models.Index(fields=["production_job", "is_posted", "entry_kind"]),
        ]

    def clean(self):
        errors = {}
        if self.inventory_item_id:
            item = self.inventory_item
            if not item.stock_tracking_enabled:
                errors["inventory_item"] = "Material issue lines require stock-tracked inventory items."
            if item.stock_item_type not in {InventoryItemType.RAW_MATERIAL, InventoryItemType.ACCESSORY}:
                errors["inventory_item"] = "Material issue lines must use raw-material or accessory items."
            if self.production_job_id and self.production_job.finished_good_inventory_item_id == self.inventory_item_id:
                errors["inventory_item"] = "Material issue lines cannot target the finished-good inventory item."
        if self.bom_line_id and self.production_job_id and self.production_job.bom_id:
            if self.bom_line.bom_id != self.production_job.bom_id:
                errors["bom_line"] = "BOM line must belong to the production job BOM."
        if self.unit_cost_snapshot is not None:
            expected_total = (Decimal(str(self.quantity or QUANTITY_ZERO)) * Decimal(str(self.unit_cost_snapshot))).quantize(Decimal("0.01"))
            if abs(Decimal(str(self.line_total_cost or MONEY_ZERO)) - expected_total) > Decimal("0.01"):
                errors["line_total_cost"] = "Line total cost must equal quantity multiplied by unit cost snapshot."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _guard_posted_line(self)
        self.description = (self.description or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class ProductionReceiptLine(ManufacturingTimeStampedModel):
    production_job = models.ForeignKey(
        ProductionJob,
        on_delete=models.CASCADE,
        related_name="receipt_lines",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="production_receipt_lines",
    )
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    unit_cost_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    line_total_cost = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    notes = models.TextField(blank=True, default="")
    is_posted = models.BooleanField(default=False, db_index=True)
    posted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_production_receipt_lines",
    )
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="production_receipt_line",
    )

    class Meta:
        db_table = "manufacturing_production_receipt_lines"
        ordering = ["id"]
        indexes = [
            models.Index(fields=["production_job", "is_posted"]),
        ]

    def clean(self):
        errors = {}
        if self.production_job_id and self.inventory_item_id:
            if self.production_job.finished_good_inventory_item_id != self.inventory_item_id:
                errors["inventory_item"] = "Receipt lines must target the production job finished-good inventory item."
        if self.unit_cost_snapshot is not None:
            expected_total = (Decimal(str(self.quantity or QUANTITY_ZERO)) * Decimal(str(self.unit_cost_snapshot))).quantize(Decimal("0.01"))
            if abs(Decimal(str(self.line_total_cost or MONEY_ZERO)) - expected_total) > Decimal("0.01"):
                errors["line_total_cost"] = "Line total cost must equal quantity multiplied by unit cost snapshot."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _guard_posted_line(self)
        self.description = (self.description or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class ProductionScrapLine(ManufacturingTimeStampedModel):
    production_job = models.ForeignKey(
        ProductionJob,
        on_delete=models.CASCADE,
        related_name="scrap_lines",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="production_scrap_lines",
    )
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    unit_cost_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    line_total_cost = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    reason = models.CharField(max_length=120)
    notes = models.TextField(blank=True, default="")
    is_posted = models.BooleanField(default=False, db_index=True)
    posted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_production_scrap_lines",
    )
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="production_scrap_line",
    )

    class Meta:
        db_table = "manufacturing_production_scrap_lines"
        ordering = ["id"]
        indexes = [
            models.Index(fields=["production_job", "is_posted"]),
        ]

    def clean(self):
        errors = {}
        if self.unit_cost_snapshot is not None:
            expected_total = (Decimal(str(self.quantity or QUANTITY_ZERO)) * Decimal(str(self.unit_cost_snapshot))).quantize(Decimal("0.01"))
            if abs(Decimal(str(self.line_total_cost or MONEY_ZERO)) - expected_total) > Decimal("0.01"):
                errors["line_total_cost"] = "Line total cost must equal quantity multiplied by unit cost snapshot."
        if not (self.reason or "").strip():
            errors["reason"] = "Scrap reason is required."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        _guard_posted_line(self)
        self.description = (self.description or "").strip()
        self.reason = (self.reason or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)
