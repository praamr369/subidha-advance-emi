from rest_framework import serializers

from api.v1.serializers.media import serialize_media_url
from subscriptions.models import Product, ProductCategoryMaster


class PublicProductSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    video = serializers.SerializerMethodField()
    category_slug = serializers.SerializerMethodField()
    pim_description = serializers.SerializerMethodField()
    pim_attributes = serializers.SerializerMethodField()
    pim_variants = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "product_code",
            "name",
            "base_price",
            "category",
            "category_slug",
            "subcategory",
            "image",
            "video",
            "description",
            "pim_description",
            "pim_attributes",
            "pim_variants",
        ]

    def get_image(self, obj):
        return serialize_media_url(self.context.get("request"), obj.image)

    def get_video(self, obj):
        return serialize_media_url(self.context.get("request"), getattr(obj, "video", None))

    def get_category_slug(self, obj):
        # Canonical public category slug when the product is linked to a
        # category master; empty otherwise. Read-only, public-safe.
        master = getattr(obj, "category_master", None)
        return getattr(master, "slug", "") if master else ""

    def get_pim_description(self, obj):
        pim = obj.pim.first()
        if pim and pim.description:
            return pim.description
        return obj.description

    def get_pim_attributes(self, obj):
        pim = obj.pim.first()
        if not pim:
            return []
        # Group by attribute name to prevent duplicate names
        attr_map = {}
        for attr in pim.attributes.all():
            val = attr.display_value
            if val:
                name = attr.attribute.name
                val_str = str(val)
                if name in attr_map:
                    # Append value if it's not already in the string (prevent exact duplicates)
                    if val_str not in attr_map[name]:
                        attr_map[name] += f", {val_str}"
                else:
                    attr_map[name] = val_str
                    
        return [{"name": name, "value": val} for name, val in attr_map.items()]

    def get_pim_variants(self, obj):
        pim = obj.pim.first()
        if not pim:
            return []
        
        variants = []
        for variant in pim.variants.filter(is_active=True):
            attrs = {}
            for v_attr in variant.attribute_values.select_related("attribute"):
                val = v_attr.value_text
                if not val and v_attr.value_number is not None:
                    val = str(v_attr.value_number)
                if not val and v_attr.value_boolean is not None:
                    val = "Yes" if v_attr.value_boolean else "No"
                attrs[v_attr.attribute.name] = val
                
            variants.append({
                "id": variant.id,
                "sku": variant.sku,
                "price": str(variant.price),
                "image": serialize_media_url(self.context.get("request"), variant.image) if variant.image else None,
                "attributes": attrs,
                "is_low_stock": variant.is_low_stock,
                "stock_status": "IN_STOCK" if variant.quantity_on_hand > 0 else "MAKE_TO_ORDER",
            })
        return variants


class PublicProductCategorySerializer(serializers.ModelSerializer):
    """Public-safe category metadata. Exposes only display/SEO fields — never
    internal counts, cost, stock, or accounting data."""

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
