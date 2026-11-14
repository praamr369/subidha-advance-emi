from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from business_setup.models.payment_gateway import (
    PaymentGatewayEnvironment,
    PaymentGatewaySettings,
)
from payments.services.phonepe_gateway_service import (
    PhonePeGatewayService,
    get_active_payment_gateway_settings,
)


def _serialize_settings(pg: PaymentGatewaySettings) -> dict:
    return {
        "id": pg.id,
        "merchant_id": pg.merchant_id,
        "has_salt_key": pg.has_salt_key,
        "salt_index": pg.salt_index,
        "environment": pg.environment,
        "is_enabled": pg.is_enabled,
        "autopay_enabled": pg.autopay_enabled,
        "is_active": pg.is_active,
        "last_test_at": pg.last_test_at,
        "last_test_success": pg.last_test_success,
        "last_test_message": pg.last_test_message,
        "updated_at": pg.updated_at,
    }


class AdminPaymentGatewaySettingsView(APIView):
    """
    GET /api/v1/admin/business-setup/payment-gateway/
    POST /api/v1/admin/business-setup/payment-gateway/
    Admin endpoint to view and update PhonePe Payment Gateway & UPI Autopay configuration.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        pg = get_active_payment_gateway_settings()
        return Response({"settings": _serialize_settings(pg)})

    def post(self, request):
        data = request.data or {}
        pg = PaymentGatewaySettings.objects.filter(is_active=True).first()
        if not pg:
            pg = PaymentGatewaySettings(is_active=True)

        if "merchant_id" in data:
            pg.merchant_id = str(data.get("merchant_id") or "").strip()
        if "salt_index" in data:
            try:
                pg.salt_index = int(data.get("salt_index") or 1)
            except (ValueError, TypeError):
                pg.salt_index = 1
        if "environment" in data:
            env = str(data.get("environment") or "").upper()
            if env in PaymentGatewayEnvironment.values:
                pg.environment = env
        if "is_enabled" in data:
            pg.is_enabled = bool(data.get("is_enabled"))
        if "autopay_enabled" in data:
            pg.autopay_enabled = bool(data.get("autopay_enabled"))

        # Only update salt key if explicitly supplied (never wiped on empty)
        raw_key = data.get("salt_key")
        if raw_key and isinstance(raw_key, str) and raw_key.strip():
            pg.set_salt_key(raw_key.strip())

        pg.save()
        return Response({"settings": _serialize_settings(pg), "message": "Payment gateway settings saved successfully."})


class AdminPaymentGatewayTestView(APIView):
    """
    POST /api/v1/admin/business-setup/payment-gateway/test/
    Admin endpoint to test connection with PhonePe servers.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        pg = get_active_payment_gateway_settings()
        result = PhonePeGatewayService.test_connection(pg)
        return Response(result, status=status.HTTP_200_OK if result.get("success") else status.HTTP_400_BAD_REQUEST)
