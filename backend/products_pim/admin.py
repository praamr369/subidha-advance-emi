from django.contrib import admin, messages
from .models import (
    ProductCategory,
    ProductSubcategory,
    CategoryAttribute,
    AttributeOption,
    PimProduct,
    ProductAttribute,
    ProductVariant,
    VariantAttributeValue,
    ProductAsset,
)
from .services import FlexibleVariantService


class ProductSubcategoryInline(admin.TabularInline):
    model = ProductSubcategory
    extra = 0


class CategoryAttributeInline(admin.TabularInline):
    model = CategoryAttribute
    extra = 0
    fields = ["name", "slug", "data_type", "is_required", "is_variant_defining", "display_order"]


@admin.register(ProductCategory)
class ProductCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "icon", "display_order", "is_active"]
    list_editable = ["display_order", "is_active"]
    prepopulated_fields = {"slug": ("name",)}
    inlines = [ProductSubcategoryInline, CategoryAttributeInline]


class AttributeOptionInline(admin.TabularInline):
    model = AttributeOption
    extra = 0


@admin.register(CategoryAttribute)
class CategoryAttributeAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "subcategory", "data_type", "is_required", "is_variant_defining"]
    list_filter = ["category", "data_type"]
    inlines = [AttributeOptionInline]


class ProductAttributeInline(admin.TabularInline):
    model = ProductAttribute
    extra = 0


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0
    fields = ["sku", "price", "quantity_on_hand", "reorder_level", "is_active"]


class ProductAssetInline(admin.TabularInline):
    model = ProductAsset
    extra = 1
    fields = ["image", "is_hero", "mapped_attribute_option", "display_order"]


@admin.register(PimProduct)
class PimProductAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "brand", "category", "subcategory", "base_price", "variant_count", "is_active", "is_published"]
    list_filter = ["category", "subcategory", "is_published", "is_active"]
    search_fields = ["code", "name", "brand"]
    inlines = [ProductAttributeInline, ProductAssetInline, ProductVariantInline]
    actions = ["generate_variants", "regenerate_variants"]

    def variant_count(self, obj):
        return obj.variants.count()
    variant_count.short_description = "SKU Count"

    def generate_variants(self, request, queryset):
        """Generate variants for selected products from variant-defining attributes"""
        total_created = 0
        total_skipped = 0

        for product in queryset:
            result = FlexibleVariantService.generate_variants(
                product, clear_existing=False
            )
            created = result['created']
            skipped = result['skipped']
            total_created += created
            total_skipped += skipped

            if created > 0:
                messages.success(
                    request,
                    f"{product.name}: Created {created} variants"
                )
            if skipped > 0:
                messages.warning(
                    request,
                    f"{product.name}: {skipped} variants already existed"
                )

        if total_created > 0:
            messages.success(request, f"Total: {total_created} new SKUs generated")

    generate_variants.short_description = "Generate SKU variants from attributes"

    def regenerate_variants(self, request, queryset):
        """Regenerate all variants (clears old ones first)"""
        for product in queryset:
            old_count = product.variants.count()
            result = FlexibleVariantService.generate_variants(
                product, clear_existing=True
            )
            created = result['created']

            messages.success(
                request,
                f"{product.name}: Deleted {old_count} old variants, created {created} new ones"
            )

    regenerate_variants.short_description = "Regenerate variants (⚠ deletes old ones)"


class VariantAttributeValueInline(admin.TabularInline):
    model = VariantAttributeValue
    extra = 0


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ["sku", "product", "operational_product", "price", "quantity_on_hand", "reorder_level", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["sku", "product__name", "product__code"]
    inlines = [VariantAttributeValueInline]
