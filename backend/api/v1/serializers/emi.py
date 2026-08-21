from decimal import Decimal

from rest_framework import serializers

from subscriptions.models import Emi, EmiStatus

MONEY_ZERO = Decimal("0.00")


def _quantize(val) -> Decimal:
    return Decimal(str(val)).quantize(MONEY_ZERO)


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

    def _net_paid(self, obj: Emi) -> Decimal:
        cached = getattr(obj, "_net_paid_cache", None)
        if cached is not None:
            return cached
        paid = getattr(obj, "paid_ledger_total", None)
        reversal = getattr(obj, "reversal_ledger_total", None)
        if paid is not None and reversal is not None:
            net = _quantize(max(_quantize(paid) - _quantize(reversal), MONEY_ZERO))
        else:
            net = obj.net_paid_amount()
        obj._net_paid_cache = net
        return net

    def get_paid_amount(self, obj: Emi) -> str:
        if obj.status == EmiStatus.WAIVED:
            return "0.00"
        return str(self._net_paid(obj))

    def get_waived_amount(self, obj: Emi) -> str:
        return str(obj.amount if obj.status == EmiStatus.WAIVED else MONEY_ZERO)

    def get_outstanding_amount(self, obj: Emi) -> str:
        if obj.status == EmiStatus.WAIVED:
            return "0.00"
        outstanding = _quantize(obj.amount) - self._net_paid(obj)
        return str(max(outstanding, MONEY_ZERO))
