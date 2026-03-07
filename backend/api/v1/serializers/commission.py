from rest_framework import serializers

from subscriptions.models import Commission


class CommissionSerializer(serializers.ModelSerializer):
    subscription = serializers.IntegerField(source="emi.subscription_id", read_only=True)

    class Meta:
        model = Commission
        fields = [
            "id",
            "subscription",
            "commission_amount",
            "status",
            "created_at",
        ]
