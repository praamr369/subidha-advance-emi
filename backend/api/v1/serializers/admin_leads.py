from rest_framework import serializers

from billing.models import DirectSale
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
    converted_direct_sale_id = serializers.IntegerField(
        source="converted_direct_sale.id",
        read_only=True,
    )
    converted_direct_sale_no = serializers.SerializerMethodField()
    converted_by_id = serializers.IntegerField(source="converted_by.id", read_only=True)
    converted_by_username = serializers.CharField(
        source="converted_by.username",
        read_only=True,
    )
    converted_by_full_name = serializers.SerializerMethodField()
    party_id = serializers.SerializerMethodField()
    party_no = serializers.SerializerMethodField()
    party_display_name = serializers.SerializerMethodField()
    next_follow_up_at = serializers.SerializerMethodField()
    follow_up_state = serializers.SerializerMethodField()
    open_follow_up_count = serializers.SerializerMethodField()

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
            "converted_direct_sale_id",
            "converted_direct_sale_no",
            "converted_by_id",
            "converted_by_username",
            "converted_by_full_name",
            "party_id",
            "party_no",
            "party_display_name",
            "next_follow_up_at",
            "follow_up_state",
            "open_follow_up_count",
            "converted_at",
            "closed_at",
            "created_at",
        )

    def _crm_snapshot(self, obj):
        snapshot_map = self.context.get("lead_crm_map") or {}
        return snapshot_map.get(obj.id, {})

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

    def get_converted_direct_sale_no(self, obj):
        direct_sale = getattr(obj, "converted_direct_sale", None)
        if not direct_sale:
            return None
        return direct_sale.sale_no or f"Direct Sale #{direct_sale.id}"

    def get_converted_by_full_name(self, obj):
        user = getattr(obj, "converted_by", None)
        if not user:
            return None

        full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
        return full_name or user.username

    def get_party_id(self, obj):
        return self._crm_snapshot(obj).get("party_id")

    def get_party_no(self, obj):
        return self._crm_snapshot(obj).get("party_no")

    def get_party_display_name(self, obj):
        return self._crm_snapshot(obj).get("party_display_name")

    def get_next_follow_up_at(self, obj):
        return self._crm_snapshot(obj).get("next_follow_up_at")

    def get_follow_up_state(self, obj):
        return self._crm_snapshot(obj).get("follow_up_state", "NONE")

    def get_open_follow_up_count(self, obj):
        return self._crm_snapshot(obj).get("open_follow_up_count", 0)


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
    direct_sale_id = serializers.IntegerField(required=False, allow_null=True)

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

    def validate_direct_sale_id(self, value):
        if value is None:
            return None

        try:
            return DirectSale.objects.select_related("customer").get(pk=value)
        except DirectSale.DoesNotExist as exc:
            raise serializers.ValidationError(
                "Selected direct sale does not exist."
            ) from exc

    def validate(self, attrs):
        customer = attrs.get("customer_id")
        subscription = attrs.get("subscription_id")
        direct_sale = attrs.get("direct_sale_id")

        if customer is None and subscription is None and direct_sale is None:
            raise serializers.ValidationError(
                "Select the created customer, subscription, or direct sale before completing conversion."
            )

        if customer is not None and subscription is not None:
            if subscription.customer_id != customer.id:
                raise serializers.ValidationError(
                    "Selected subscription does not belong to the selected customer."
                )

        if customer is not None and direct_sale is not None and direct_sale.customer_id:
            if direct_sale.customer_id != customer.id:
                raise serializers.ValidationError(
                    "Selected direct sale does not belong to the selected customer."
                )

        if subscription is not None and direct_sale is not None:
            if direct_sale.customer_id and direct_sale.customer_id != subscription.customer_id:
                raise serializers.ValidationError(
                    "Selected direct sale does not belong to the selected subscription customer."
                )

        return attrs
