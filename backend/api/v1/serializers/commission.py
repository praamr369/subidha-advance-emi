from rest_framework import serializers
from subscriptions.models import Commission


class CommissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Commission
        fields = [
            "id",
            "subscription",
            "commission_amount",
            "status",
            "created_at",
            "settled_at",
        ]