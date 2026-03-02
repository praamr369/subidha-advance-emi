from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from subscriptions.models import (
    Batch,
    Customer,
    Emi,
    LuckyDraw,
    LuckyId,
    Payment,
    Product,
    Subscription,
)


class BatchAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Batch
        fields = "__all__"

    def validate(self, attrs):
        candidate = Batch(**attrs)
        try:
            candidate.full_clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or {"detail": exc.messages})
        return attrs


class CustomerAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = "__all__"


class EmiAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Emi
        fields = "__all__"


class LuckyDrawAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = LuckyDraw
        fields = "__all__"


class LuckyIdAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = LuckyId
        fields = "__all__"


class PaymentAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = "__all__"


class ProductAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = "__all__"


class SubscriptionAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = "__all__"
        read_only_fields = ("total_amount", "monthly_amount", "waived_amount", "winner_month", "created_at")