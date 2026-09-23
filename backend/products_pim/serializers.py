from django.utils.text import slugify
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
    ProductMediaItem,
    MediaKind,
)


def _auto_slug(name, fallback):
    # Mirrors the models' save(): slug derived from name when not given.
    return slugify(name or "")[:100] or fallback


def _reject_taken_slug(queryset, *, instance, slug, label):
    """400 instead of the unique-constraint IntegrityError (500) save() would hit."""
    if instance is not None:
        queryset = queryset.exclude(pk=instance.pk)
    if queryset.filter(slug=slug).exists():
        raise serializers.ValidationError(
            {"name": f'A {label} with this name already exists here (slug "{slug}"). Use a different name.'}
        )


class AttributeOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttributeOption
        fields = ["id", "attribute", "value", "display_name", "display_order", "extra_cost"]


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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = self.instance
        category = attrs.get("category", getattr(instance, "category", None))
        subcategory = attrs["subcategory"] if "subcategory" in attrs else getattr(instance, "subcategory", None)
        slug = instance.slug if instance is not None else _auto_slug(attrs.get("name"), "attribute")
        # unique_together (category, subcategory, slug); NULL subcategory = category-level attribute.
        scope = CategoryAttribute.objects.filter(category=category)
        scope = scope.filter(subcategory=subcategory) if subcategory is not None else scope.filter(subcategory__isnull=True)
        _reject_taken_slug(scope, instance=instance, slug=slug, label="attribute")
        return attrs


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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = self.instance
        category = attrs.get("category", getattr(instance, "category", None))
        slug = instance.slug if instance is not None else _auto_slug(attrs.get("name"), "subcategory")
        _reject_taken_slug(
            ProductSubcategory.objects.filter(category=category), instance=instance, slug=slug, label="subcategory"
        )
        return attrs

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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = self.instance
        if attrs.get("slug"):
            slug = attrs["slug"]
        elif instance is not None and "slug" not in attrs:
            return attrs  # slug unchanged; renaming never re-derives it
        else:
            slug = _auto_slug(attrs.get("name", getattr(instance, "name", "")), "category")
        _reject_taken_slug(ProductCategory.objects.all(), instance=instance, slug=slug, label="category")
        return attrs

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
    # Publish status comes from the linked child PimProduct, not the variant itself
    is_published = serializers.SerializerMethodField()
    child_pim_id = serializers.SerializerMethodField()
    operational_product_id = serializers.IntegerField(source="operational_product.id", read_only=True, default=None)

    class Meta:
        model = ProductVariant
        fields = [
            "id", "sku", "barcode", "price", "cost_price", "image", "video",
            "quantity_on_hand", "reorder_level", "is_active",
            "attribute_values", "is_low_stock", "variant_label",
            "is_published", "child_pim_id", "operational_product_id",
        ]

    def get_variant_label(self, obj):
        vals = obj.attribute_values.all()
        parts = [v.value_text or str(v.value_number) for v in vals if (v.value_text or v.value_number)]
        return " / ".join(parts) if parts else obj.sku

    def get_is_published(self, obj):
        return obj.product.is_published if obj.product_id else False

    def get_child_pim_id(self, obj):
        return obj.product_id


class PimProductListSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    subcategory_name = serializers.SerializerMethodField()
    variant_count = serializers.SerializerMethodField()
    parent_id = serializers.IntegerField(source="parent.id", read_only=True, default=None)
    parent_code = serializers.CharField(source="parent.code", read_only=True, default=None)
    parent_name = serializers.CharField(source="parent.name", read_only=True, default=None)
    parent_is_published = serializers.SerializerMethodField()
    child_count = serializers.SerializerMethodField()

    class Meta:
        model = PimProduct
        fields = [
            "id", "code", "brand", "name", "category", "category_name",
            "subcategory", "subcategory_name", "base_price",
            "is_active", "is_published", "product_type", "variant_count",
            "parent_id", "parent_code", "parent_name", "parent_is_published", "child_count",
        ]

    def get_parent_is_published(self, obj):
        if obj.parent_id and obj.parent:
            return obj.parent.is_published
        return None

    def _effective_category(self, obj):
        """Return own category unless it's the Unclassified sentinel; fall back to parent."""
        cat = obj.category
        if cat and cat.slug != "unclassified":
            return cat
        if obj.parent_id and obj.parent:
            return obj.parent.category
        return cat

    def _effective_subcategory(self, obj):
        if obj.subcategory:
            return obj.subcategory
        if obj.parent_id and obj.parent:
            return obj.parent.subcategory
        return None

    def get_category_name(self, obj):
        cat = self._effective_category(obj)
        return cat.name if cat else None

    def get_subcategory_name(self, obj):
        sub = self._effective_subcategory(obj)
        return sub.name if sub else None

    def get_variant_count(self, obj):
        return obj.variants.filter(is_active=True).count()

    def get_child_count(self, obj):
        return obj.child_pim_products.count()


class PimProductDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    subcategory_name = serializers.SerializerMethodField()
    attributes = ProductAttributeSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    variant_count = serializers.SerializerMethodField()
    parent_id = serializers.IntegerField(source="parent.id", read_only=True, default=None)
    parent_code = serializers.CharField(source="parent.code", read_only=True, default=None)
    parent_name = serializers.CharField(source="parent.name", read_only=True, default=None)
    # For variant PimProducts: the base product's locked/shared attribute values
    inherited_attribute_values = serializers.SerializerMethodField()
    # For variant PimProducts: the SKU-specific VariantAttributeValues from ProductVariant
    variant_attribute_values = serializers.SerializerMethodField()

    class Meta:
        model = PimProduct
        fields = [
            "id", "code", "brand", "name", "description", "category", "category_name",
            "subcategory", "subcategory_name", "base_price", "cost_price",
            "is_active", "is_published", "product_type", "locked_attributes",
            "ar_width_cm", "ar_depth_cm", "ar_height_cm",
            "warranty_enabled", "warranty_months_manufacturing", "warranty_months_structural",
            "warranty_months_extended_max", "extended_warranty_cost_percentage",
            "parent_id", "parent_code", "parent_name",
            "created_at", "updated_at",
            "attributes", "variants", "variant_count",
            "inherited_attribute_values", "variant_attribute_values",
        ]

    def _effective_category(self, obj):
        cat = obj.category
        if cat and getattr(cat, "slug", "") != "unclassified":
            return cat
        if obj.parent_id and obj.parent:
            return obj.parent.category
        return cat

    def _effective_subcategory(self, obj):
        if obj.subcategory:
            return obj.subcategory
        if obj.parent_id and obj.parent:
            return obj.parent.subcategory
        return None

    def get_category_name(self, obj):
        cat = self._effective_category(obj)
        return cat.name if cat else None

    def get_subcategory_name(self, obj):
        sub = self._effective_subcategory(obj)
        return sub.name if sub else None

    def get_variant_count(self, obj):
        return obj.variants.filter(is_active=True).count()

    def get_inherited_attribute_values(self, obj):
        """Return base product's ProductAttribute values for variant PimProducts."""
        if not obj.parent_id:
            return []
        attrs = ProductAttribute.objects.filter(
            product_id=obj.parent_id
        ).select_related("attribute")
        return ProductAttributeSerializer(attrs, many=True).data

    def get_variant_attribute_values(self, obj):
        """Return VariantAttributeValues from the ProductVariant matching this PimProduct's code."""
        if not obj.parent_id:
            return []
        variant = (
            ProductVariant.objects
            .filter(sku=obj.code)
            .prefetch_related("attribute_values__attribute")
            .first()
        )
        if not variant:
            return []
        return VariantAttributeValueSerializer(variant.attribute_values.all(), many=True).data


class PimProductCreateUpdateSerializer(serializers.ModelSerializer):
    attributes = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)
    remove_attributes = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)

    class Meta:
        model = PimProduct
        fields = [
            "id", "code", "brand", "name", "description", "category",
            "subcategory", "base_price", "cost_price",
            "is_active", "is_published", "product_type", "locked_attributes", "attributes", "remove_attributes",
            "ar_width_cm", "ar_depth_cm", "ar_height_cm", "parent",
            "warranty_enabled", "warranty_months_manufacturing", "warranty_months_structural",
            "warranty_months_extended_max", "extended_warranty_cost_percentage",
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

    def _clean_locked_attributes(self, product):
        """Remove any locked_attributes IDs that have no actual saved value."""
        if not product.locked_attributes:
            return
        valued_ids = set(
            ProductAttribute.objects.filter(
                product=product,
                attribute_id__in=product.locked_attributes,
            ).exclude(
                value_text="",
                value_number__isnull=True,
                value_boolean__isnull=True,
                value_date__isnull=True,
            ).values_list("attribute_id", flat=True)
        )
        cleaned = [aid for aid in product.locked_attributes if aid in valued_ids]
        if len(cleaned) != len(product.locked_attributes):
            product.locked_attributes = cleaned
            product.save(update_fields=["locked_attributes"])

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
        validated_data.pop("remove_attributes", [])
        product = super().create(validated_data)
        self._save_attributes(product, attrs_data)
        self._clean_locked_attributes(product)
        self._sync_to_register(product)
        return product

    def update(self, instance, validated_data):
        attrs_data = validated_data.pop("attributes", [])
        remove_ids = validated_data.pop("remove_attributes", [])
        product = super().update(instance, validated_data)
        if remove_ids:
            ProductAttribute.objects.filter(product=product, attribute_id__in=remove_ids).delete()
            # Also remove from locked_attributes if present
            if product.locked_attributes:
                cleaned = [aid for aid in product.locked_attributes if aid not in remove_ids]
                if len(cleaned) != len(product.locked_attributes):
                    product.locked_attributes = cleaned
                    product.save(update_fields=["locked_attributes"])
        self._save_attributes(product, attrs_data)
        self._clean_locked_attributes(product)
        self._sync_to_register(product)
        return product


class ProductVariantCreateSerializer(serializers.ModelSerializer):
    attribute_values = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = ProductVariant
        fields = ["id", "sku", "barcode", "price", "cost_price", "image", "video", "quantity_on_hand", "reorder_level", "attribute_values"]

    def create(self, validated_data):
        av_data = validated_data.pop("attribute_values", [])
        if "barcode" not in validated_data or not validated_data["barcode"]:
            validated_data["barcode"] = validated_data.get("sku")
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

from products_core.models import ProductRelationship

class PimProductRelationshipSerializer(serializers.ModelSerializer):
    related_pim_product_id = serializers.IntegerField(source='related_product.pim.first.id', read_only=True)
    related_pim_product_name = serializers.CharField(source='related_product.pim.first.name', read_only=True)
    related_pim_product_code = serializers.CharField(source='related_product.pim.first.code', read_only=True)

    class Meta:
        model = ProductRelationship
        fields = [
            "id",
            "product",
            "parent_variant",
            "related_product",
            "related_variant",
            "parent_variant_sku",
            "related_variant_sku",
            "related_pim_product_id",
            "related_pim_product_name",
            "related_pim_product_code"
        ]
        read_only_fields = ["product"]



AR_MODEL_MAX_BYTES = 25 * 1024 * 1024  # matches nginx client_max_body_size


def _check_model_file(upload, *, suffix, magic, label):
    """Extension + magic-byte check so a renamed JPG/ZIP can't pose as a 3D model."""
    if not upload.name.lower().endswith(suffix):
        raise serializers.ValidationError(f"{label} must be a {suffix} file.")
    if upload.size > AR_MODEL_MAX_BYTES:
        raise serializers.ValidationError(f"{label} must be under 25 MB.")
    upload.seek(0)
    head = upload.read(len(magic))
    upload.seek(0)
    if head != magic:
        raise serializers.ValidationError(f"This does not look like a valid {suffix} file.")


class ProductMediaItemSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    ios_file_url = serializers.SerializerMethodField()
    variant_sku = serializers.CharField(source="variant.sku", read_only=True, allow_null=True)

    class Meta:
        model = ProductMediaItem
        fields = [
            "id", "product", "variant", "variant_sku", "kind", "scope",
            "file", "file_url", "ios_file", "ios_file_url",
            "title", "is_hero", "display_order", "created_at",
        ]
        read_only_fields = ["id", "created_at", "file_url", "ios_file_url", "variant_sku"]
        extra_kwargs = {"ios_file": {"required": False, "allow_null": True}}

    def validate(self, attrs):
        attrs = super().validate(attrs)
        kind = attrs.get("kind", getattr(self.instance, "kind", MediaKind.IMAGE))
        if kind == MediaKind.MODEL_3D:
            if attrs.get("file"):
                # glTF binary header: ASCII "glTF"
                _check_model_file(attrs["file"], suffix=".glb", magic=b"glTF", label="3D model")
            if attrs.get("ios_file"):
                # USDZ is an uncompressed zip: local-file header "PK\x03\x04"
                _check_model_file(attrs["ios_file"], suffix=".usdz", magic=b"PK\x03\x04", label="iPhone model")
        elif attrs.get("ios_file"):
            raise serializers.ValidationError({"ios_file": "Only 3D models take an iPhone (.usdz) file."})
        return attrs

    def _absolute(self, field_file):
        request = self.context.get("request")
        if field_file and request:
            return request.build_absolute_uri(field_file.url)
        return str(field_file) if field_file else None

    def get_file_url(self, obj):
        return self._absolute(obj.file)

    def get_ios_file_url(self, obj):
        return self._absolute(obj.ios_file)
