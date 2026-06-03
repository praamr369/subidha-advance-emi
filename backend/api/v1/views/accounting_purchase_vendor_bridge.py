from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.services.purchase_vendor_bridge_guard_service import run_inventory_posting_bridges_guarded
from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting_phase3 import CommissionPayoutBridgeRunSerializer


class InventoryBridgeRunView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = CommissionPayoutBridgeRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = run_inventory_posting_bridges_guarded(
                performed_by=request.user,
                **serializer.validated_data,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(payload, status=status.HTTP_200_OK)
