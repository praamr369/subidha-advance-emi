from decimal import Decimal

from rest_framework import serializers

from subscriptions.models import Payment


from rest_framework import serializers
from subscriptions.models import Payment


class PaymentSerializer(serializers.ModelSerializer):

    # ---- Customer Info (Direct FK) ----
    customer_id = serializers.IntegerField(
        source="customer.id",
        read_only=True
    )
    customer_name = serializers.CharField(
        source="customer.name",
        read_only=True
    )
    customer_phone = serializers.CharField(
        source="customer.phone",
        read_only=True
    )

    # ---- Subscription Info (Direct FK) ----
    subscription_id = serializers.IntegerField(
        source="subscription.id",
        read_only=True
    )
    lucky_number = serializers.IntegerField(
        source="subscription.lucky_id.lucky_number",
        read_only=True
    )
    product_name = serializers.CharField(
        source="subscription.product.name",
        read_only=True
    )

    # ---- EMI Info (Direct FK) ----
    month_no = serializers.IntegerField(
        source="emi.month_no",
        read_only=True
    )

    # ---- Payment Context ----
    method_display = serializers.CharField(
        source="get_method_display",
        read_only=True
    )
    collected_by = serializers.CharField(
        source="collected_by.username",
        read_only=True
    )

    class Meta:
        model = Payment
        fields = (
            # Core
            "id",
            "amount",
            "method",
            "method_display",
            "payment_date",
            "reference_no",

            # Customer
            "customer_id",
            "customer_name",
            "customer_phone",

            # Subscription
            "subscription_id",
            "lucky_number",
            "product_name",

            # EMI
            "month_no",

            # Audit
            "collected_by",
        )


from rest_framework import serializers
from subscriptions.models import PaymentMethod

class CollectPaymentSerializer(serializers.Serializer):
    emi_id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    reference_no = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True
    )
    payment_date = serializers.DateField()

    def validate(self, data):
        method = data.get("method")
        reference = data.get("reference_no")

        # Require reference only for non-cash
        if method in ["UPI", "BANK"] and not reference:
            raise serializers.ValidationError({
                "reference_no": "Reference number required for UPI/BANK payments."
            })

        return data