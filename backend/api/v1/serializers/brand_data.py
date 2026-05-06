from rest_framework import serializers


class BrandManualPreviewSerializer(serializers.Serializer):
    business_name = serializers.CharField(required=False, allow_blank=True)
    brand_name = serializers.CharField(required=False, allow_blank=True)
    tagline = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    whatsapp = serializers.CharField(required=False, allow_blank=True)
    email = serializers.CharField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True)
    state = serializers.CharField(required=False, allow_blank=True)
    pincode = serializers.CharField(required=False, allow_blank=True)
    service_areas = serializers.ListField(required=False, child=serializers.CharField(), allow_empty=True)
    opening_hours = serializers.CharField(required=False, allow_blank=True)
    google_maps_url = serializers.URLField(required=False, allow_blank=True)
    website_url = serializers.URLField(required=False, allow_blank=True)
    facebook_url = serializers.URLField(required=False, allow_blank=True)
    youtube_url = serializers.URLField(required=False, allow_blank=True)
    instagram_url = serializers.URLField(required=False, allow_blank=True)
    justdial_url = serializers.URLField(required=False, allow_blank=True)
    logo_url = serializers.URLField(required=False, allow_blank=True)
    storefront_image_urls = serializers.ListField(required=False, child=serializers.URLField(), allow_empty=True)
    selected_review_quotes = serializers.ListField(required=False, child=serializers.CharField(), allow_empty=True)


class BrandApplySerializer(serializers.Serializer):
    approved_item_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False)


class BrandImportItemActionSerializer(serializers.Serializer):
    item_id = serializers.IntegerField(min_value=1)
    action = serializers.ChoiceField(choices=["approve", "reject"])
    note = serializers.CharField(required=False, allow_blank=True)
