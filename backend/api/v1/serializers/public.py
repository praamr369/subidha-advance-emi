from rest_framework import serializers
from subscriptions.models import Product

class PublicProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['id', 'product_code', 'name', 'base_price', 'category', 'subcategory', 'image', 'description']