from django.contrib import admin

from inventory.models import (
    InventoryItem,
    PurchaseBill,
    PurchaseBillLine,
    StockAdjustment,
    StockAdjustmentLine,
    StockLedger,
)


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = ("product", "sku", "stock_tracking_enabled", "is_active")
    list_filter = ("stock_tracking_enabled", "is_active", "valuation_method")
    search_fields = ("product__name", "product__product_code", "sku")


class StockAdjustmentLineInline(admin.TabularInline):
    model = StockAdjustmentLine
    extra = 0


@admin.register(StockAdjustment)
class StockAdjustmentAdmin(admin.ModelAdmin):
    list_display = ("adjustment_no", "adjustment_date", "status", "created_by")
    list_filter = ("status", "adjustment_date")
    search_fields = ("adjustment_no", "reason")
    inlines = [StockAdjustmentLineInline]


class PurchaseBillLineInline(admin.TabularInline):
    model = PurchaseBillLine
    extra = 0


@admin.register(PurchaseBill)
class PurchaseBillAdmin(admin.ModelAdmin):
    list_display = ("bill_no", "bill_date", "status", "vendor", "grand_total")
    list_filter = ("status", "tax_mode", "bill_date")
    search_fields = ("bill_no", "vendor__name")
    inlines = [PurchaseBillLineInline]


@admin.register(StockLedger)
class StockLedgerAdmin(admin.ModelAdmin):
    list_display = (
        "inventory_item",
        "movement_type",
        "movement_date",
        "quantity_in",
        "quantity_out",
        "reference_model",
        "reference_id",
    )
    list_filter = ("movement_type", "movement_date")
    search_fields = (
        "inventory_item__product__name",
        "inventory_item__product__product_code",
        "reference_model",
        "reference_id",
    )

