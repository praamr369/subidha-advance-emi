from rest_framework import serializers
from .models import (
    ProductCategory,
    ProductSubcategory,
    CategoryAttribute,
    AttributeOption,
    PimProduct,
    ProductAttribute,
    ProductVariant,
    VariantAttributeValue,
    AttributeDataType,
)


class AttributeOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttributeOption
        fields = ["id", "value", "display_name", "display_order"]


class CategoryAttributeSerializer(serializers.ModelSerializer):
    options = AttributeOptionSerializer(many=True, read_only=True)

    class Meta:
        model = CategoryAttribute
        # `category` is required (an attribute belongs to a category); `subcategory`
        # is optional. Both must be writable so the manage page can create an
        # attribute on a chosen category/subcategory.
        fields = [
            "id", "category", "subcategory", "name", "slug", "data_type", "is_required",
            "is_variant_defining", "min_value", "max_value",
            "display_order", "options",
        ]
        extra_kwargs = {
            "slug": {"read_only": True},
            "subcategory": {"required": False, "allow_null": True},
        }


class ProductSubcategorySerializer(serializers.ModelSerializer):
    attributes = serializers.SerializerMethodField()

    class Meta:
        model = ProductSubcategory
        # `category` must be writable — a subcategory belongs to a category (NOT
        # NULL). It was previously omitted, so POSTs silently dropped it and hit an
        # integrity error on category_id. `slug` is read-only: the model derives it
        # from name in save(), and marking it read-only keeps the model's
        # unique_together (category, slug) from forcing slug into the request body.
        fields = ["id", "category", "name", "slug", "display_order", "attributes"]
        extra_kwargs = {"slug": {"read_only": True}}

    def get_attributes(self, obj):
        attrs = CategoryAttribute.objects.filter(subcategory=obj, is_active=True).prefetch_related("options")
        return CategoryAttributeSerializer(attrs, many=True).data


class ProductCategorySerializer(serializers.ModelSerializer):
    subcategories = ProductSubcategorySerializer(many=True, read_only=True)
    attributes = serializers.SerializerMethodField()

    class Meta:
        model = ProductCategory
        fields = ["id", "name", "slug", "icon", "display_order", "subcategories", "attributes"]
        extra_kwargs = {"slug": {"required": False, "allow_blank": True}}

    def get_attributes(self, obj):
        attrs = CategoryAttribute.objects.filter(category=obj, subcategory__isnull=True, is_active=True).prefetch_related("options")
        return CategoryAttributeSerializer(attrs, many=True).data


class ProductAttributeSerializer(serializers.ModelSerializer):
    attribute_name = serializers.CharField(source="attribute.name", read_only=True)
    attribute_slug = serializers.CharField(source="attribute.slug", read_only=True)
    data_type = serializers.CharField(source="attribute.data_type", read_only=True)
    display_value = serializers.CharField(read_only=True)

    class Meta:
        model = ProductAttribute
        fields = [
            "id", "attribute", "attribute_name", "attribute_slug", "data_type",
            "value_text", "value_number", "value_boolean", "value_date", "display_value",
        ]


class VariantAttributeValueSerializer(serializers.ModelSerializer):
    attribute_name = serializers.CharField(source="attribute.name", read_only=True)
    attribute_slug = serializers.CharField(source="attribute.slug", read_only=True)

    class Meta:
        model = VariantAttributeValue
        fields = ["id", "attribute", "attribute_name", "attribute_slug", "value_text", "value_number", "value_boolean"]


class ProductVariantSerializer(serializers.ModelSerializer):
    attribute_values = VariantAttributeValueSerializer(many=True, read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    variant_label = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = [
            "id", "sku", "barcode", "price", "cost_price", "image",
            "quantity_on_hand", "reorder_level", "is_active",
            "attribute_values", "is_low_stock", "variant_label",
        ]

    def get_variant_label(self, obj):
        vals = obj.attribute_values.all()
        parts = [v.value_text or str(v.value_number) for v in vals if (v.value_text or v.value_number)]
        return " / ".join(parts) if parts else obj.sku


class PimProductListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    subcategory_name = serializers.CharField(source="subcategory.name", read_only=True)
    variant_count = serializers.SerializerMethodField()

    class Meta:
        model = PimProduct
        fields = [
            "id", "code", "name", "category", "category_name",
            "subcategory", "subcategory_name", "base_price",
            "is_active", "is_published", "variant_count",
        ]

    def get_variant_count(self, obj):
        return obj.variants.filter(is_active=True).count()


class PimProductDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    subcategory_name = serializers.CharField(source="subcategory.name", read_only=True)
    attributes = ProductAttributeSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    variant_count = serializers.SerializerMethodField()

    class Meta:
        model = PimProduct
        fields = [
            "id", "code", "name", "description", "category", "category_name",
            "subcategory", "subcategory_name", "base_price", "cost_price",
            "is_active", "is_published", "created_at", "updated_at",
            "attributes", "variants", "variant_count",
        ]

    def get_variant_count(self, obj):
        return obj.variants.filter(is_active=True).count()


class PimProductCreateUpdateSerializer(serializers.ModelSerializer):
    attributes = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = PimProduct
        fields = [
            "id", "code", "name", "description", "category",
            "subcategory", "base_price", "cost_price",
            "is_active", "is_published", "attributes",
        ]

    def _save_attributes(self, product, attrs_data):
        for attr_data in attrs_data:
            attribute_id = attr_data.get("attribute")
            if not attribute_id:
                continue
            ProductAttribute.objects.update_or_create(
                product=product,
                attribute_id=attribute_id,
                defaults={
                    "value_text": attr_data.get("value_text", ""),
                    "value_number": attr_data.get("value_number"),
                    "value_boolean": attr_data.get("value_boolean"),
                    "value_date": attr_data.get("value_date"),
                },
            )

    def _sync_to_register(self, pim_product):
        try:
            from subscriptions.models import Product as SubProduct
            sub_product = SubProduct.objects.filter(product_code=pim_product.code).first()
            if not sub_product:
                if not pim_product.is_published:
                    return
                sub_product = SubProduct(product_code=pim_product.code)
            
            sub_product.name = pim_product.name
            sub_product.base_price = pim_product.base_price
            if pim_product.category:
                sub_product.category = pim_product.category.name
            if pim_product.subcategory:
                sub_product.subcategory = pim_product.subcategory.name
            sub_product.save()
            
            if hasattr(sub_product, "inventory_profile") and sub_product.inventory_profile:
                if pim_product.cost_price is not None:
                    sub_product.inventory_profile.standard_unit_cost = pim_product.cost_price
                    sub_product.inventory_profile.save(update_fields=['standard_unit_cost'])
        except ImportError:
            pass

    def create(self, validated_data):
        attrs_data = validated_data.pop("attributes", [])
        product = super().create(validated_data)
        self._save_attributes(product, attrs_data)
        self._sync_to_register(product)
        return product

    def update(self, instance, validated_data):
        attrs_data = validated_data.pop("attributes", [])
        product = super().update(instance, validated_data)
        self._save_attributes(product, attrs_data)
        self._sync_to_register(product)
        return product


class ProductVariantCreateSerializer(serializers.ModelSerializer):
    attribute_values = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = ProductVariant
        fields = ["id", "sku", "barcode", "price", "cost_price", "image", "quantity_on_hand", "reorder_level", "attribute_values"]

    def create(self, validated_data):
        av_data = validated_data.pop("attribute_values", [])
        variant = super().create(validated_data)
        for av in av_data:
            attribute_id = av.get("attribute")
            if attribute_id:
                VariantAttributeValue.objects.create(
                    variant=variant,
                    attribute_id=attribute_id,
                    value_text=av.get("value_text", ""),
                    value_number=av.get("value_number"),
                    value_boolean=av.get("value_boolean"),
                )
        return variant
