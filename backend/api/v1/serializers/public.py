from rest_framework import serializers

from api.v1.serializers.media import serialize_media_url
from subscriptions.models import Product, ProductCategoryMaster


class PublicProductSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    category_slug = serializers.SerializerMethodField()

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
            "description",
        ]

    def get_image(self, obj):
        return serialize_media_url(self.context.get("request"), obj.image)

    def get_category_slug(self, obj):
        # Canonical public category slug when the product is linked to a
        # category master; empty otherwise. Read-only, public-safe.
        master = getattr(obj, "category_master", None)
        return getattr(master, "slug", "") if master else ""


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
