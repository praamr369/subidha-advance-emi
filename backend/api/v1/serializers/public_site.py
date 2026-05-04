from urllib.parse import urlparse

from rest_framework import serializers

from api.v1.serializers.business_setup import BusinessSetupModelSerializer
from subscriptions.models_business_setup import PublicBusinessProfile


def _validate_https_url(value: str, field_name: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        return ""

    parsed = urlparse(cleaned)
    if parsed.scheme not in {"https"}:
        raise serializers.ValidationError("URL must start with https://")
    if not parsed.netloc:
        raise serializers.ValidationError("Invalid URL.")
    return cleaned


class PublicBusinessProfileSerializer(BusinessSetupModelSerializer):
    """Admin-only serializer for public-facing site copy (no internal business-setup secrets)."""

    class Meta:
        model = PublicBusinessProfile
        fields = (
            "id",
            "display_name",
            "tagline",
            "hero_title",
            "hero_subtitle",
            "support_phone",
            "support_email",
            "whatsapp_phone",
            "whatsapp_link",
            "facebook_url",
            "instagram_url",
            "youtube_url",
            "address_text",
            "map_url",
            "business_hours",
            "public_logo_url",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_support_phone(self, value: str) -> str:
        return (value or "").strip()

    def validate_support_email(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            return ""
        return cleaned

    def validate_whatsapp_phone(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            return ""

        digits = "".join(ch for ch in cleaned if ch.isdigit())
        # For Indian operations we expect a 10-digit number; allow +91 prefix but normalize to digits.
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        if len(digits) != 10:
            raise serializers.ValidationError("WhatsApp phone must be a 10-digit number.")
        return digits

    def validate_whatsapp_link(self, value: str) -> str:
        return _validate_https_url(value, "whatsapp_link")

    def validate_facebook_url(self, value: str) -> str:
        return _validate_https_url(value, "facebook_url")

    def validate_instagram_url(self, value: str) -> str:
        return _validate_https_url(value, "instagram_url")

    def validate_youtube_url(self, value: str) -> str:
        return _validate_https_url(value, "youtube_url")

    def validate_map_url(self, value: str) -> str:
        return _validate_https_url(value, "map_url")

    def validate_public_logo_url(self, value: str) -> str:
        return _validate_https_url(value, "public_logo_url")


class PublicBusinessProfilePublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = PublicBusinessProfile
        fields = [
            "display_name",
            "tagline",
            "hero_title",
            "hero_subtitle",
            "support_phone",
            "support_email",
            "whatsapp_phone",
            "whatsapp_link",
            "facebook_url",
            "instagram_url",
            "youtube_url",
            "address_text",
            "map_url",
            "business_hours",
            "public_logo_url",
            "updated_at",
        ]
        read_only_fields = fields
