from rest_framework import serializers

from subscriptions.models import Subscription
from .emi import EmiSerializer


class SubscriptionSerializer(serializers.ModelSerializer):
    emis = EmiSerializer(many=True, read_only=True)

    class Meta:
        model = Subscription
        fields = (
            "id",
            "plan_type",
            "tenure_months",
            "monthly_amount",
            "status",
            "start_date",
            "emis",
        )
