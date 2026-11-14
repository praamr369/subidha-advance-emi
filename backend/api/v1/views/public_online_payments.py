from __future__ import annotations

import logging
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from payments.services.phonepe_gateway_service import PhonePeGatewayService

logger = logging.getLogger("payments.webhook")


class PhonePeWebhookView(APIView):
    """
    Public webhook receiver for PhonePe server-to-server transaction and AutoPay status callbacks.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        x_verify = request.headers.get("X-VERIFY", "")
        data = request.data or {}

        try:
            res = PhonePeGatewayService.process_webhook(payload=data, x_verify=x_verify)
            if res.get("success"):
                return Response({"status": "SUCCESS", "message": "Transaction verified and settled."}, status=status.HTTP_200_OK)
            else:
                return Response({"status": "FAILED", "message": res.get("message", "Processing failed")}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.warning("PhonePe webhook error: %s", exc)
            return Response({"status": "ERROR", "message": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
