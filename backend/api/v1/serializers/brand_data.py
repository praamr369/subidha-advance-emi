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


class BrandDirectProfileSerializer(serializers.Serializer):
    """Direct-save form fields — no batch/approval workflow required."""
    display_name = serializers.CharField(required=False, allow_blank=True)
    tagline = serializers.CharField(required=False, allow_blank=True)
    hero_subtitle = serializers.CharField(required=False, allow_blank=True)
    support_phone = serializers.CharField(required=False, allow_blank=True)
    whatsapp_phone = serializers.CharField(required=False, allow_blank=True)
    support_email = serializers.EmailField(required=False, allow_blank=True)
    address_text = serializers.CharField(required=False, allow_blank=True)
    business_hours = serializers.CharField(required=False, allow_blank=True)
    map_url = serializers.URLField(required=False, allow_blank=True)
    public_logo_url = serializers.URLField(required=False, allow_blank=True)
    # Social link URLs (saved to SocialLink model)
    facebook_url = serializers.URLField(required=False, allow_blank=True)
    instagram_url = serializers.URLField(required=False, allow_blank=True)
    youtube_url = serializers.URLField(required=False, allow_blank=True)
    justdial_url = serializers.URLField(required=False, allow_blank=True)
    website_url = serializers.URLField(required=False, allow_blank=True)
    whatsapp_url = serializers.URLField(required=False, allow_blank=True)


class BrandApplySerializer(serializers.Serializer):
    approved_item_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False)


class BrandImportItemActionSerializer(serializers.Serializer):
    item_id = serializers.IntegerField(min_value=1)
    action = serializers.ChoiceField(choices=["approve", "reject"])
    note = serializers.CharField(required=False, allow_blank=True)
