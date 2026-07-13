from django.contrib import admin
from .models import (
    ProductCategory,
    ProductSubcategory,
    CategoryAttribute,
    AttributeOption,
    PimProduct,
    ProductAttribute,
    ProductVariant,
    VariantAttributeValue,
)


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


@admin.register(PimProduct)
class PimProductAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "category", "subcategory", "base_price", "is_active", "is_published"]
    list_filter = ["category", "subcategory", "is_published", "is_active"]
    search_fields = ["code", "name"]
    inlines = [ProductAttributeInline, ProductVariantInline]


class VariantAttributeValueInline(admin.TabularInline):
    model = VariantAttributeValue
    extra = 0


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ["sku", "product", "price", "quantity_on_hand", "reorder_level", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["sku", "product__name", "product__code"]
    inlines = [VariantAttributeValueInline]
