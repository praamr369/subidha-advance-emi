from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from api.v1.serializers.delivery import CustomerSubscriptionDeliveryReadSerializer
from subscriptions.models import Emi, Payment, Subscription
from subscriptions.services.delivery_service import (
    get_current_subscription_delivery,
)


class CustomerEmiSerializer(serializers.ModelSerializer):
    paid_amount = serializers.SerializerMethodField()
    waived_amount = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()

    class Meta:
        model = Emi
        fields = (
            "id",
            "subscription",
            "month_no",
            "due_date",
            "amount",
            "paid_amount",
            "waived_amount",
            "outstanding_amount",
            "status",
        )
        read_only_fields = fields

    def get_paid_amount(self, obj):
        payment_total = (
            obj.payments.aggregate(total=Sum("amount")).get("total")
            or Decimal("0.00")
        )
        return str(payment_total)

    def get_waived_amount(self, obj):
        if obj.status == "WAIVED":
            return str(obj.amount or Decimal("0.00"))
        return "0.00"

    def get_outstanding_amount(self, obj):
        amount = obj.amount or Decimal("0.00")
        paid_amount = Decimal(self.get_paid_amount(obj))
        waived_amount = Decimal(self.get_waived_amount(obj))

        outstanding = amount - paid_amount - waived_amount
        if outstanding < 0:
            outstanding = Decimal("0.00")

        return str(outstanding)


class BaseSubscriptionSerializer(serializers.ModelSerializer):
    subscription_number = serializers.SerializerMethodField()
    delivery_status = serializers.SerializerMethodField()
    fulfillment_status = serializers.CharField(read_only=True)

    customer_id = serializers.IntegerField(source="customer.id", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    product_id = serializers.IntegerField(source="product.id", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.product_code", read_only=True)
    product_base_price = serializers.DecimalField(
        source="product.base_price",
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    batch_id = serializers.IntegerField(source="batch.id", read_only=True)
    batch_code = serializers.CharField(source="batch.batch_code", read_only=True)
    batch_status = serializers.CharField(source="batch.status", read_only=True)

    partner_id = serializers.IntegerField(source="partner.id", read_only=True)
    partner_username = serializers.CharField(source="partner.username", read_only=True)
    partner_phone = serializers.CharField(source="partner.phone", read_only=True)

    lucky_id = serializers.IntegerField(source="lucky_id.id", read_only=True)
    lucky_number = serializers.IntegerField(source="lucky_id.lucky_number", read_only=True)

    emi_count = serializers.SerializerMethodField()
    paid_emi_count = serializers.SerializerMethodField()
    pending_emi_count = serializers.SerializerMethodField()
    waived_emi_count = serializers.SerializerMethodField()

    total_paid_amount = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()
    financial_summary = serializers.SerializerMethodField()

    last_payment_date = serializers.SerializerMethodField()
    next_due_date = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = (
            "id",
            "subscription_number",
            "customer",
            "customer_id",
            "customer_name",
            "customer_phone",
            "product",
            "product_id",
            "product_name",
            "product_code",
            "product_base_price",
            "batch",
            "batch_id",
            "batch_code",
            "batch_status",
            "partner",
            "partner_id",
            "partner_username",
            "partner_phone",
            "lucky_id",
            "lucky_number",
            "plan_type",
            "tenure_months",
            "start_date",
            "total_amount",
            "monthly_amount",
            "status",
            "winner_month",
            "waived_amount",
            "delivery_status",
            "fulfillment_status",
            "created_at",
            "emi_count",
            "paid_emi_count",
            "pending_emi_count",
            "waived_emi_count",
            "total_paid_amount",
            "outstanding_amount",
            "financial_summary",
            "last_payment_date",
            "next_due_date",
        )
        read_only_fields = fields

    def get_subscription_number(self, obj):
        return f"SUB-{obj.id}"

    def get_delivery_status(self, obj):
        current_delivery = get_current_subscription_delivery(obj)
        return getattr(current_delivery, "status", None)

    def _get_emis(self, obj):
        prefetched = getattr(obj, "_prefetched_objects_cache", {})
        if "emis" in prefetched:
            return list(prefetched["emis"])
        return list(obj.emis.all())

    def _compute_financial_summary(self, obj):
        emis = self._get_emis(obj)

        emi_total = Decimal("0.00")
        paid_total = Decimal("0.00")
        waived_total = Decimal("0.00")

        for emi in emis:
            amount = emi.amount or Decimal("0.00")
            emi_total += amount

            emi_paid = (
                emi.payments.aggregate(total=Sum("amount")).get("total")
                or Decimal("0.00")
            )
            paid_total += emi_paid

            if emi.status == "WAIVED":
                waived_total += amount

        if not emis:
            paid_total = (
                Payment.objects.filter(subscription=obj)
                .aggregate(total=Sum("amount"))
                .get("total")
                or Decimal("0.00")
            )
            waived_total = getattr(obj, "waived_amount", None) or Decimal("0.00")
            emi_total = obj.total_amount or Decimal("0.00")

        outstanding = emi_total - paid_total - waived_total
        if outstanding < 0:
            outstanding = Decimal("0.00")

        return {
            "emi_total": emi_total,
            "paid_amount": paid_total,
            "waived_amount": waived_total,
            "outstanding_amount": outstanding,
        }

    def get_emi_count(self, obj):
        return len(self._get_emis(obj))

    def get_paid_emi_count(self, obj):
        return sum(1 for emi in self._get_emis(obj) if emi.status == "PAID")

    def get_pending_emi_count(self, obj):
        return sum(1 for emi in self._get_emis(obj) if emi.status == "PENDING")

    def get_waived_emi_count(self, obj):
        return sum(1 for emi in self._get_emis(obj) if emi.status == "WAIVED")

    def get_total_paid_amount(self, obj):
        summary = self._compute_financial_summary(obj)
        return str(summary["paid_amount"])

    def get_outstanding_amount(self, obj):
        summary = self._compute_financial_summary(obj)
        return str(summary["outstanding_amount"])

    def get_financial_summary(self, obj):
        summary = self._compute_financial_summary(obj)
        return {
            "emi_total": str(summary["emi_total"]),
            "paid_amount": str(summary["paid_amount"]),
            "waived_amount": str(summary["waived_amount"]),
            "outstanding_amount": str(summary["outstanding_amount"]),
        }

    def get_last_payment_date(self, obj):
        payment = (
            Payment.objects.filter(subscription=obj)
            .order_by("-payment_date", "-id")
            .first()
        )
        return getattr(payment, "payment_date", None)

    def get_next_due_date(self, obj):
        emis = sorted(
            [emi for emi in self._get_emis(obj) if emi.status == "PENDING"],
            key=lambda emi: (
                emi.due_date or "",
                emi.month_no or 0,
                emi.id or 0,
            ),
        )
        return getattr(emis[0], "due_date", None) if emis else None


class SubscriptionListSerializer(BaseSubscriptionSerializer):
    class Meta(BaseSubscriptionSerializer.Meta):
        fields = BaseSubscriptionSerializer.Meta.fields
        read_only_fields = fields


class SubscriptionDetailSerializer(BaseSubscriptionSerializer):
    emis = serializers.SerializerMethodField()
    delivery_summary = serializers.SerializerMethodField()
    deliveries = serializers.SerializerMethodField()

    class Meta(BaseSubscriptionSerializer.Meta):
        fields = BaseSubscriptionSerializer.Meta.fields + (
            "delivery_summary",
            "deliveries",
            "emis",
        )
        read_only_fields = fields

    def get_emis(self, obj):
        emis = sorted(
            self._get_emis(obj),
            key=lambda emi: (
                emi.month_no or 0,
                emi.due_date or "",
                emi.id or 0,
            ),
        )
        return CustomerEmiSerializer(emis, many=True).data

    def get_delivery_summary(self, obj):
        current_delivery = get_current_subscription_delivery(obj)
        if current_delivery is None:
            return None
        return CustomerSubscriptionDeliveryReadSerializer(current_delivery).data

    def get_deliveries(self, obj):
        deliveries = getattr(obj, "_prefetched_objects_cache", {}).get("deliveries")
        if deliveries is None:
            deliveries = obj.deliveries.all().order_by("-created_at", "-id")
        return CustomerSubscriptionDeliveryReadSerializer(deliveries, many=True).data


SubscriptionSerializer = SubscriptionListSerializer
