from rest_framework import serializers

from api.v1.serializers.media import serialize_media_url
from subscriptions.models import (
    Batch,
    Product,
    ProductRequest,
    ProductRequestType,
)


class ProductRequestReadSerializer(serializers.ModelSerializer):
    requester_username = serializers.CharField(source="requester.username", read_only=True)
    partner_id = serializers.IntegerField(source="partner.id", read_only=True)
    partner_username = serializers.CharField(source="partner.username", read_only=True)
    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    customer_email = serializers.CharField(source="customer.user.email", read_only=True)
    product_id = serializers.IntegerField(source="product.id", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    product_image = serializers.SerializerMethodField()
    batch_id = serializers.IntegerField(source="batch.id", read_only=True)
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    reviewed_by_username = serializers.CharField(source="reviewed_by.username", read_only=True)
    approved_subscription_id = serializers.IntegerField(
        source="approved_subscription.id",
        read_only=True,
    )
    approved_direct_sale_id = serializers.IntegerField(
        source="approved_direct_sale.id",
        read_only=True,
    )
    approved_subscription_number = serializers.SerializerMethodField()
    approved_direct_sale_number = serializers.SerializerMethodField()

    class Meta:
        model = ProductRequest
        fields = (
            "id",
            "requester",
            "requester_username",
            "requester_role_snapshot",
            "partner",
            "partner_id",
            "partner_username",
            "customer",
            "customer_id",
            "customer_name",
            "customer_phone",
            "customer_email",
            "requested_customer_name",
            "requested_customer_phone",
            "requested_customer_email",
            "requested_customer_address",
            "requested_customer_city",
            "product",
            "product_id",
            "product_name",
            "product_code",
            "product_image",
            "request_type",
            "batch",
            "batch_id",
            "batch_code",
            "preferred_lucky_number",
            "requested_tenure_months_snapshot",
            "notes",
            "status",
            "reviewed_by",
            "reviewed_by_username",
            "reviewed_at",
            "review_note",
            "approved_subscription_id",
            "approved_subscription_number",
            "approved_direct_sale_id",
            "approved_direct_sale_number",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_product_image(self, obj):
        return serialize_media_url(
            self.context.get("request"),
            getattr(obj.product, "image", None),
        )

    def get_approved_subscription_number(self, obj):
        if not getattr(obj, "approved_subscription_id", None):
            return None
        return f"SUB-{obj.approved_subscription_id}"

    def get_approved_direct_sale_number(self, obj):
        if not getattr(obj, "approved_direct_sale_id", None):
            return None
        return f"SALE-{obj.approved_direct_sale_id}"


class CustomerProductRequestCreateSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
    )
    request_type = serializers.ChoiceField(choices=ProductRequestType.choices)
    batch_id = serializers.PrimaryKeyRelatedField(
        source="batch",
        queryset=Batch.objects.all(),
        required=False,
        allow_null=True,
    )
    preferred_lucky_number = serializers.IntegerField(min_value=0, max_value=99, required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        request_type = attrs.get("request_type")
        if request_type == ProductRequestType.ADVANCE_EMI:
            if not attrs.get("batch"):
                raise serializers.ValidationError({"batch_id": "Batch is required for EMI requests."})
            if attrs.get("preferred_lucky_number") is None:
                raise serializers.ValidationError({"preferred_lucky_number": "Lucky number is required for EMI requests."})
        return attrs


class PartnerProductRequestCreateSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(required=False)
    requested_customer_name = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    requested_customer_phone = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    requested_customer_email = serializers.EmailField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    requested_customer_address = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    requested_customer_city = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
    )
    request_type = serializers.ChoiceField(choices=ProductRequestType.choices)
    batch_id = serializers.PrimaryKeyRelatedField(
        source="batch",
        queryset=Batch.objects.all(),
        required=False,
        allow_null=True,
    )
    preferred_lucky_number = serializers.IntegerField(min_value=0, max_value=99, required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        has_customer_id = attrs.get("customer_id") is not None
        has_new_customer_details = any(
            [
                (attrs.get("requested_customer_name") or "").strip(),
                (attrs.get("requested_customer_phone") or "").strip(),
                (attrs.get("requested_customer_email") or "").strip(),
                (attrs.get("requested_customer_address") or "").strip(),
                (attrs.get("requested_customer_city") or "").strip(),
            ]
        )

        if has_customer_id and has_new_customer_details:
            raise serializers.ValidationError(
                {"detail": "Provide either an existing customer ID or new customer details, not both."}
            )

        if not has_customer_id and not has_new_customer_details:
            raise serializers.ValidationError(
                {"detail": "Must provide either customer ID or new customer details."}
            )

        if not has_customer_id:
            if not (attrs.get("requested_customer_name") or "").strip():
                raise serializers.ValidationError({"requested_customer_name": "Required for new customer."})
            if not (attrs.get("requested_customer_phone") or "").strip():
                raise serializers.ValidationError({"requested_customer_phone": "Required for new customer."})
            if not (attrs.get("requested_customer_city") or "").strip():
                raise serializers.ValidationError({"requested_customer_city": "Required for new customer."})

        request_type = attrs.get("request_type")
        if request_type == ProductRequestType.ADVANCE_EMI:
            if not attrs.get("batch"):
                raise serializers.ValidationError({"batch_id": "Batch is required for EMI requests."})
            if attrs.get("preferred_lucky_number") is None:
                raise serializers.ValidationError({"preferred_lucky_number": "Lucky number is required for EMI requests."})

        return attrs


class ProductRequestDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["APPROVE", "REJECT"])
    review_note = serializers.CharField(required=False, allow_blank=True)


class AdminProductRequestEditSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)
    requested_customer_name = serializers.CharField(required=False, allow_blank=True)
    requested_customer_phone = serializers.CharField(required=False, allow_blank=True)
    requested_customer_email = serializers.EmailField(required=False, allow_blank=True)
    requested_customer_address = serializers.CharField(required=False, allow_blank=True)
    requested_customer_city = serializers.CharField(required=False, allow_blank=True)


class AdminProductRequestCancelSerializer(serializers.Serializer):
    review_note = serializers.CharField(required=False, allow_blank=True, default="")
