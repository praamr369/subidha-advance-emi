# pyright: reportMissingImports=false, reportMissingModuleSource=false
from django.conf import settings  # pyright: ignore[reportMissingModuleSource]
from django.utils.text import slugify # type: ignore
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
    is_required = serializers.BooleanField(source="attribute.is_required", read_only=True)
    is_variant_defining = serializers.BooleanField(source="attribute.is_variant_defining", read_only=True)
    options = AttributeOptionSerializer(source="attribute.options", many=True, read_only=True)
    display_value = serializers.CharField(read_only=True)

    class Meta:
        model = ProductAttribute
        fields = [
            "id", "attribute", "attribute_name", "attribute_slug", "data_type",
            "is_required", "is_variant_defining", "options",
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
    quantity_on_hand = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()
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

    def get_quantity_on_hand(self, obj):
        if obj.operational_product_id:
            try:
                op = obj.operational_product
                if op and hasattr(op, "inventory_profile") and op.inventory_profile:
                    live_qty = int(op.inventory_profile.current_stock_quantity())
                    if obj.quantity_on_hand != live_qty:
                        ProductVariant.objects.filter(pk=obj.pk).update(quantity_on_hand=live_qty)
                        obj.quantity_on_hand = live_qty
                    return live_qty
            except Exception:
                pass
        return obj.quantity_on_hand or 0

    def get_is_low_stock(self, obj):
        qty = self.get_quantity_on_hand(obj)
        reorder = obj.reorder_level or 0
        return qty <= reorder

    def get_variant_label(self, obj):
        vals = obj.attribute_values.all()
        parts = []
        for v in vals:
            if v.value_text:
                parts.append(v.value_text)
            elif v.value_number is not None:
                parts.append(str(v.value_number).rstrip('0').rstrip('.') if '.' in str(v.value_number) else str(v.value_number))
            elif v.value_boolean is not None:
                parts.append("Yes" if v.value_boolean else "No")
        return " / ".join(parts) if parts else obj.sku

    def get_is_published(self, obj):
        return obj.product.is_published if obj.product_id else False

    def get_child_pim_id(self, obj):
        return obj.product_id


class PimProductListSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    subcategory_name = serializers.SerializerMethodField()
    attributes = ProductAttributeSerializer(many=True, read_only=True)
    variant_count = serializers.SerializerMethodField()
    parent_id = serializers.IntegerField(source="parent.id", read_only=True, default=None)
    parent_code = serializers.CharField(source="parent.code", read_only=True, default=None)
    parent_name = serializers.CharField(source="parent.name", read_only=True, default=None)
    parent_is_published = serializers.SerializerMethodField()
    child_count = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = PimProduct
        fields = [
            "id", "code", "brand", "name", "full_name", "category", "category_name",
            "subcategory", "subcategory_name", "base_price",
            "is_active", "is_published", "product_type", "variant_count",
            "parent_id", "parent_code", "parent_name", "parent_is_published", "child_count",
            "attributes",
        ]

    def get_parent_is_published(self, obj):
        if obj.parent_id and obj.parent:
            return obj.parent.is_published
        return None

    def get_full_name(self, obj):
        if obj.parent_id and obj.parent:
            # We can use the source_product's name if it's already updated, 
            # otherwise fetch the variant and compute it.
            if obj.source_product and obj.source_product.name and obj.source_product.name != obj.name:
                return obj.source_product.name
            from products_pim.models import ProductVariant
            variant = ProductVariant.objects.filter(sku=obj.code).prefetch_related('attribute_values__attribute').first()
            if variant:
                from products_pim.services.sync_service import PIMSyncService
                return PIMSyncService.get_variant_display_name(variant)
        return obj.name

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
            "rent_monthly_yield_percent", "lease_monthly_yield_percent",
            "is_emi_enabled", "is_rent_enabled", "is_lease_enabled", "is_direct_sale_enabled",
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
            "subcategory", "base_price", "cost_price", "rent_monthly_yield_percent", "lease_monthly_yield_percent",
            "is_emi_enabled", "is_rent_enabled", "is_lease_enabled", "is_direct_sale_enabled",
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
        """Remove any locked_attributes IDs that are not actually mapped to the product."""
        if not product.locked_attributes:
            return
        mapped_ids = set(
            ProductAttribute.objects.filter(
                product=product,
                attribute_id__in=product.locked_attributes,
            ).values_list("attribute_id", flat=True)
        )
        cleaned = [aid for aid in product.locked_attributes if aid in mapped_ids]
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
            sub_product.rent_monthly_yield_percent = pim_product.rent_monthly_yield_percent
            sub_product.lease_monthly_yield_percent = pim_product.lease_monthly_yield_percent
            if pim_product.category:
                sub_product.category = pim_product.category.name
            if pim_product.subcategory:
                sub_product.subcategory = pim_product.subcategory.name
            sub_product.save()
            
            if hasattr(sub_product, "inventory_profile") and sub_product.inventory_profile:
                if pim_product.cost_price is not None:
                    sub_product.inventory_profile.standard_unit_cost = pim_product.cost_price
                    sub_product.inventory_profile.save(update_fields=['standard_unit_cost'])
            
            # Cascade updates to all variant operational products
            from products_pim.services.sync_service import PIMSyncService
            for variant in pim_product.variants.all():
                PIMSyncService.sync_variant_to_operational_product(variant)
                
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
        old_code = instance.code
        product = super().update(instance, validated_data)
        if product.code != old_code:
            self._sync_product_code(product, old_code)
        if remove_ids:
            ProductAttribute.objects.filter(product=product, attribute_id__in=remove_ids).delete()
            if product.child_pim_products.exists():
                ProductAttribute.objects.filter(product__in=product.child_pim_products.all(), attribute_id__in=remove_ids).delete()
            
            # Remove associated VariantAttributeValue records from variants of this product
            from products_pim.models import VariantAttributeValue
            VariantAttributeValue.objects.filter(variant__product=product, attribute_id__in=remove_ids).delete()

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

    def _sync_product_code(self, pim_product, old_code):
        """Keep linked operational/register identifiers aligned with a PIM rename."""
        from subscriptions.models import Product as RegisterProduct

        core = pim_product.source_product
        if core and core.product_code == old_code:
            core.product_code = pim_product.code
            if core.sku == old_code:
                core.sku = pim_product.code
            core.save(update_fields=["product_code", "sku"])

        register = RegisterProduct.objects.filter(product_code=old_code).first()
        if register:
            register.product_code = pim_product.code
            register.save(update_fields=["product_code"])


class ProductVariantCreateSerializer(serializers.ModelSerializer):
    attribute_values = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = ProductVariant
        fields = ["id", "sku", "barcode", "price", "cost_price", "image", "video", "quantity_on_hand", "reorder_level", "attribute_values"]

    def _save_attribute_value(self, variant, av):
        attribute_id = av.get("attribute")
        if not attribute_id:
            return
        try:
            from .models import CategoryAttribute, AttributeDataType
            from decimal import Decimal, InvalidOperation
            attr_obj = CategoryAttribute.objects.get(id=attribute_id)
        except Exception:
            return

        raw_text = av.get("value_text")
        raw_num = av.get("value_number")
        raw_bool = av.get("value_boolean")

        val_text = str(raw_text).strip() if raw_text is not None else ""
        val_num = None
        val_bool = None

        if attr_obj.data_type in (AttributeDataType.NUMBER, AttributeDataType.DECIMAL):
            if raw_num is not None:
                try:
                    val_num = Decimal(str(raw_num))
                except (InvalidOperation, TypeError, ValueError):
                    val_num = None
            elif val_text != "":
                try:
                    val_num = Decimal(val_text)
                except (InvalidOperation, TypeError, ValueError):
                    val_num = None
            if val_num is not None and val_text == "":
                val_text = str(val_num).rstrip('0').rstrip('.') if '.' in str(val_num) else str(val_num)
        elif attr_obj.data_type == AttributeDataType.BOOLEAN:
            if raw_bool is not None:
                val_bool = bool(raw_bool)
            elif val_text != "":
                low = val_text.lower()
                if low in ("yes", "true", "1"):
                    val_bool = True
                elif low in ("no", "false", "0"):
                    val_bool = False
            if val_bool is not None:
                val_text = "Yes" if val_bool else "No"
        else:
            if raw_num is not None and not val_text:
                val_text = str(raw_num)
            elif raw_bool is not None and not val_text:
                val_text = "Yes" if raw_bool else "No"

        if val_text != "" or val_num is not None or val_bool is not None:
            VariantAttributeValue.objects.create(
                variant=variant,
                attribute=attr_obj,
                value_text=val_text,
                value_number=val_num,
                value_boolean=val_bool,
            )

    def create(self, validated_data):
        av_data = validated_data.pop("attribute_values", [])
        if "barcode" not in validated_data or not validated_data["barcode"]:
            validated_data["barcode"] = validated_data.get("sku")
        variant = super().create(validated_data)
        for av in av_data:
            self._save_attribute_value(variant, av)
        return variant

    def update(self, instance, validated_data):
        av_data = validated_data.pop("attribute_values", None)
        old_sku = instance.sku

        variant = super().update(instance, validated_data)

        if av_data is not None:
            VariantAttributeValue.objects.filter(variant=variant).delete()
            for av in av_data:
                self._save_attribute_value(variant, av)

        try:
            from products_pim.services.sync_service import PIMSyncService
            PIMSyncService.sync_variant_to_operational_product(variant)
        except ImportError:
            pass

        # If SKU was changed, update Operational and Register products
        if old_sku and old_sku != variant.sku:
            try:
                from products_core.models import Product as CoreProduct
                from subscriptions.models import Product as RegisterProduct
                
                # Update Core Product SKU and product_code
                core = variant.operational_product
                if not core:
                    core = CoreProduct.objects.filter(product_code=old_sku).first()
                if core:
                    core.sku = variant.sku
                    core.product_code = variant.sku
                    core.save(update_fields=["sku", "product_code"])
                    
                # Update Register Product
                register = RegisterProduct.objects.filter(product_code=old_sku).first()
                if register:
                    register.product_code = variant.sku
                    register.save(update_fields=["product_code"])
            except Exception:
                pass

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
    if isinstance(upload, str):
        if not upload.lower().endswith(suffix):
            raise serializers.ValidationError(f"{label} URL must end in {suffix}")
        return
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
        if not field_file:
            return None
            
        if isinstance(field_file, str):
            val = field_file
        else:
            try:
                val = field_file.url
            except Exception:
                return None
                
        if val.startswith("http://") or val.startswith("https://"):
            pass
        elif not val.startswith("/"):
            from django.conf import settings
            media_url = getattr(settings, 'MEDIA_URL', '/media/')
            val = f"{media_url}{val}"
            
        if request:
            return request.build_absolute_uri(val)
        return val

    def get_file_url(self, obj):
        return self._absolute(obj.file)

    def get_ios_file_url(self, obj):
        return self._absolute(obj.ios_file)
