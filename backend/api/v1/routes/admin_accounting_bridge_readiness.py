from django.urls import path
from rest_framework import permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounting.services.accounting_bridge_reconciliation_read_service import (
    BridgeReconciliationFilters,
    build_accounting_bridge_reconciliation,
)
from accounting.services.returns_damage_credit_bridge_readiness_service import (
    build_accounting_bridge_readiness_with_returns_damage_credit,
)
from api.v1.permissions import IsAdmin


class AccountingBridgeReconciliationQuerySerializer(serializers.Serializer):
    module = serializers.CharField(required=False, allow_blank=True)
    event_key = serializers.CharField(required=False, allow_blank=True)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    status = serializers.CharField(required=False, allow_blank=True)
    customer = serializers.CharField(required=False, allow_blank=True)
    vendor = serializers.CharField(required=False, allow_blank=True)
    partner = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get("date_from") and attrs.get("date_to") and attrs["date_from"] > attrs["date_to"]:
            raise serializers.ValidationError({"date_to": "date_to must be on or after date_from."})
        return attrs


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated, IsAdmin])
def accounting_bridge_readiness(request):
    return Response(build_accounting_bridge_readiness_with_returns_damage_credit(), status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated, IsAdmin])
def accounting_bridge_reconciliation(request):
    serializer = AccountingBridgeReconciliationQuerySerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    payload = build_accounting_bridge_reconciliation(
        BridgeReconciliationFilters(
            module=(data.get("module") or "").strip() or None,
            event_key=(data.get("event_key") or "").strip() or None,
            date_from=data.get("date_from"),
            date_to=data.get("date_to"),
            status=(data.get("status") or "").strip() or None,
            customer=(data.get("customer") or "").strip() or None,
            vendor=(data.get("vendor") or "").strip() or None,
            partner=(data.get("partner") or "").strip() or None,
        )
    )
    return Response(payload, status=status.HTTP_200_OK)


urlpatterns = [
    path("accounting/bridge-readiness/", accounting_bridge_readiness),
    path("accounting/bridge-reconciliation/", accounting_bridge_reconciliation),
]
