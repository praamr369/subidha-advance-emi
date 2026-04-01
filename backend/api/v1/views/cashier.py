from decimal import Decimal, InvalidOperation

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsCashierOrAdmin
from subscriptions.services.payment_service import record_emi_payment


def _parse_amount(value) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid payment amount.")

    if amount <= 0:
        raise ValueError("Payment amount must be greater than zero.")

    return amount


class CashierCollectPayment(APIView):
    """
    Controlled cashier payment collection endpoint.

    Enterprise rules:
    - Cashier does not create Payment rows directly.
    - All payment writes go through subscriptions.services.payment_service.record_emi_payment.
    - Service owns validation, allocation metadata, ledger posting, audit, and status synchronization.
    """

    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]

    def post(self, request, *args, **kwargs):
        data = request.data or {}

        emi_id = data.get("emi_id")
        amount_raw = data.get("amount")
        method = (data.get("method") or data.get("payment_method") or "CASH").strip().upper()
        reference_no = (data.get("reference_no") or "").strip()
        note = (data.get("note") or data.get("notes") or "").strip()

        if emi_id in (None, ""):
            return Response(
                {"detail": "emi_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            emi_id = int(emi_id)
        except (TypeError, ValueError):
            return Response(
                {"detail": "emi_id must be a valid integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if amount_raw in (None, ""):
            return Response(
                {"detail": "amount is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            amount = _parse_amount(amount_raw)
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = record_emi_payment(
                emi_id=emi_id,
                amount=amount,
                collected_by=request.user,
                method=method,
                reference_no=reference_no or None,
                note=note or None,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {"detail": f"Payment collection failed: {str(exc)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        payment = result["payment"]
        emi = result["emi"]
        subscription = result["subscription"]

        response_status = (
            status.HTTP_201_CREATED
            if result.get("created", True)
            else status.HTTP_200_OK
        )

        return Response(
            {
                "message": (
                    "Payment collected successfully."
                    if result.get("created", True)
                    else "Duplicate reference detected; existing payment returned."
                ),
                "created": result.get("created", True),
                "payment": {
                    "id": payment.id,
                    "amount": str(payment.amount),
                    "method": getattr(payment, "method", None),
                    "reference_no": getattr(payment, "reference_no", None),
                    "payment_date": getattr(payment, "payment_date", None),
                    "created_at": getattr(payment, "created_at", None),
                    "customer_id": getattr(payment, "customer_id", None),
                    "subscription_id": getattr(payment, "subscription_id", None),
                    "emi_id": getattr(payment, "emi_id", None),
                    "collected_by_id": getattr(payment, "collected_by_id", None),
                    "verified_by_id": getattr(payment, "verified_by_id", None),
                    "allocation_metadata": getattr(payment, "allocation_metadata", {}) or {},
                },
                "emi": {
                    "id": emi.id,
                    "month_no": getattr(emi, "month_no", None),
                    "status": getattr(emi, "status", None),
                    "amount": str(getattr(emi, "amount", "")),
                    "due_date": getattr(emi, "due_date", None),
                },
                "subscription": {
                    "id": subscription.id,
                    "status": getattr(subscription, "status", None),
                    "plan_type": getattr(subscription, "plan_type", None),
                    "total_amount": str(getattr(subscription, "total_amount", "")),
                    "monthly_amount": str(getattr(subscription, "monthly_amount", "")),
                    "customer_id": getattr(subscription, "customer_id", None),
                    "product_id": getattr(subscription, "product_id", None),
                    "batch_id": getattr(subscription, "batch_id", None),
                    "lucky_id": getattr(subscription, "lucky_id_id", None),
                },
            },
            status=response_status,
        )