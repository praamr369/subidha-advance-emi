from django.contrib import admin

from brochures.models import BrochureDocument, ProductBrochureSettings


@admin.register(ProductBrochureSettings)
class ProductBrochureSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "visible_on_public_catalog",
        "visible_on_rent_catalog",
        "visible_on_lease_catalog",
        "visible_on_lucky_emi_catalog",
        "visible_on_sale_catalog",
        "brochure_featured",
        "brochure_sort_order",
    )
    list_filter = (
        "visible_on_public_catalog",
        "visible_on_rent_catalog",
        "visible_on_lease_catalog",
        "visible_on_lucky_emi_catalog",
        "visible_on_sale_catalog",
        "brochure_featured",
    )
    search_fields = ("product__name", "product__product_code", "public_badge")
    autocomplete_fields = ("product",)


@admin.register(BrochureDocument)
class BrochureDocumentAdmin(admin.ModelAdmin):
    list_display = (
        "brochure_no",
        "title",
        "brochure_type",
        "status",
        "created_by",
        "created_at",
        "expires_at",
    )
    list_filter = ("brochure_type", "status", "created_at")
    search_fields = ("brochure_no", "title", "public_token")
    readonly_fields = (
        "brochure_no",
        "public_token",
        "pdf_file",
        "filter_payload",
        "product_snapshot",
        "created_by",
        "created_at",
        "updated_at",
    )
