from rest_framework import serializers

from api.v1.serializers.media import serialize_media_url
from subscriptions.models import Product, ProductCategoryMaster


def _variant_attr_map(variant):
    """Build {attr_name: value} from a ProductVariant's VariantAttributeValue records."""
    attrs = {}
    for v_attr in variant.attribute_values.select_related("attribute"):
        val = v_attr.value_text
        if not val and v_attr.value_number is not None:
            val = str(v_attr.value_number)
        if not val and v_attr.value_boolean is not None:
            val = "Yes" if v_attr.value_boolean else "No"
        if val:
            attrs[v_attr.attribute.name] = val
    return attrs


class PublicProductSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    video = serializers.SerializerMethodField()
    category_slug = serializers.SerializerMethodField()
    pim_description = serializers.SerializerMethodField()
    pim_attributes = serializers.SerializerMethodField()
    pim_variants = serializers.SerializerMethodField()
    price_range = serializers.SerializerMethodField()
    # Variant-page fields — null on base products
    is_variant_page = serializers.SerializerMethodField()
    parent_product_id = serializers.SerializerMethodField()
    selected_attributes = serializers.SerializerMethodField()
    sibling_variants = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "product_code",
            "name",
            "base_price",
            "price_range",
            "category",
            "category_slug",
            "subcategory",
            "image",
            "video",
            "description",
            "pim_description",
            "pim_attributes",
            "pim_variants",
            # Variant-page extras
            "is_variant_page",
            "parent_product_id",
            "selected_attributes",
            "sibling_variants",
        ]

    # ── helpers ──────────────────────────────────────────────────────────────

    def _pim(self, obj):
        return obj.pim.first()

    def _own_variant(self, obj):
        """The ProductVariant record whose operational_product is this Product."""
        return getattr(obj, "pim_variant", None)

    # ── media ─────────────────────────────────────────────────────────────────

    def get_image(self, obj):
        own_v = self._own_variant(obj)
        if own_v and own_v.image:
            return serialize_media_url(self.context.get("request"), own_v.image)
        return serialize_media_url(self.context.get("request"), obj.image)

    def get_video(self, obj):
        return serialize_media_url(self.context.get("request"), getattr(obj, "video", None))

    # ── category ─────────────────────────────────────────────────────────────

    def get_category_slug(self, obj):
        master = getattr(obj, "category_master", None)
        return getattr(master, "slug", "") if master else ""

    # ── description ──────────────────────────────────────────────────────────

    def get_pim_description(self, obj):
        pim = self._pim(obj)
        # Variant product: prefer parent's description for richer content
        if pim and pim.parent_id and not pim.description:
            parent_desc = pim.parent.description if pim.parent else None
            if parent_desc:
                return parent_desc
        if pim and pim.description:
            return pim.description
        return obj.description

    # ── attributes ───────────────────────────────────────────────────────────

    def get_pim_attributes(self, obj):
        pim = self._pim(obj)
        if not pim:
            return []

        attr_map = {}

        # 1. Base-level ProductAttribute records on the PimProduct itself
        for attr in pim.attributes.all():
            val = attr.display_value
            if val:
                name = attr.attribute.name
                val_str = str(val)
                if name in attr_map:
                    if val_str not in attr_map[name]:
                        attr_map[name] += f", {val_str}"
                else:
                    attr_map[name] = val_str

        # 2. If this is a variant product, pull VariantAttributeValue records
        #    from the linked ProductVariant — these are the defining attrs
        #    (Size, Bed Type, Material, etc.) stored on the variant entity.
        own_v = self._own_variant(obj)
        if pim.parent_id and own_v:
            for name, val in _variant_attr_map(own_v).items():
                attr_map[name] = val  # variant attrs override base-product attrs

        return [{"name": name, "value": val} for name, val in attr_map.items()]

    # ── price range (base products only) ─────────────────────────────────────

    def get_price_range(self, obj):
        pim = self._pim(obj)
        if not pim or pim.parent_id:
            return None
        prices = list(
            pim.variants.filter(is_active=True)
            .exclude(price__isnull=True)
            .values_list("price", flat=True)
        )
        if not prices:
            return None
        floats = [float(p) for p in prices]
        return {
            "min": str(min(floats)),
            "max": str(max(floats)),
            "count": len(floats),
        }

    # ── pim_variants (base products only) ────────────────────────────────────

    def get_pim_variants(self, obj):
        pim = self._pim(obj)
        if not pim or pim.parent_id:
            # Variant products don't list sub-variants
            return []

        variants = []
        for variant in pim.variants.filter(is_active=True):
            op = getattr(variant, "operational_product", None)
            variants.append({
                "id": variant.id,
                "sku": variant.sku,
                "price": str(variant.price),
                "image": serialize_media_url(self.context.get("request"), variant.image) if variant.image else (
                    serialize_media_url(self.context.get("request"), op.image) if op and op.image else None
                ),
                "attributes": _variant_attr_map(variant),
                "is_low_stock": variant.is_low_stock,
                "stock_status": "IN_STOCK" if variant.quantity_on_hand > 0 else "MAKE_TO_ORDER",
                # Deep-link: public page URL for this variant's own Product record
                "product_id": op.id if op else None,
            })
        return variants

    # ── variant-page extras ───────────────────────────────────────────────────

    def get_is_variant_page(self, obj):
        pim = self._pim(obj)
        return bool(pim and pim.parent_id)

    def get_parent_product_id(self, obj):
        """ID of the base Product record so the variant page can link back."""
        pim = self._pim(obj)
        if not pim or not pim.parent_id:
            return None
        parent_pim = pim.parent
        if not parent_pim:
            return None
        # The base PimProduct's operational product
        base_op = parent_pim.pim_products.first() if hasattr(parent_pim, "pim_products") else None
        # pim related_name on Product is "pim", so parent_pim.pim_product is the Product
        try:
            return parent_pim.pim_product.id
        except Exception:
            # fallback: look up Product by product_code == parent_pim.code
            try:
                return Product.objects.get(product_code=parent_pim.code).id
            except Product.DoesNotExist:
                return None

    def get_selected_attributes(self, obj):
        """The specific attribute values that define THIS variant (for pre-selecting on the base page)."""
        own_v = self._own_variant(obj)
        if not own_v:
            return {}
        return _variant_attr_map(own_v)

    def get_sibling_variants(self, obj):
        """All other variant Products under the same base blueprint."""
        pim = self._pim(obj)
        if not pim or not pim.parent_id:
            return []
        parent_pim = pim.parent
        if not parent_pim:
            return []

        siblings = []
        for variant in parent_pim.variants.filter(is_active=True).prefetch_related(
            "attribute_values__attribute", "operational_product"
        ):
            op = getattr(variant, "operational_product", None)
            if not op:
                continue
            attrs = _variant_attr_map(variant)
            # Build a short label from the most meaningful attrs
            label_parts = []
            for key in ("Size", "Bed Type", "Color", "Variant", "Type"):
                if key in attrs:
                    label_parts.append(attrs[key])
            label = " · ".join(label_parts) if label_parts else variant.sku
            siblings.append({
                "product_id": op.id,
                "sku": variant.sku,
                "label": label,
                "price": str(variant.price),
                "image": serialize_media_url(
                    self.context.get("request"),
                    variant.image or op.image,
                ),
                "attributes": attrs,
                "is_current": op.id == obj.id,
            })
        return siblings


class PublicProductCategorySerializer(serializers.ModelSerializer):
    """Public-safe category metadata. Exposes only display/SEO fields."""

    public_image = serializers.SerializerMethodField()

    class Meta:
        model = ProductCategoryMaster
        fields = [
            "id",
            "name",
            "slug",
            "public_title",
            "seo_title",
            "seo_description",
            "public_image",
            "sort_order",
        ]

    def get_public_image(self, obj):
        return serialize_media_url(self.context.get("request"), obj.public_image)
