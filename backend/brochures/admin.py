from django.contrib import admin

from brochures.models import (
    BrochureDocument,
    BrochureEnquiry,
    BrochureEnquiryProduct,
    BrochureEnquiryStatusHistory,
    ProductBrochureSettings,
)


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


class BrochureEnquiryProductInline(admin.TabularInline):
    model = BrochureEnquiryProduct
    extra = 0
    readonly_fields = (
        "product",
        "product_snapshot",
        "brochure_product_code",
        "brochure_product_name",
        "requested_quantity",
        "preferred_plan",
        "notes",
    )


class BrochureEnquiryStatusHistoryInline(admin.TabularInline):
    model = BrochureEnquiryStatusHistory
    extra = 0
    readonly_fields = (
        "event_type",
        "from_status",
        "to_status",
        "note",
        "changed_by",
        "created_at",
    )

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(BrochureEnquiry)
class BrochureEnquiryAdmin(admin.ModelAdmin):
    list_display = (
        "enquiry_no",
        "customer_name",
        "phone",
        "preferred_plan",
        "status",
        "priority",
        "is_possible_duplicate",
        "crm_link_status",
        "assigned_to",
        "follow_up_at",
        "created_at",
    )
    list_filter = (
        "status",
        "priority",
        "preferred_plan",
        "is_possible_duplicate",
        "crm_link_status",
        "created_at",
    )
    search_fields = (
        "enquiry_no",
        "customer_name",
        "phone",
        "phone_normalized",
        "location",
    )
    readonly_fields = (
        "enquiry_no",
        "brochure",
        "brochure_token_snapshot",
        "customer_name",
        "phone",
        "phone_normalized",
        "alternate_phone",
        "email",
        "location",
        "address_text",
        "preferred_plan",
        "message",
        "crm_party",
        "crm_interaction",
        "crm_lead",
        "crm_sync_warning",
        "crm_link_status",
        "crm_link_message",
        "crm_linked_at",
        "duplicate_of",
        "duplicate_reason",
        "is_possible_duplicate",
        "last_contacted_at",
        "source",
        "ip_address",
        "user_agent",
        "created_at",
        "updated_at",
    )
    inlines = (
        BrochureEnquiryProductInline,
        BrochureEnquiryStatusHistoryInline,
    )
