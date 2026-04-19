from rest_framework import serializers

from subscriptions.models import DeliveryStatus, PlanType, Subscription, SubscriptionDelivery
from subscriptions.services.delivery_service import (
    build_subscription_delivery_summary,
)


class _BaseSubscriptionDeliveryReadSerializer(serializers.ModelSerializer):
    subscription_id = serializers.IntegerField(source="subscription.id", read_only=True)
    subscription_number = serializers.SerializerMethodField()
    customer_id = serializers.IntegerField(source="subscription.customer.id", read_only=True)
    customer_name = serializers.CharField(source="subscription.customer.name", read_only=True)
    customer_phone = serializers.CharField(source="subscription.customer.phone", read_only=True)
    product_id = serializers.IntegerField(source="subscription.product.id", read_only=True)
    product_name = serializers.CharField(source="subscription.product.name", read_only=True)
    product_code = serializers.CharField(source="subscription.product.product_code", read_only=True)
    batch_id = serializers.IntegerField(source="subscription.batch.id", read_only=True)
    batch_code = serializers.CharField(source="subscription.batch.batch_code", read_only=True)
    partner_id = serializers.IntegerField(source="subscription.partner.id", read_only=True)
    partner_username = serializers.CharField(source="subscription.partner.username", read_only=True)
    lucky_id = serializers.IntegerField(source="subscription.lucky_id.id", read_only=True)
    lucky_number = serializers.IntegerField(source="subscription.lucky_id.lucky_number", read_only=True)
    fulfillment_status = serializers.CharField(
        source="subscription.fulfillment_status",
        read_only=True,
    )
    is_terminal = serializers.SerializerMethodField()
    is_active_delivery = serializers.SerializerMethodField()

    def get_subscription_number(self, obj):
        return f"SUB-{obj.subscription_id}" if obj.subscription_id else None

    def get_is_terminal(self, obj):
        return obj.is_terminal

    def get_is_active_delivery(self, obj):
        return obj.is_active_delivery


class AdminSubscriptionDeliveryReadSerializer(_BaseSubscriptionDeliveryReadSerializer):
    created_by_id = serializers.IntegerField(source="created_by.id", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    updated_by_id = serializers.IntegerField(source="updated_by.id", read_only=True)
    updated_by_username = serializers.CharField(source="updated_by.username", read_only=True)

    class Meta:
        model = SubscriptionDelivery
        fields = (
            "id",
            "subscription",
            "subscription_id",
            "subscription_number",
            "customer_id",
            "customer_name",
            "customer_phone",
            "product_id",
            "product_name",
            "product_code",
            "batch_id",
            "batch_code",
            "partner_id",
            "partner_username",
            "lucky_id",
            "lucky_number",
            "status",
            "delivery_reference",
            "scheduled_date",
            "dispatched_at",
            "out_for_delivery_at",
            "delivered_at",
            "failed_at",
            "cancelled_at",
            "return_requested_at",
            "returned_at",
            "receiver_name",
            "receiver_phone",
            "delivery_address_snapshot",
            "notes",
            "failure_reason",
            "created_by_id",
            "created_by_username",
            "updated_by_id",
            "updated_by_username",
            "created_at",
            "updated_at",
            "fulfillment_status",
            "is_terminal",
            "is_active_delivery",
        )
        read_only_fields = fields


class CustomerSubscriptionDeliveryReadSerializer(_BaseSubscriptionDeliveryReadSerializer):
    class Meta:
        model = SubscriptionDelivery
        fields = (
            "id",
            "subscription",
            "subscription_id",
            "subscription_number",
            "customer_id",
            "customer_name",
            "customer_phone",
            "product_id",
            "product_name",
            "product_code",
            "batch_id",
            "batch_code",
            "lucky_id",
            "lucky_number",
            "status",
            "delivery_reference",
            "scheduled_date",
            "dispatched_at",
            "out_for_delivery_at",
            "delivered_at",
            "failed_at",
            "cancelled_at",
            "return_requested_at",
            "returned_at",
            "receiver_name",
            "receiver_phone",
            "delivery_address_snapshot",
            "notes",
            "failure_reason",
            "created_at",
            "updated_at",
            "fulfillment_status",
            "is_terminal",
            "is_active_delivery",
        )
        read_only_fields = fields


class AdminSubscriptionDeliveryCreateSerializer(serializers.Serializer):
    subscription = serializers.PrimaryKeyRelatedField(
        queryset=Subscription.objects.select_related(
            "customer",
            "product",
            "batch",
            "partner",
            "lucky_id",
        ).all()
    )
    status = serializers.ChoiceField(
        choices=[
            DeliveryStatus.PENDING,
            DeliveryStatus.SCHEDULED,
        ],
        default=DeliveryStatus.PENDING,
    )
    delivery_reference = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=64,
    )
    scheduled_date = serializers.DateField(required=False, allow_null=True)
    receiver_name = serializers.CharField(required=False, allow_blank=True, max_length=100)
    receiver_phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    delivery_address_snapshot = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        status = attrs.get("status", DeliveryStatus.PENDING)
        scheduled_date = attrs.get("scheduled_date")
        if status == DeliveryStatus.SCHEDULED and not scheduled_date:
            raise serializers.ValidationError(
                {"scheduled_date": "Scheduled date is required when starting in SCHEDULED status."}
            )
        return attrs


class AdminSubscriptionDeliveryUpdateSerializer(serializers.Serializer):
    scheduled_date = serializers.DateField(required=False, allow_null=True)
    receiver_name = serializers.CharField(required=False, allow_blank=True, max_length=100)
    receiver_phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    delivery_address_snapshot = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    failure_reason = serializers.CharField(required=False, allow_blank=True)


class AdminSubscriptionDeliveryTransitionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=DeliveryStatus.choices)
    scheduled_date = serializers.DateField(required=False, allow_null=True)
    receiver_name = serializers.CharField(required=False, allow_blank=True, max_length=100)
    receiver_phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    notes = serializers.CharField(required=False, allow_blank=True)
    failure_reason = serializers.CharField(required=False, allow_blank=True)


class AdminSubscriptionDeliveryMarkDeliveredSerializer(serializers.Serializer):
    receiver_name = serializers.CharField(required=False, allow_blank=True, max_length=100)
    receiver_phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    notes = serializers.CharField(required=False, allow_blank=True)


class AdminSubscriptionDeliveryReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class AdminSubscriptionDeliveryNotesSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)


class AdminDeliverySourceSubscriptionSerializer(serializers.ModelSerializer):
    subscription_number = serializers.SerializerMethodField()
    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    product_id = serializers.IntegerField(source="product.id", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    batch_id = serializers.IntegerField(source="batch.id", read_only=True)
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    lucky_id = serializers.IntegerField(source="lucky_id.id", read_only=True)
    lucky_number = serializers.IntegerField(source="lucky_id.lucky_number", read_only=True)
    delivery_summary = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = (
            "id",
            "subscription_number",
            "plan_type",
            "contract_reference",
            "fulfillment_status",
            "customer_id",
            "customer_name",
            "customer_phone",
            "product_id",
            "product_name",
            "product_code",
            "batch_id",
            "batch_code",
            "lucky_id",
            "lucky_number",
            "delivery_summary",
            "created_at",
        )
        read_only_fields = fields

    def get_subscription_number(self, obj):
        return f"SUB-{obj.pk}" if obj.pk else None

    def get_delivery_summary(self, obj):
        return build_subscription_delivery_summary(obj)


class AdminDeliverySourceSubscriptionPrefillSerializer(serializers.Serializer):
    source = AdminDeliverySourceSubscriptionSerializer()
    defaults = serializers.DictField(child=serializers.CharField(allow_blank=True), required=True)

    def validate_defaults(self, value: dict) -> dict:
        return dict(value or {})


class AdminDeliverySourceSubscriptionsQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    plan_type = serializers.ChoiceField(
        required=False,
        allow_null=True,
        choices=list(PlanType.values),
    )
    limit = serializers.IntegerField(required=False, min_value=1, max_value=50)
