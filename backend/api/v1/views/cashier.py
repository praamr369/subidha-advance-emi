from django.db.models import Sum, Count
from django.utils import timezone
from django.core.exceptions import ValidationError

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from api.v1.permissions import IsCashierOrAdmin
from api.v1.serializers import (
    EmiSerializer,
    CollectPaymentSerializer,
    PaymentSerializer,
)

from subscriptions.models import (
    Customer,
    Emi,
    EmiStatus,
    Payment,
)
from subscriptions.services.payment_service import record_emi_payment


# ============================================================
# CASHIER DASHBOARD
# ============================================================

class CashierDashboardView(APIView):
    permission_classes = [IsCashierOrAdmin]

    def get(self, request):
        today = timezone.localdate()

        # -----------------------------
        # Pending EMI Metrics
        # -----------------------------
        pending_emis = Emi.objects.filter(
            status=EmiStatus.PENDING
        )

        total_pending_emis = pending_emis.count()
        total_pending_amount = (
            pending_emis.aggregate(total=Sum("amount"))["total"] or 0
        )

        # -----------------------------
        # Today's Payments
        # -----------------------------
        today_payments = (
            Payment.objects
            .filter(payment_date=today)
            .select_related(
                "customer",
                "subscription",
                 "emi",
                "collected_by",
            )
            .order_by("-id")
        )

        today_total_collected = (
        today_payments.aggregate(total=Sum("amount"))["total"] or 0
        )

        today_transaction_count = today_payments.count()

        cash_total = (
            today_payments.filter(method="CASH")
            .aggregate(total=Sum("amount"))["total"] or 0
        )

        digital_total = (
            today_payments.exclude(method="CASH")
            .aggregate(total=Sum("amount"))["total"] or 0
        )
        return Response({
            # Pending
            "total_pending_emis": total_pending_emis,
            "total_pending_amount": total_pending_amount,

            # Today Summary
            "today_total_collected": today_total_collected,
            "today_transaction_count": today_transaction_count,
            "today_cash_total": cash_total,
            "today_digital_total": digital_total,

            # Transaction List
            "today_transactions": PaymentSerializer(
                today_payments,
                many=True
            ).data,
        })


# ============================================================
# SEARCH CUSTOMER PENDING EMIs
# ============================================================

class CashierPendingEmis(APIView):
    permission_classes = [IsCashierOrAdmin]

    def get(self, request):
        phone = request.query_params.get("phone")

        if not phone:
            return Response(
                {"error": "phone parameter is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            customer = Customer.objects.get(phone=phone)
        except Customer.DoesNotExist:
            return Response(
                {"error": "Customer not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        emis = (
            Emi.objects
            .filter(
                subscription__customer=customer,
                status=EmiStatus.PENDING
            )
            .order_by("due_date")
        )

        return Response({
            "customer_id": customer.id,
            "customer_name": customer.name,
            "phone": customer.phone,
            "total_pending_emis": emis.count(),
            "total_pending_amount": emis.aggregate(
                total=Sum("amount")
            )["total"] or 0,
            "emis": EmiSerializer(emis, many=True).data
        })


# ============================================================
# COLLECT EMI PAYMENT
# ============================================================

class CashierCollectPayment(APIView):
    permission_classes = [IsCashierOrAdmin]

    def post(self, request):
        serializer = CollectPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            payment = record_emi_payment(
                collected_by=request.user,
                **serializer.validated_data
            )

        except Emi.DoesNotExist:
            return Response(
                {"error": "EMI not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        except ValidationError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            "message": "Payment recorded successfully",
            "payment_id": payment.id,
            "amount": payment.amount,
            "payment_date": payment.payment_date,
        }, status=status.HTTP_201_CREATED)