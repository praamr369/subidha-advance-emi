from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.services.commission_payout_bridge_guard_service import (
    run_commission_settlement_bridges_guarded,
    run_payout_batch_bridges_guarded,
)
from api.v1.permissions import IsAdmin
from api.v1.serializers.accounting_phase3 import CommissionPayoutBridgeRunSerializer


class _CommissionPayoutBridgeRunView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    service = None

    def post(self, request):
        serializer = CommissionPayoutBridgeRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = self.service(
                performed_by=request.user,
                **serializer.validated_data,
            )
        except ValueError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response(payload, status=status.HTTP_200_OK)


class CommissionSettlementBridgeRunView(_CommissionPayoutBridgeRunView):
    service = staticmethod(run_commission_settlement_bridges_guarded)


class PayoutBatchBridgeRunView(_CommissionPayoutBridgeRunView):
    service = staticmethod(run_payout_batch_bridges_guarded)
