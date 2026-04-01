from rest_framework import serializers

from accounts.models import User, UserRole
from subscriptions.models import CustomerSupportRequest, Payment, Subscription


class SupportRequestBaseReadSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    payment_reference_no = serializers.CharField(
        source="payment.reference_no",
        read_only=True,
        allow_null=True,
    )
    payment_amount = serializers.DecimalField(
        source="payment.amount",
        max_digits=12,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )
    payment_method = serializers.CharField(
        source="payment.method",
        read_only=True,
        allow_null=True,
    )
    payment_date = serializers.DateField(
        source="payment.payment_date",
        read_only=True,
        allow_null=True,
    )
    subscription_number = serializers.SerializerMethodField()
    resolution_summary = serializers.CharField(read_only=True)

    class Meta:
        model = CustomerSupportRequest
        fields = (
            "id",
            "customer",
            "customer_name",
            "customer_phone",
            "payment",
            "payment_reference_no",
            "payment_amount",
            "payment_method",
            "payment_date",
            "subscription",
            "subscription_number",
            "category",
            "message",
            "status",
            "resolved_at",
            "resolution_summary",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_subscription_number(self, obj):
        if not obj.subscription_id:
            return None
        return f"SUB-{obj.subscription_id}"


class CustomerSupportRequestReadSerializer(SupportRequestBaseReadSerializer):
    class Meta(SupportRequestBaseReadSerializer.Meta):
        fields = SupportRequestBaseReadSerializer.Meta.fields


class AdminSupportRequestReadSerializer(SupportRequestBaseReadSerializer):
    assigned_to_id = serializers.IntegerField(source="assigned_to.id", read_only=True)
    assigned_to_username = serializers.CharField(
        source="assigned_to.username",
        read_only=True,
        allow_null=True,
    )
    assigned_to_full_name = serializers.SerializerMethodField()
    resolved_by_id = serializers.IntegerField(source="resolved_by.id", read_only=True)
    resolved_by_username = serializers.CharField(
        source="resolved_by.username",
        read_only=True,
        allow_null=True,
    )
    resolved_by_full_name = serializers.SerializerMethodField()
    internal_notes = serializers.CharField(read_only=True)

    class Meta(SupportRequestBaseReadSerializer.Meta):
        fields = SupportRequestBaseReadSerializer.Meta.fields + (
            "assigned_to_id",
            "assigned_to_username",
            "assigned_to_full_name",
            "assigned_at",
            "resolved_by_id",
            "resolved_by_username",
            "resolved_by_full_name",
            "internal_notes",
        )

    def get_assigned_to_full_name(self, obj):
        user = getattr(obj, "assigned_to", None)
        if not user:
            return None

        full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
        return full_name or user.username

    def get_resolved_by_full_name(self, obj):
        user = getattr(obj, "resolved_by", None)
        if not user:
            return None

        full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
        return full_name or user.username


class CustomerSupportRequestCreateSerializer(serializers.Serializer):
    payment = serializers.IntegerField(required=False, allow_null=True)
    subscription = serializers.IntegerField(required=False, allow_null=True)
    category = serializers.ChoiceField(
        choices=CustomerSupportRequest._meta.get_field("category").choices
    )
    message = serializers.CharField(allow_blank=False, trim_whitespace=True)

    def validate(self, attrs):
        customer = self.context["customer"]

        payment_id = attrs.get("payment")
        subscription_id = attrs.get("subscription")

        payment = None
        subscription = None

        if payment_id is not None:
            try:
                payment = Payment.objects.select_related("subscription").get(
                    pk=payment_id,
                    customer=customer,
                )
            except Payment.DoesNotExist as exc:
                raise serializers.ValidationError(
                    {"payment": "Selected payment is not available in your account."}
                ) from exc

        if subscription_id is not None:
            try:
                subscription = Subscription.objects.get(
                    pk=subscription_id,
                    customer=customer,
                )
            except Subscription.DoesNotExist as exc:
                raise serializers.ValidationError(
                    {"subscription": "Selected subscription is not available in your account."}
                ) from exc

        if payment and subscription and payment.subscription_id != subscription.id:
            raise serializers.ValidationError(
                {"subscription": "Selected payment does not belong to the selected subscription."}
            )

        attrs["payment"] = payment
        attrs["subscription"] = subscription
        attrs["message"] = attrs["message"].strip()
        return attrs


class AdminSupportRequestStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=CustomerSupportRequest._meta.get_field("status").choices
    )


class AdminSupportRequestAssignSerializer(serializers.Serializer):
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
                "Support request assignee must be an internal managed user."
            )

        if not user.is_active:
            raise serializers.ValidationError("Support request assignee must be active.")

        return user


class AdminSupportRequestNoteUpdateSerializer(serializers.Serializer):
    note = serializers.CharField(allow_blank=False, trim_whitespace=True)
    mode = serializers.ChoiceField(
        choices=(
            ("append", "Append"),
            ("replace", "Replace"),
        ),
        required=False,
        default="append",
    )


class AdminSupportRequestResolveSerializer(serializers.Serializer):
    resolution_summary = serializers.CharField(allow_blank=False, trim_whitespace=True)
