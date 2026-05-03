from __future__ import annotations

import secrets
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q, Sum
from django.utils import timezone

from accounting.models import FinanceAccount, JournalEntry, Vendor
from subscriptions.models import Product

MONEY_ZERO = Decimal("0.00")
QUANTITY_ZERO = Decimal("0.000")


def _default_branch():
    try:
        from branch_control.services.branch_service import default_branch_for_model

        return default_branch_for_model()
    except Exception:
        return None


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


class InventoryTimeStampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class InventoryValuationMethod(models.TextChoices):
    FIFO = "FIFO", "FIFO"
    AVG = "AVG", "Average"


class InventoryItemType(models.TextChoices):
    FINISHED_GOOD = "FINISHED_GOOD", "Finished Good"
    ACCESSORY = "ACCESSORY", "Accessory"
    RAW_MATERIAL = "RAW_MATERIAL", "Raw Material"


class StockLocationType(models.TextChoices):
    STORE = "STORE", "Store"
    WAREHOUSE = "WAREHOUSE", "Warehouse"
    SHOWROOM = "SHOWROOM", "Showroom"


class StockMovementType(models.TextChoices):
    OPENING_BALANCE_IN = "OPENING_BALANCE_IN", "Opening Balance In"
    PURCHASE_IN = "PURCHASE_IN", "Purchase In"
    # Phase 2 alias kept for API compatibility: PURCHASE_RECEIVE → PURCHASE_IN
    PURCHASE_RECEIVE = "PURCHASE_RECEIVE", "Purchase Receive"
    SALE_OUT = "SALE_OUT", "Sale Out"
    EMI_DELIVERY_OUT = "EMI_DELIVERY_OUT", "EMI Delivery Out"
    # Phase 2 alias: DELIVERY_OUT → EMI_DELIVERY_OUT (physical stock reduction)
    DELIVERY_OUT = "DELIVERY_OUT", "Delivery Out"
    EMI_RETURN_IN = "EMI_RETURN_IN", "EMI Return In"
    # Phase 2: CUSTOMER_RETURN → maps to customer-returned stock
    CUSTOMER_RETURN = "CUSTOMER_RETURN", "Customer Return"
    SALE_RETURN_IN = "SALE_RETURN_IN", "Sale Return In"
    PRODUCTION_ISSUE_OUT = "PRODUCTION_ISSUE_OUT", "Production Issue Out"
    # Phase 2 alias: PRODUCTION_CONSUME → PRODUCTION_ISSUE_OUT
    PRODUCTION_CONSUME = "PRODUCTION_CONSUME", "Production Consume"
    PRODUCTION_RETURN_IN = "PRODUCTION_RETURN_IN", "Production Return In"
    PRODUCTION_RECEIPT_IN = "PRODUCTION_RECEIPT_IN", "Production Receipt In"
    # Phase 2 alias: PRODUCTION_OUTPUT → PRODUCTION_RECEIPT_IN
    PRODUCTION_OUTPUT = "PRODUCTION_OUTPUT", "Production Output"
    PURCHASE_RETURN_OUT = "PURCHASE_RETURN_OUT", "Purchase Return Out"
    # Phase 2 alias: VENDOR_RETURN → PURCHASE_RETURN_OUT
    VENDOR_RETURN = "VENDOR_RETURN", "Vendor Return"
    ADJUSTMENT_IN = "ADJUSTMENT_IN", "Adjustment In"
    ADJUSTMENT_OUT = "ADJUSTMENT_OUT", "Adjustment Out"
    # Phase 2 alias: STOCK_ADJUSTMENT covers both in/out
    STOCK_ADJUSTMENT = "STOCK_ADJUSTMENT", "Stock Adjustment"
    TRANSFER_IN = "TRANSFER_IN", "Transfer In"
    TRANSFER_OUT = "TRANSFER_OUT", "Transfer Out"
    # Phase 2: soft-hold / release for committed orders (does not reduce physical stock)
    SALE_RESERVE = "SALE_RESERVE", "Sale Reserve (Soft Hold)"
    SALE_RELEASE = "SALE_RELEASE", "Sale Release (Reservation Released)"
    # Phase 2: damage, quality, maintenance holds
    DAMAGE = "DAMAGE", "Damage Write-off"
    MAINTENANCE_HOLD = "MAINTENANCE_HOLD", "Maintenance Hold"
    MAINTENANCE_RELEASE = "MAINTENANCE_RELEASE", "Maintenance Release"
    QUALITY_HOLD = "QUALITY_HOLD", "Quality Hold"
    QUALITY_RELEASE = "QUALITY_RELEASE", "Quality Release"


# Movement types that are soft holds / releases and do NOT affect physical stock.
# Used by StockMovementService and current_stock_quantity() to exclude reservation
# entries from physical-stock calculations.
SOFT_HOLD_MOVEMENT_TYPES: frozenset[str] = frozenset([
    StockMovementType.SALE_RESERVE,
    StockMovementType.SALE_RELEASE,
    StockMovementType.MAINTENANCE_HOLD,
    StockMovementType.MAINTENANCE_RELEASE,
    StockMovementType.QUALITY_HOLD,
    StockMovementType.QUALITY_RELEASE,
])


class StockAdjustmentStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    APPROVED = "APPROVED", "Approved"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class PurchaseBillStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    APPROVED = "APPROVED", "Approved"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class PurchaseTaxMode(models.TextChoices):
    GST = "GST", "GST"
    NON_GST = "NON_GST", "Non-GST"


class StockLocation(InventoryTimeStampedModel):
    code = models.CharField(max_length=30, unique=True, db_index=True)
    name = models.CharField(max_length=120, unique=True)
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="stock_locations",
    )
    location_type = models.CharField(
        max_length=20,
        choices=StockLocationType.choices,
        default=StockLocationType.STORE,
        db_index=True,
    )
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "inventory_stock_locations"
        ordering = ["name", "id"]
        indexes = [
            models.Index(fields=["is_active", "location_type"]),
            models.Index(fields=["branch", "is_active"]),
        ]

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.notes = (self.notes or "").strip()
        if self.branch_id is None:
            self.branch = _default_branch()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


class InventoryItem(InventoryTimeStampedModel):
    product = models.OneToOneField(
        Product,
        on_delete=models.PROTECT,
        related_name="inventory_profile",
    )
    sku = models.CharField(max_length=60, unique=True, null=True, blank=True, db_index=True)
    unit_of_measure = models.CharField(max_length=30, default="PCS")
    default_stock_location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name="inventory_items",
        null=True,
        blank=True,
    )
    stock_tracking_enabled = models.BooleanField(default=True, db_index=True)
    stock_item_type = models.CharField(
        max_length=20,
        choices=InventoryItemType.choices,
        default=InventoryItemType.FINISHED_GOOD,
        db_index=True,
    )
    delivery_stock_bridge_enabled = models.BooleanField(default=True, db_index=True)
    opening_stock_qty = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=QUANTITY_ZERO,
        validators=[MinValueValidator(QUANTITY_ZERO)],
    )
    reorder_level_qty = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=QUANTITY_ZERO,
        validators=[MinValueValidator(QUANTITY_ZERO)],
    )
    valuation_method = models.CharField(
        max_length=10,
        choices=InventoryValuationMethod.choices,
        default=InventoryValuationMethod.FIFO,
        db_index=True,
    )
    standard_unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "inventory_items"
        ordering = ["product__name", "id"]
        indexes = [
            models.Index(fields=["stock_tracking_enabled", "is_active"]),
        ]

    def save(self, *args, **kwargs):
        product_sku = ((getattr(self.product, "sku", None) or "")).strip().upper() or None
        product_uom = ((getattr(self.product, "unit_of_measure", None) or "PCS")).strip().upper()
        self.sku = ((self.sku or product_sku or "").strip().upper()) or None
        self.unit_of_measure = (self.unit_of_measure or product_uom or "PCS").strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)

        product_updates: list[str] = []
        if self.sku and getattr(self.product, "sku", None) != self.sku:
            self.product.sku = self.sku
            product_updates.append("sku")
        if getattr(self.product, "unit_of_measure", None) != self.unit_of_measure:
            self.product.unit_of_measure = self.unit_of_measure
            product_updates.append("unit_of_measure")
        if product_updates:
            Product.objects.filter(pk=self.product_id).update(
                **{field: getattr(self.product, field) for field in product_updates}
            )

    def current_stock_quantity(self) -> Decimal:
        """Physical stock: excludes soft-hold (reservation) entries."""
        aggregate = self.stock_ledger.exclude(
            movement_type__in=list(SOFT_HOLD_MOVEMENT_TYPES)
        ).aggregate(
            total_in=Sum("quantity_in"),
            total_out=Sum("quantity_out"),
        )
        total_in = Decimal(str(aggregate["total_in"] or QUANTITY_ZERO))
        total_out = Decimal(str(aggregate["total_out"] or QUANTITY_ZERO))
        return total_in - total_out + Decimal(str(self.opening_stock_qty or QUANTITY_ZERO))

    def reserved_qty(self) -> Decimal:
        """
        Quantity currently soft-reserved via SALE_RESERVE minus SALE_RELEASE.
        This represents committed stock not yet physically consumed.
        """
        aggregate = self.stock_ledger.filter(
            movement_type__in=[
                StockMovementType.SALE_RESERVE,
                StockMovementType.SALE_RELEASE,
            ]
        ).aggregate(
            reserved_in=Sum("quantity_in"),
            reserved_out=Sum("quantity_out"),
        )
        reserved_in = Decimal(str(aggregate["reserved_in"] or QUANTITY_ZERO))
        reserved_out = Decimal(str(aggregate["reserved_out"] or QUANTITY_ZERO))
        # SALE_RESERVE uses quantity_in; SALE_RELEASE uses quantity_out
        return max(QUANTITY_ZERO, reserved_in - reserved_out)

    def available_qty(self) -> Decimal:
        """
        Available-to-promise: physical stock minus soft reservations.
        This is the actionable quantity for new commitments.
        """
        return max(QUANTITY_ZERO, self.current_stock_quantity() - self.reserved_qty())

    def available_to_commit_qty(self) -> Decimal:
        """Operational alias used by ERP/workspace summaries (same as available_qty)."""
        return self.available_qty()

    @property
    def low_stock_threshold(self) -> Decimal:
        """Alias for reorder_level_qty — used in Phase 2 purchase suggestion logic."""
        return self.reorder_level_qty

    def __str__(self):
        return self.sku or self.product.product_code


class StockLedger(InventoryTimeStampedModel):
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="stock_ledger",
    )
    movement_type = models.CharField(
        max_length=30,
        choices=StockMovementType.choices,
        db_index=True,
    )
    quantity_in = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=QUANTITY_ZERO,
        validators=[MinValueValidator(QUANTITY_ZERO)],
    )
    quantity_out = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        default=QUANTITY_ZERO,
        validators=[MinValueValidator(QUANTITY_ZERO)],
    )
    movement_date = models.DateField(db_index=True)
    stock_location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name="stock_ledger_entries",
        null=True,
        blank=True,
    )
    reference_model = models.CharField(max_length=100, db_index=True)
    reference_id = models.CharField(max_length=100, db_index=True)
    warehouse_name = models.CharField(max_length=120, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_stock_ledger_entries",
    )
    posted_journal_entry = models.ForeignKey(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="stock_ledger_entries",
    )

    class Meta:
        db_table = "inventory_stock_ledger"
        ordering = ["-movement_date", "-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity_in__gte=QUANTITY_ZERO),
                name="inventory_stock_quantity_in_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(quantity_out__gte=QUANTITY_ZERO),
                name="inventory_stock_quantity_out_non_negative",
            ),
            models.CheckConstraint(
                condition=(
                    (Q(quantity_in__gt=QUANTITY_ZERO) & Q(quantity_out=QUANTITY_ZERO))
                    | (Q(quantity_out__gt=QUANTITY_ZERO) & Q(quantity_in=QUANTITY_ZERO))
                ),
                name="inventory_stock_exactly_one_side_positive",
            ),
            models.UniqueConstraint(
                fields=["inventory_item", "movement_type", "reference_model", "reference_id"],
                name="inventory_stock_unique_reference_movement",
            ),
        ]
        indexes = [
            models.Index(fields=["inventory_item", "movement_date", "movement_type"]),
            models.Index(fields=["stock_location", "movement_date", "movement_type"]),
            models.Index(fields=["reference_model", "reference_id"]),
        ]

    def clean(self):
        errors = {}
        if (self.quantity_in or QUANTITY_ZERO) == QUANTITY_ZERO and (
            self.quantity_out or QUANTITY_ZERO
        ) == QUANTITY_ZERO:
            errors["quantity_in"] = "Either quantity_in or quantity_out must be greater than zero."
            errors["quantity_out"] = "Either quantity_in or quantity_out must be greater than zero."
        if (self.quantity_in or QUANTITY_ZERO) > QUANTITY_ZERO and (
            self.quantity_out or QUANTITY_ZERO
        ) > QUANTITY_ZERO:
            errors["quantity_in"] = "Only one stock side can be positive."
            errors["quantity_out"] = "Only one stock side can be positive."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.reference_model = (self.reference_model or "").strip()
        self.reference_id = (self.reference_id or "").strip()
        self.warehouse_name = (self.warehouse_name or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.inventory_item} {self.movement_type}"


class StockAdjustment(InventoryTimeStampedModel):
    adjustment_no = models.CharField(max_length=40, unique=True, db_index=True)
    adjustment_date = models.DateField(db_index=True)
    status = models.CharField(
        max_length=12,
        choices=StockAdjustmentStatus.choices,
        default=StockAdjustmentStatus.DRAFT,
        db_index=True,
    )
    reason = models.TextField(blank=True, default="")
    stock_location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name="stock_adjustments",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_stock_adjustments",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_stock_adjustments",
    )
    approved_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="posted_stock_adjustments",
    )
    posted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="stock_adjustment",
    )

    class Meta:
        db_table = "inventory_stock_adjustments"
        ordering = ["-adjustment_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "adjustment_date"]),
        ]

    def save(self, *args, **kwargs):
        _guard_final_status(
            self,
            immutable_statuses={
                StockAdjustmentStatus.APPROVED,
                StockAdjustmentStatus.POSTED,
                StockAdjustmentStatus.CANCELLED,
            },
            allowed={
                (StockAdjustmentStatus.APPROVED, StockAdjustmentStatus.POSTED),
                (StockAdjustmentStatus.APPROVED, StockAdjustmentStatus.CANCELLED),
            },
        )
        self.adjustment_no = (self.adjustment_no or "").strip().upper()
        self.reason = (self.reason or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.adjustment_no


class StockAdjustmentLine(InventoryTimeStampedModel):
    stock_adjustment = models.ForeignKey(
        StockAdjustment,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="adjustment_lines",
    )
    quantity_delta = models.DecimalField(max_digits=12, decimal_places=3)
    notes = models.CharField(max_length=255, blank=True, default="")
    # Frozen unit economic cost used for valuation / bridge posting (not selling price).
    unit_cost_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    # abs(quantity_delta) * unit_cost_snapshot at successful post time (audit trail).
    valuation_amount_snapshot = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )

    class Meta:
        db_table = "inventory_stock_adjustment_lines"
        ordering = ["id"]

    def clean(self):
        if self.quantity_delta in {None, QUANTITY_ZERO}:
            raise ValidationError({"quantity_delta": "Quantity delta must be non-zero."})

    def save(self, *args, **kwargs):
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class OpeningStockBatch(InventoryTimeStampedModel):
    """CSV import identity / audit envelope (additive; duplicate-safe imports)."""

    batch_key = models.CharField(max_length=64, unique=True, db_index=True)
    original_filename = models.CharField(max_length=255, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opening_stock_batches",
    )
    last_preview_payload = models.JSONField(null=True, blank=True)
    last_apply_summary = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "inventory_opening_stock_batches"
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.batch_key


class OpeningStockEntryStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class OpeningStockEntrySource(models.TextChoices):
    MANUAL = "MANUAL", "Manual"
    CSV_IMPORT = "CSV_IMPORT", "CSV Import"


class OpeningStockEntry(InventoryTimeStampedModel):
    """
    Auditable opening-stock workflow row (draft → posted ledger movement).
    Posted rows are immutable; corrections use StockAdjustment drafts.
    """

    batch = models.ForeignKey(
        OpeningStockBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="entries",
    )
    csv_row_number = models.PositiveIntegerField(null=True, blank=True)
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="opening_stock_entries",
    )
    stock_location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name="opening_stock_entries",
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(QUANTITY_ZERO)],
    )
    unit_cost_snapshot = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    valuation_amount_snapshot = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    effective_date = models.DateField(db_index=True)
    note = models.TextField(blank=True, default="")
    status = models.CharField(
        max_length=12,
        choices=OpeningStockEntryStatus.choices,
        default=OpeningStockEntryStatus.DRAFT,
        db_index=True,
    )
    source = models.CharField(
        max_length=16,
        choices=OpeningStockEntrySource.choices,
        default=OpeningStockEntrySource.MANUAL,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_opening_stock_entries",
    )
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="posted_opening_stock_entries",
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    correction_adjustment = models.ForeignKey(
        StockAdjustment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opening_stock_correction_for_entries",
    )

    class Meta:
        db_table = "inventory_opening_stock_entries"
        ordering = ["-effective_date", "-id"]
        indexes = [
            models.Index(fields=["status", "effective_date"]),
            models.Index(fields=["inventory_item", "stock_location", "effective_date"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("batch", "csv_row_number"),
                condition=models.Q(batch__isnull=False) & models.Q(csv_row_number__isnull=False),
                name="opening_stock_entry_batch_csv_row_uniq",
            ),
        ]

    def save(self, *args, **kwargs):
        self.note = (self.note or "").strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"OSE-{self.pk}:{self.inventory_item_id}:{self.status}"


class PurchaseBill(InventoryTimeStampedModel):
    bill_no = models.CharField(max_length=60, unique=True, db_index=True)
    bill_date = models.DateField(db_index=True)
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.PROTECT,
        related_name="purchase_bills",
    )
    tax_mode = models.CharField(
        max_length=10,
        choices=PurchaseTaxMode.choices,
        default=PurchaseTaxMode.GST,
        db_index=True,
    )
    status = models.CharField(
        max_length=12,
        choices=PurchaseBillStatus.choices,
        default=PurchaseBillStatus.DRAFT,
        db_index=True,
    )
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="purchase_bills",
    )
    stock_location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="purchase_bills",
    )
    finance_account = models.ForeignKey(
        FinanceAccount,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="purchase_bills",
    )
    posted_journal_entry = models.OneToOneField(
        JournalEntry,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="purchase_bill",
    )
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "inventory_purchase_bills"
        ordering = ["-bill_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "bill_date"]),
            models.Index(fields=["vendor", "bill_date"]),
            models.Index(fields=["branch", "bill_date"]),
        ]

    def save(self, *args, **kwargs):
        _guard_final_status(
            self,
            immutable_statuses={
                PurchaseBillStatus.APPROVED,
                PurchaseBillStatus.POSTED,
                PurchaseBillStatus.CANCELLED,
            },
            allowed={
                (PurchaseBillStatus.APPROVED, PurchaseBillStatus.POSTED),
                (PurchaseBillStatus.APPROVED, PurchaseBillStatus.CANCELLED),
            },
        )
        self.bill_no = (self.bill_no or "").strip().upper()
        self.notes = (self.notes or "").strip()
        if self.branch_id is None:
            self.branch = (
                getattr(self.stock_location, "branch", None)
                or getattr(self.finance_account, "branch", None)
                or _default_branch()
            )
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.bill_no


class PurchaseBillLine(InventoryTimeStampedModel):
    purchase_bill = models.ForeignKey(
        PurchaseBill,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="purchase_bill_lines",
    )
    description = models.CharField(max_length=255, blank=True, default="")
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(MONEY_ZERO)],
    )
    taxable_value = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)

    class Meta:
        db_table = "inventory_purchase_bill_lines"
        ordering = ["id"]

    def clean(self):
        expected_total = Decimal(str(self.taxable_value or MONEY_ZERO)) + Decimal(
            str(self.tax_amount or MONEY_ZERO)
        )
        if self.line_total != expected_total:
            raise ValidationError({"line_total": "Line total must equal taxable value plus tax amount."})

    def save(self, *args, **kwargs):
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class PurchaseOrderStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SENT = "SENT", "Sent"
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED", "Partially Received"
    RECEIVED = "RECEIVED", "Received"
    BILLED = "BILLED", "Billed"
    CANCELLED = "CANCELLED", "Cancelled"


class GoodsReceiptStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    RECEIVED = "RECEIVED", "Received"
    CANCELLED = "CANCELLED", "Cancelled"


class VendorBillStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class VendorPaymentStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    POSTED = "POSTED", "Posted"
    CANCELLED = "CANCELLED", "Cancelled"


class VendorContact(InventoryTimeStampedModel):
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.CASCADE,
        related_name="inventory_contacts",
    )
    name = models.CharField(max_length=120)
    designation = models.CharField(max_length=80, blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    is_primary = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "inventory_vendor_contacts"
        ordering = ["vendor_id", "-is_primary", "name", "id"]
        indexes = [models.Index(fields=["vendor", "is_primary", "is_active"])]

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.designation = (self.designation or "").strip()
        self.phone = (self.phone or "").strip()
        if self.is_primary:
            self.__class__.objects.filter(vendor=self.vendor, is_primary=True).exclude(pk=self.pk).update(is_primary=False)
        self.full_clean()
        super().save(*args, **kwargs)


class PurchaseOrder(InventoryTimeStampedModel):
    po_no = models.CharField(max_length=60, unique=True, db_index=True)
    po_date = models.DateField(db_index=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="purchase_orders")
    status = models.CharField(max_length=20, choices=PurchaseOrderStatus.choices, default=PurchaseOrderStatus.DRAFT, db_index=True)
    expected_date = models.DateField(null=True, blank=True)
    branch = models.ForeignKey("branch_control.Branch", on_delete=models.PROTECT, null=True, blank=True, related_name="purchase_orders")
    stock_location = models.ForeignKey(StockLocation, on_delete=models.PROTECT, null=True, blank=True, related_name="purchase_orders")
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "inventory_purchase_orders"
        ordering = ["-po_date", "-created_at", "-id"]

    def save(self, *args, **kwargs):
        if self.pk:
            existing = PurchaseOrder.objects.filter(pk=self.pk).only("status").first()
            if existing and existing.status == PurchaseOrderStatus.CANCELLED and self.status != PurchaseOrderStatus.CANCELLED:
                raise ValidationError({"status": "Cancelled purchase orders cannot be changed."})
        self.po_no = (self.po_no or "").strip().upper()
        self.notes = (self.notes or "").strip()
        if self.branch_id is None:
            self.branch = getattr(self.stock_location, "branch", None) or _default_branch()
        self.full_clean()
        super().save(*args, **kwargs)


class PurchaseOrderLine(InventoryTimeStampedModel):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="lines")
    inventory_item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, related_name="purchase_order_lines")
    description = models.CharField(max_length=255, blank=True, default="")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(MONEY_ZERO)])
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)

    class Meta:
        db_table = "inventory_purchase_order_lines"
        ordering = ["id"]

    def save(self, *args, **kwargs):
        self.description = (self.description or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class GoodsReceipt(InventoryTimeStampedModel):
    receipt_no = models.CharField(max_length=60, unique=True, db_index=True)
    receipt_date = models.DateField(db_index=True)
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.PROTECT, related_name="receipts")
    status = models.CharField(max_length=12, choices=GoodsReceiptStatus.choices, default=GoodsReceiptStatus.DRAFT, db_index=True)
    branch = models.ForeignKey("branch_control.Branch", on_delete=models.PROTECT, null=True, blank=True, related_name="goods_receipts")
    stock_location = models.ForeignKey(StockLocation, on_delete=models.PROTECT, null=True, blank=True, related_name="goods_receipts")
    notes = models.TextField(blank=True, default="")
    posted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    posted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="posted_goods_receipts")

    class Meta:
        db_table = "inventory_goods_receipts"
        ordering = ["-receipt_date", "-created_at", "-id"]

    def save(self, *args, **kwargs):
        self.receipt_no = (self.receipt_no or "").strip().upper()
        self.notes = (self.notes or "").strip()
        if self.branch_id is None:
            self.branch = getattr(self.stock_location, "branch", None) or getattr(self.purchase_order, "branch", None) or _default_branch()
        self.full_clean()
        super().save(*args, **kwargs)


class GoodsReceiptLine(InventoryTimeStampedModel):
    goods_receipt = models.ForeignKey(GoodsReceipt, on_delete=models.CASCADE, related_name="lines")
    purchase_order_line = models.ForeignKey(PurchaseOrderLine, on_delete=models.PROTECT, related_name="receipt_lines", null=True, blank=True)
    inventory_item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, related_name="goods_receipt_lines")
    quantity_received = models.DecimalField(max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(MONEY_ZERO)])
    notes = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "inventory_goods_receipt_lines"
        ordering = ["id"]


class VendorBill(InventoryTimeStampedModel):
    bill_no = models.CharField(max_length=60, unique=True, db_index=True)
    bill_date = models.DateField(db_index=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="vendor_bills")
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.PROTECT, related_name="vendor_bills", null=True, blank=True)
    goods_receipt = models.ForeignKey(GoodsReceipt, on_delete=models.PROTECT, related_name="vendor_bills", null=True, blank=True)
    finance_account = models.ForeignKey(FinanceAccount, on_delete=models.PROTECT, null=True, blank=True, related_name="vendor_bills")
    status = models.CharField(max_length=12, choices=VendorBillStatus.choices, default=VendorBillStatus.DRAFT, db_index=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    posted_journal_entry = models.OneToOneField(JournalEntry, on_delete=models.PROTECT, null=True, blank=True, related_name="vendor_bill")
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "inventory_vendor_bills"
        ordering = ["-bill_date", "-created_at", "-id"]


class VendorBillLine(InventoryTimeStampedModel):
    vendor_bill = models.ForeignKey(VendorBill, on_delete=models.CASCADE, related_name="lines")
    inventory_item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, related_name="vendor_bill_lines")
    description = models.CharField(max_length=255, blank=True, default="")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(MONEY_ZERO)])
    taxable_value = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=MONEY_ZERO)

    class Meta:
        db_table = "inventory_vendor_bill_lines"
        ordering = ["id"]


class VendorPayment(InventoryTimeStampedModel):
    payment_no = models.CharField(max_length=60, unique=True, db_index=True)
    payment_date = models.DateField(db_index=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="vendor_payments")
    vendor_bill = models.ForeignKey(VendorBill, on_delete=models.PROTECT, related_name="payments", null=True, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    finance_account = models.ForeignKey(FinanceAccount, on_delete=models.PROTECT, related_name="vendor_payments")
    status = models.CharField(max_length=12, choices=VendorPaymentStatus.choices, default=VendorPaymentStatus.DRAFT, db_index=True)
    posted_journal_entry = models.OneToOneField(JournalEntry, on_delete=models.PROTECT, null=True, blank=True, related_name="vendor_payment")
    reference_no = models.CharField(max_length=80, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "inventory_vendor_payments"
        ordering = ["-payment_date", "-created_at", "-id"]

class InventoryValuation(InventoryTimeStampedModel):
    as_of_date = models.DateField(db_index=True)
    method = models.CharField(
        max_length=10,
        choices=InventoryValuationMethod.choices,
        default=InventoryValuationMethod.FIFO,
        db_index=True,
    )
    totals_json = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="inventory_valuations",
    )

    class Meta:
        db_table = "inventory_valuations"
        ordering = ["-as_of_date", "-created_at", "-id"]
        indexes = [
            models.Index(fields=["as_of_date", "method"]),
        ]

    def save(self, *args, **kwargs):
        if self.totals_json is None:
            self.totals_json = {}
        self.full_clean()
        super().save(*args, **kwargs)


class InternalStockMovementType(models.TextChoices):
    IN = "IN", "In"
    OUT = "OUT", "Out"
    RESERVED = "RESERVED", "Reserved"
    RELEASED = "RELEASED", "Released"
    ADJUSTMENT = "ADJUSTMENT", "Adjustment"


class StockReservationStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    RELEASED = "RELEASED", "Released"


class PurchaseNeedStatus(models.TextChoices):
    OPEN = "OPEN", "Open"
    IN_REVIEW = "IN_REVIEW", "In Review"
    ORDERED = "ORDERED", "Ordered"
    PARTIALLY_FULFILLED = "PARTIALLY_FULFILLED", "Partially Fulfilled"
    RECEIVED = "RECEIVED", "Received"
    FULFILLED = "FULFILLED", "Fulfilled"
    CANCELLED = "CANCELLED", "Cancelled"
    CLOSED = "CLOSED", "Closed"


class Warehouse(InventoryTimeStampedModel):
    code = models.CharField(max_length=30, unique=True, db_index=True)
    name = models.CharField(max_length=120)
    stock_location = models.OneToOneField(
        StockLocation,
        on_delete=models.PROTECT,
        related_name="warehouse_profile",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "inventory_warehouses"
        ordering = ["name", "id"]
        indexes = [models.Index(fields=["is_active", "code"])]

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.notes = (self.notes or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class StockLedgerEntry(InventoryTimeStampedModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="inventory_stock_ledger_entries",
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name="stock_ledger_entries",
    )
    movement_type = models.CharField(
        max_length=20,
        choices=InternalStockMovementType.choices,
        db_index=True,
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    source_module = models.CharField(max_length=160, db_index=True)
    source_object_id = models.CharField(max_length=120, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="inventory_stock_ledger_entries",
    )
    note = models.TextField(blank=True, default="")

    class Meta:
        db_table = "inventory_stock_ledger_entries"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["product", "warehouse", "movement_type"]),
            models.Index(fields=["source_module", "source_object_id"]),
        ]

    def save(self, *args, **kwargs):
        self.source_module = (self.source_module or "").strip()
        self.source_object_id = (self.source_object_id or "").strip()
        self.note = (self.note or "").strip()
        self.full_clean()
        super().save(*args, **kwargs)


class StockReservation(InventoryTimeStampedModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="stock_reservations",
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name="stock_reservations",
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    status = models.CharField(
        max_length=12,
        choices=StockReservationStatus.choices,
        default=StockReservationStatus.ACTIVE,
        db_index=True,
    )
    source_module = models.CharField(max_length=160, db_index=True)
    source_object_id = models.CharField(max_length=120, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_stock_reservations",
    )
    released_at = models.DateTimeField(null=True, blank=True, db_index=True)
    note = models.TextField(blank=True, default="")

    class Meta:
        db_table = "inventory_stock_reservations"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["product", "warehouse", "status"]),
            models.Index(fields=["source_module", "source_object_id"]),
        ]


class ReorderRule(InventoryTimeStampedModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="inventory_reorder_rules",
    )
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name="inventory_reorder_rules",
    )
    min_stock_level = models.DecimalField(max_digits=12, decimal_places=3, default=QUANTITY_ZERO)
    reorder_qty = models.DecimalField(max_digits=12, decimal_places=3, default=QUANTITY_ZERO)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "inventory_reorder_rules"
        ordering = ["product_id", "warehouse_id", "id"]
        unique_together = (("product", "warehouse"),)


class PurchaseNeed(InventoryTimeStampedModel):
    class SourceModule(models.TextChoices):
        DIRECT_SALE = "DIRECT_SALE", "Direct Sale"
        WINNER_DELIVERY = "WINNER_DELIVERY", "Winner Delivery"
        SUBSCRIPTION_DEMAND = "SUBSCRIPTION_DEMAND", "Subscription Demand"
        GENERAL = "GENERAL", "General"

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        URGENT = "URGENT", "Urgent"

    need_no = models.CharField(max_length=48, unique=True, editable=False, db_index=True)
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="inventory_purchase_needs",
    )
    product_name_snapshot = models.CharField(max_length=255, blank=True, default="")
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        related_name="purchase_needs",
    )
    required_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=QUANTITY_ZERO)
    available_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=QUANTITY_ZERO)
    shortage_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=QUANTITY_ZERO)
    status = models.CharField(
        max_length=12,
        choices=PurchaseNeedStatus.choices,
        default=PurchaseNeedStatus.OPEN,
        db_index=True,
    )
    source_module = models.CharField(
        max_length=32,
        choices=SourceModule.choices,
        default=SourceModule.GENERAL,
        db_index=True,
    )
    source_object_id = models.CharField(max_length=120, blank=True, default="", db_index=True)
    branch = models.ForeignKey(
        "branch_control.Branch",
        on_delete=models.PROTECT,
        related_name="inventory_purchase_needs",
        null=True,
        blank=True,
    )
    customer = models.ForeignKey(
        "subscriptions.Customer",
        on_delete=models.PROTECT,
        related_name="inventory_purchase_needs",
        null=True,
        blank=True,
    )
    priority = models.CharField(
        max_length=12,
        choices=Priority.choices,
        default=Priority.MEDIUM,
        db_index=True,
    )
    demand_snapshot = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="inventory_purchase_needs",
    )
    note = models.TextField(blank=True, default="")
    fulfilled_at = models.DateTimeField(null=True, blank=True, db_index=True)

    def save(self, *args, **kwargs):
        if self.product_id and not (self.product_name_snapshot or "").strip():
            name = Product.objects.filter(pk=self.product_id).values_list("name", flat=True).first()
            self.product_name_snapshot = (name or "")[:255]
        if not self.need_no:
            self.need_no = f"SN-{secrets.token_hex(5).upper()}"
        super().save(*args, **kwargs)

    class Meta:
        db_table = "inventory_purchase_needs"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["source_module", "status", "priority"]),
        ]


class InventoryAdjustment(InventoryTimeStampedModel):
    stock_adjustment = models.OneToOneField(
        StockAdjustment,
        on_delete=models.PROTECT,
        related_name="inventory_adjustment_audit",
    )
    audit_reason = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="inventory_adjustment_audits",
    )

    class Meta:
        db_table = "inventory_adjustments"
        ordering = ["-created_at", "-id"]
