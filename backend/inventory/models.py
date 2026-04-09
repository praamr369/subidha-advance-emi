from __future__ import annotations

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
    SALE_OUT = "SALE_OUT", "Sale Out"
    EMI_DELIVERY_OUT = "EMI_DELIVERY_OUT", "EMI Delivery Out"
    EMI_RETURN_IN = "EMI_RETURN_IN", "EMI Return In"
    SALE_RETURN_IN = "SALE_RETURN_IN", "Sale Return In"
    PURCHASE_RETURN_OUT = "PURCHASE_RETURN_OUT", "Purchase Return Out"
    ADJUSTMENT_IN = "ADJUSTMENT_IN", "Adjustment In"
    ADJUSTMENT_OUT = "ADJUSTMENT_OUT", "Adjustment Out"
    TRANSFER_IN = "TRANSFER_IN", "Transfer In"
    TRANSFER_OUT = "TRANSFER_OUT", "Transfer Out"


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
        ]

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        self.name = (self.name or "").strip()
        self.notes = (self.notes or "").strip()
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
        aggregate = self.stock_ledger.aggregate(
            total_in=Sum("quantity_in"),
            total_out=Sum("quantity_out"),
        )
        total_in = Decimal(str(aggregate["total_in"] or QUANTITY_ZERO))
        total_out = Decimal(str(aggregate["total_out"] or QUANTITY_ZERO))
        return total_in - total_out + Decimal(str(self.opening_stock_qty or QUANTITY_ZERO))

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
