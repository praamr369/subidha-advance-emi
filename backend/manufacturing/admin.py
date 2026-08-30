from unfold.admin import ModelAdmin as UnfoldModelAdmin, TabularInline as UnfoldTabularInline, StackedInline as UnfoldStackedInline
from django.contrib import admin

from manufacturing.models import (
    ManufacturingBom,
    ManufacturingBomLine,
    ProductionJob,
    ProductionMaterialIssueLine,
    ProductionReceiptLine,
    ProductionScrapLine,
)


class ManufacturingBomLineInline(UnfoldTabularInline):
    model = ManufacturingBomLine
    extra = 0


@admin.register(ManufacturingBom)
class ManufacturingBomAdmin(UnfoldModelAdmin):
    list_display = ("bom_no", "finished_good_inventory_item", "revision_no", "status", "is_default")
    list_filter = ("status", "is_default")
    search_fields = ("bom_no", "finished_good_inventory_item__sku", "finished_good_inventory_item__product__name")
    inlines = [ManufacturingBomLineInline]


class ProductionMaterialIssueLineInline(UnfoldTabularInline):
    model = ProductionMaterialIssueLine
    extra = 0


class ProductionReceiptLineInline(UnfoldTabularInline):
    model = ProductionReceiptLine
    extra = 0


class ProductionScrapLineInline(UnfoldTabularInline):
    model = ProductionScrapLine
    extra = 0


@admin.register(ProductionJob)
class ProductionJobAdmin(UnfoldModelAdmin):
    list_display = ("job_no", "finished_good_inventory_item", "status", "planned_output_qty", "completed_output_qty")
    list_filter = ("status", "costing_status", "accounting_status")
    search_fields = ("job_no", "finished_good_inventory_item__sku", "finished_good_inventory_item__product__name")
    inlines = [
        ProductionMaterialIssueLineInline,
        ProductionReceiptLineInline,
        ProductionScrapLineInline,
    ]

