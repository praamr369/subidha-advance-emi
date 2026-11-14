from __future__ import annotations

import logging
from decimal import Decimal
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsCustomer

from business_setup.models.payment_gateway import PaymentGatewaySettings
from payments.models_online_gateway import (
    OnlineGatewayPaymentType,
    OnlineGatewayStatus,
    OnlineGatewayTransaction,
)
from payments.services.phonepe_gateway_service import PhonePeGatewayService

logger = logging.getLogger("payments.customer")


class CustomerReportDirectUpiView(APIView):
    """
    Endpoint for authenticated customers to report their direct UPI payment reference / UTR.
    Creates a pending OnlineGatewayTransaction to be verified and reconciled by staff.
    """
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def post(self, request):
        amount = request.data.get("amount")
        utr_number = str(request.data.get("utr_number") or "").strip()
        source_type = str(request.data.get("source_type") or "EMI").strip().upper()
        source_id = request.data.get("source_id")
        payer_upi_id = str(request.data.get("payer_upi_id") or "").strip()
        notes = str(request.data.get("notes") or "").strip()

        if not utr_number:
            return Response(
                {"error": "12-digit UPI Reference / UTR number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            num_amount = Decimal(str(amount))
            if num_amount <= Decimal("0.00"):
                raise ValueError()
        except (ValueError, TypeError):
            return Response(
                {"error": "Valid payment amount is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        customer = getattr(request.user, "customer_profile", None)
        if not customer:
            from customers.models import Customer
            customer = Customer.objects.filter(user=request.user).first()

        now_str = timezone.now().strftime("%Y%m%d%H%M%S")
        tid = f"UPI-{now_str}-{source_type[:3]}-{source_id or 0}"

        tx = OnlineGatewayTransaction.objects.create(
            merchant_transaction_id=tid,
            gateway_type="DIRECT_UPI",
            payment_type=OnlineGatewayPaymentType.STANDARD,
            source_type=source_type,
            source_id=int(source_id) if source_id else None,
            customer=customer,
            amount=num_amount,
            status=OnlineGatewayStatus.PENDING,
            provider_reference_id=utr_number,
            payload_snapshot={
                "utr_number": utr_number,
                "payer_upi_id": payer_upi_id,
                "notes": notes,
                "reported_at": timezone.now().isoformat(),
            },
        )

        return Response(
            {
                "success": True,
                "transaction_id": tx.merchant_transaction_id,
                "utr_number": utr_number,
                "status": tx.status,
                "message": "Payment reported successfully! Store staff will verify and issue your receipt.",
            },
            status=status.HTTP_201_CREATED,
        )


class CustomerOnlinePaymentInitiateView(APIView):
    """
    Initiate online payment via PhonePe gateway (standard or recurring AutoPay).
    Requires active gateway settings with is_enabled=True.
    """
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def post(self, request):
        pg = PaymentGatewaySettings.objects.filter(is_active=True).first()
        if not pg or not pg.is_enabled:
            return Response(
                {"error": "Online payment gateway is currently disabled. Please pay using Direct UPI."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount = request.data.get("amount")
        source_type = str(request.data.get("source_type") or "EMI").strip().upper()
        source_id = request.data.get("source_id")
        payment_type = request.data.get("payment_type") or OnlineGatewayPaymentType.STANDARD
        redirect_url = request.data.get("redirect_url", "")

        customer = getattr(request.user, "customer_profile", None)
        if not customer:
            from customers.models import Customer
            customer = Customer.objects.filter(user=request.user).first()

        try:
            res = PhonePeGatewayService.initiate_payment(
                amount=amount,
                customer=customer,
                source_type=source_type,
                source_id=int(source_id) if source_id else None,
                redirect_url=redirect_url,
                payment_type=payment_type,
            )
            return Response(res, status=status.HTTP_200_OK if res.get("success") else status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
