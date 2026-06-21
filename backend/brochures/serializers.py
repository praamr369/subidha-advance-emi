from __future__ import annotations

from django.urls import reverse
from django.utils import timezone
from rest_framework import serializers

from brochures.models import BrochureDocument


class BrochureRequestSerializer(serializers.Serializer):
    brochure_type = serializers.ChoiceField(
        choices=BrochureDocument.BrochureType.choices
    )
    title = serializers.CharField(max_length=160, required=False, allow_blank=True)
    category = serializers.CharField(
        max_length=120, required=False, allow_blank=True, allow_null=True
    )
    product_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=True,
        default=list,
    )
    expires_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate(self, attrs):
        attrs["product_ids"] = list(dict.fromkeys(attrs.get("product_ids") or []))
        if (
            attrs["brochure_type"] == BrochureDocument.BrochureType.CUSTOM
            and not attrs["product_ids"]
        ):
            raise serializers.ValidationError(
                {"product_ids": "Select at least one product for a custom brochure."}
            )
        expires_at = attrs.get("expires_at")
        if expires_at and expires_at <= timezone.now():
            raise serializers.ValidationError(
                {"expires_at": "Expiry must be in the future."}
            )
        return attrs


class BrochureProductQuerySerializer(serializers.Serializer):
    brochure_type = serializers.ChoiceField(
        choices=BrochureDocument.BrochureType.choices
    )
    category = serializers.CharField(max_length=120, required=False, allow_blank=True)


def brochure_pdf_url(document: BrochureDocument, request=None) -> str:
    if not document.pdf_file:
        return ""
    url = document.pdf_file.url
    return request.build_absolute_uri(url) if request else url


def brochure_public_url(document: BrochureDocument, request=None) -> str:
    url = reverse(
        "public-brochure-detail", kwargs={"public_token": document.public_token}
    )
    return request.build_absolute_uri(url) if request else url


def brochure_whatsapp_message(document: BrochureDocument, request=None) -> str:
    return (
        "Hello, please check our latest Subidha Furniture product catalog:\n"
        f"{brochure_public_url(document, request)}\n\n"
        "You can rent, lease, buy directly, or ask for Lucky EMI options depending on product availability.\n"
        "Prices are indicative until final confirmation."
    )


class BrochureDocumentSerializer(serializers.ModelSerializer):
    pdf_url = serializers.SerializerMethodField()
    public_url = serializers.SerializerMethodField()
    whatsapp_message = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(
        source="created_by.username", read_only=True
    )

    class Meta:
        model = BrochureDocument
        fields = [
            "id",
            "brochure_no",
            "title",
            "brochure_type",
            "status",
            "expires_at",
            "created_at",
            "updated_at",
            "created_by_name",
            "filter_payload",
            "product_snapshot",
            "product_count",
            "pdf_url",
            "public_url",
            "whatsapp_message",
        ]
        read_only_fields = fields

    def get_pdf_url(self, obj):
        return brochure_pdf_url(obj, self.context.get("request"))

    def get_public_url(self, obj):
        return brochure_public_url(obj, self.context.get("request"))

    def get_whatsapp_message(self, obj):
        return brochure_whatsapp_message(obj, self.context.get("request"))

    def get_product_count(self, obj):
        return len(obj.product_snapshot or [])


class PublicBrochureSerializer(serializers.ModelSerializer):
    pdf_url = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    products = serializers.JSONField(source="product_snapshot", read_only=True)

    class Meta:
        model = BrochureDocument
        fields = [
            "brochure_no",
            "title",
            "brochure_type",
            "status",
            "expires_at",
            "created_at",
            "product_count",
            "products",
            "pdf_url",
        ]
        read_only_fields = fields

    def get_pdf_url(self, obj):
        return brochure_pdf_url(obj, self.context.get("request"))

    def get_product_count(self, obj):
        return len(obj.product_snapshot or [])
