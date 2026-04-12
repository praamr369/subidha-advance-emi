from rest_framework import serializers

from subscriptions.models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    branch_id = serializers.IntegerField(source="branch.id", read_only=True)
    branch_code = serializers.CharField(source="branch.code", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    cash_counter_id = serializers.IntegerField(source="cash_counter.id", read_only=True)
    cash_counter_code = serializers.CharField(source="cash_counter.code", read_only=True)
    cash_counter_name = serializers.CharField(source="cash_counter.name", read_only=True)

    subscription_id = serializers.IntegerField(source="subscription.id", read_only=True)
    subscription_number = serializers.SerializerMethodField()
    subscription_status = serializers.CharField(
        source="subscription.status",
        read_only=True,
    )
    subscription_plan_type = serializers.CharField(
        source="subscription.plan_type",
        read_only=True,
    )

    product_id = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    product_code = serializers.SerializerMethodField()

    batch_id = serializers.SerializerMethodField()
    batch_code = serializers.SerializerMethodField()

    partner_id = serializers.SerializerMethodField()
    partner_username = serializers.SerializerMethodField()

    lucky_id = serializers.SerializerMethodField()
    lucky_number = serializers.SerializerMethodField()

    emi_id = serializers.IntegerField(source="emi.id", read_only=True)
    emi_month_no = serializers.IntegerField(source="emi.month_no", read_only=True)
    emi_due_date = serializers.SerializerMethodField()
    emi_amount = serializers.SerializerMethodField()
    emi_status = serializers.SerializerMethodField()

    collected_by_id = serializers.SerializerMethodField()
    collected_by_username = serializers.SerializerMethodField()

    verified_by_id = serializers.SerializerMethodField()
    verified_by_username = serializers.SerializerMethodField()

    is_reversed = serializers.SerializerMethodField()
    reversal_metadata = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id",
            "customer",
            "customer_id",
            "customer_name",
            "customer_phone",
            "branch_id",
            "branch_code",
            "branch_name",
            "cash_counter_id",
            "cash_counter_code",
            "cash_counter_name",
            "subscription",
            "subscription_id",
            "subscription_number",
            "subscription_status",
            "subscription_plan_type",
            "product_id",
            "product_name",
            "product_code",
            "batch_id",
            "batch_code",
            "partner_id",
            "partner_username",
            "lucky_id",
            "lucky_number",
            "emi",
            "emi_id",
            "emi_month_no",
            "emi_due_date",
            "emi_amount",
            "emi_status",
            "amount",
            "method",
            "reference_no",
            "payment_date",
            "allocation_metadata",
            "is_reversed",
            "reversal_metadata",
            "collected_by",
            "collected_by_id",
            "collected_by_username",
            "verified_by",
            "verified_by_id",
            "verified_by_username",
            "created_at",
        )
        read_only_fields = fields

    def get_subscription_number(self, obj):
        subscription = getattr(obj, "subscription", None)
        return f"SUB-{subscription.id}" if subscription else None

    def get_product_id(self, obj):
        subscription = getattr(obj, "subscription", None)
        product = getattr(subscription, "product", None) if subscription else None
        return getattr(product, "id", None)

    def get_product_name(self, obj):
        subscription = getattr(obj, "subscription", None)
        product = getattr(subscription, "product", None) if subscription else None
        return getattr(product, "name", None)

    def get_product_code(self, obj):
        subscription = getattr(obj, "subscription", None)
        product = getattr(subscription, "product", None) if subscription else None
        return getattr(product, "product_code", None)

    def get_batch_id(self, obj):
        subscription = getattr(obj, "subscription", None)
        batch = getattr(subscription, "batch", None) if subscription else None
        return getattr(batch, "id", None)

    def get_batch_code(self, obj):
        subscription = getattr(obj, "subscription", None)
        batch = getattr(subscription, "batch", None) if subscription else None
        return getattr(batch, "batch_code", None)

    def get_partner_id(self, obj):
        subscription = getattr(obj, "subscription", None)
        partner = getattr(subscription, "partner", None) if subscription else None
        return getattr(partner, "id", None)

    def get_partner_username(self, obj):
        subscription = getattr(obj, "subscription", None)
        partner = getattr(subscription, "partner", None) if subscription else None
        return getattr(partner, "username", None) if partner else None

    def get_lucky_id(self, obj):
        subscription = getattr(obj, "subscription", None)
        lucky_id = getattr(subscription, "lucky_id", None) if subscription else None
        return getattr(lucky_id, "id", None)

    def get_lucky_number(self, obj):
        subscription = getattr(obj, "subscription", None)
        lucky_id = getattr(subscription, "lucky_id", None) if subscription else None
        return getattr(lucky_id, "lucky_number", None)

    def get_emi_due_date(self, obj):
        emi = getattr(obj, "emi", None)
        return getattr(emi, "due_date", None)

    def get_emi_amount(self, obj):
        emi = getattr(obj, "emi", None)
        amount = getattr(emi, "amount", None)
        return str(amount) if amount is not None else None

    def get_emi_status(self, obj):
        emi = getattr(obj, "emi", None)
        return getattr(emi, "status", None)

    def get_collected_by_id(self, obj):
        user = getattr(obj, "collected_by", None)
        return getattr(user, "id", None)

    def get_collected_by_username(self, obj):
        user = getattr(obj, "collected_by", None)
        return getattr(user, "username", None)

    def get_verified_by_id(self, obj):
        user = getattr(obj, "verified_by", None)
        return getattr(user, "id", None)

    def get_verified_by_username(self, obj):
        user = getattr(obj, "verified_by", None)
        return getattr(user, "username", None)

    def get_is_reversed(self, obj):
        metadata = getattr(obj, "allocation_metadata", None) or {}
        reversal = metadata.get("reversal") or {}
        return bool(reversal.get("is_reversed"))

    def get_reversal_metadata(self, obj):
        metadata = getattr(obj, "allocation_metadata", None) or {}
        reversal = metadata.get("reversal") or {}
        return reversal
