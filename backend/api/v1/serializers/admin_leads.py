from rest_framework import serializers

from accounts.models import User, UserRole
from subscriptions.models import Customer, PublicLead, Subscription


class AdminLeadListSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(source="product.id", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    product_base_price = serializers.DecimalField(
        source="product.base_price",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )
    assigned_to_id = serializers.IntegerField(source="assigned_to.id", read_only=True)
    assigned_to_username = serializers.CharField(
        source="assigned_to.username",
        read_only=True,
    )
    assigned_to_role = serializers.CharField(source="assigned_to.role", read_only=True)
    assigned_to_full_name = serializers.SerializerMethodField()
    converted_customer_id = serializers.IntegerField(
        source="converted_customer.id",
        read_only=True,
    )
    converted_customer_name = serializers.CharField(
        source="converted_customer.name",
        read_only=True,
    )
    converted_customer_phone = serializers.CharField(
        source="converted_customer.phone",
        read_only=True,
    )
    converted_subscription_id = serializers.IntegerField(
        source="converted_subscription.id",
        read_only=True,
    )
    converted_subscription_number = serializers.SerializerMethodField()
    converted_by_id = serializers.IntegerField(source="converted_by.id", read_only=True)
    converted_by_username = serializers.CharField(
        source="converted_by.username",
        read_only=True,
    )
    converted_by_full_name = serializers.SerializerMethodField()

    class Meta:
        model = PublicLead
        fields = (
            "id",
            "name",
            "phone",
            "city",
            "product_id",
            "product_name",
            "product_code",
            "product_base_price",
            "interested_product",
            "preferred_emi_amount",
            "status",
            "source",
            "assigned_to_id",
            "assigned_to_username",
            "assigned_to_role",
            "assigned_to_full_name",
            "assigned_at",
            "contacted_at",
            "converted_customer_id",
            "converted_customer_name",
            "converted_customer_phone",
            "converted_subscription_id",
            "converted_subscription_number",
            "converted_by_id",
            "converted_by_username",
            "converted_by_full_name",
            "converted_at",
            "closed_at",
            "created_at",
        )

    def get_assigned_to_full_name(self, obj):
        user = getattr(obj, "assigned_to", None)
        if not user:
            return None

        full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
        return full_name or user.username

    def get_converted_subscription_number(self, obj):
        subscription = getattr(obj, "converted_subscription", None)
        if not subscription:
            return None
        return subscription.contract_reference or f"Subscription #{subscription.id}"

    def get_converted_by_full_name(self, obj):
        user = getattr(obj, "converted_by", None)
        if not user:
            return None

        full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
        return full_name or user.username


class AdminLeadDetailSerializer(AdminLeadListSerializer):
    submitted_notes = serializers.CharField(source="notes", read_only=True)
    admin_notes = serializers.CharField(read_only=True)

    class Meta(AdminLeadListSerializer.Meta):
        fields = AdminLeadListSerializer.Meta.fields + (
            "submitted_notes",
            "admin_notes",
        )


class AdminLeadStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=PublicLead._meta.get_field("status").choices)


class AdminLeadAssignSerializer(serializers.Serializer):
    assigned_to = serializers.IntegerField(required=False, allow_null=True)

    def validate_assigned_to(self, value):
        if value is None:
            return None

        try:
            user = User.objects.get(pk=value)
        except User.DoesNotExist as exc:
            raise serializers.ValidationError("Selected assignee does not exist.") from exc

        if user.role not in {UserRole.ADMIN, UserRole.CASHIER, UserRole.PARTNER}:
            raise serializers.ValidationError(
                "Lead assignee must be an internal managed user."
            )

        if not user.is_active:
            raise serializers.ValidationError("Lead assignee must be active.")

        return user


class AdminLeadNoteUpdateSerializer(serializers.Serializer):
    note = serializers.CharField(allow_blank=False, trim_whitespace=True)
    mode = serializers.ChoiceField(
        choices=(
            ("append", "Append"),
            ("replace", "Replace"),
        ),
        required=False,
        default="append",
    )


class AdminLeadConversionCompleteSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(required=False, allow_null=True)
    subscription_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_customer_id(self, value):
        if value is None:
            return None

        try:
            return Customer.objects.get(pk=value)
        except Customer.DoesNotExist as exc:
            raise serializers.ValidationError(
                "Selected converted customer does not exist."
            ) from exc

    def validate_subscription_id(self, value):
        if value is None:
            return None

        try:
            return Subscription.objects.select_related("customer").get(pk=value)
        except Subscription.DoesNotExist as exc:
            raise serializers.ValidationError(
                "Selected converted subscription does not exist."
            ) from exc

    def validate(self, attrs):
        customer = attrs.get("customer_id")
        subscription = attrs.get("subscription_id")

        if customer is None and subscription is None:
            raise serializers.ValidationError(
                "Select the created customer or subscription before completing conversion."
            )

        if customer is not None and subscription is not None:
            if subscription.customer_id != customer.id:
                raise serializers.ValidationError(
                    "Selected subscription does not belong to the selected customer."
                )

        return attrs
