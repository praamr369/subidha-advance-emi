from rest_framework import serializers

from api.v1.serializers.media import serialize_media_url
from subscriptions.models import (
    Batch,
    Product,
    SubscriptionRequest,
)


class SubscriptionRequestReadSerializer(serializers.ModelSerializer):
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
    approved_subscription_number = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionRequest
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
        if not obj.approved_subscription_id:
            return None
        return f"SUB-{obj.approved_subscription_id}"


class CustomerSubscriptionRequestCreateSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
    )
    batch_id = serializers.PrimaryKeyRelatedField(
        source="batch",
        queryset=Batch.objects.all(),
    )
    preferred_lucky_number = serializers.IntegerField(min_value=0, max_value=99)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class PartnerSubscriptionRequestCreateSerializer(serializers.Serializer):
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
    batch_id = serializers.PrimaryKeyRelatedField(
        source="batch",
        queryset=Batch.objects.all(),
    )
    preferred_lucky_number = serializers.IntegerField(min_value=0, max_value=99)
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
                "Provide either customer_id or new customer snapshot fields, not both."
            )

        if not has_customer_id:
            missing = {}
            if not (attrs.get("requested_customer_name") or "").strip():
                missing["requested_customer_name"] = "This field is required for a new customer request."
            if not (attrs.get("requested_customer_phone") or "").strip():
                missing["requested_customer_phone"] = "This field is required for a new customer request."
            if not (attrs.get("requested_customer_email") or "").strip():
                missing["requested_customer_email"] = "This field is required for a new customer request."
            if missing:
                raise serializers.ValidationError(missing)

        return attrs


class SubscriptionRequestDecisionSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def get_note(self):
        validated = getattr(self, "validated_data", {})
        return (validated.get("note") or validated.get("reason") or "").strip()


class SubscriptionRequestApprovalSerializer(serializers.Serializer):
    review_note = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    customer_id = serializers.IntegerField(required=False)
    create_customer = serializers.BooleanField(required=False, default=False)
    lucky_number_override = serializers.IntegerField(
        required=False,
        min_value=0,
        max_value=99,
    )
