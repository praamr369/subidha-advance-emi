from rest_framework import serializers
from subscriptions.models import Emi


class EmiSerializer(serializers.ModelSerializer):
    class Meta:
        model = Emi
        fields = (
            "id",
            "month_no",
            "due_date",
            "amount",
            "status",
        )