from rest_framework import serializers

from api.v1.serializers.media import serialize_media_url
from subscriptions.models import Product


class PublicProductSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "product_code",
            "name",
            "base_price",
            "category",
            "subcategory",
            "image",
            "description",
        ]

    def get_image(self, obj):
        return serialize_media_url(self.context.get("request"), obj.image)
