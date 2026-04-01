from decimal import Decimal

from rest_framework import serializers

from subscriptions.models import Emi, EmiStatus


class EmiSerializer(serializers.ModelSerializer):
    sequence_no = serializers.IntegerField(source="month_no", read_only=True)
    paid_amount = serializers.SerializerMethodField()
    waived_amount = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()

    class Meta:
        model = Emi
        fields = (
            "id",
            "subscription",
            "sequence_no",
            "month_no",
            "due_date",
            "amount",
            "paid_amount",
            "waived_amount",
            "outstanding_amount",
            "status",
        )

    def get_paid_amount(self, obj: Emi) -> str:
        if obj.status == EmiStatus.WAIVED:
            return "0.00"
        return str(obj.total_paid())

    def get_waived_amount(self, obj: Emi) -> str:
        return str(obj.amount if obj.status == EmiStatus.WAIVED else Decimal("0.00"))

    def get_outstanding_amount(self, obj: Emi) -> str:
        if obj.status == EmiStatus.WAIVED:
            return "0.00"
        outstanding = obj.amount - obj.total_paid()
        return str(max(outstanding, Decimal("0.00")))
