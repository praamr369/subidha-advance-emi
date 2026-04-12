from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from branch_control.services.branch_service import scope_queryset_to_user_branches
from api.v1.permissions import IsCashierOrAdmin
from api.v1.serializers.admin_resources import EmiAdminSerializer as EmiSerializer
from api.v1.serializers.payment import PaymentSerializer
from subscriptions.services.dashboard_canonical_financial_summary_service import (
    get_dashboard_summary,
)
from subscriptions.services.dashboard_scopes import CashierScope
from subscriptions.models import Customer, Emi, EmiStatus, Payment


def _pending_emi_queryset(*, user):
    queryset = (
        Emi.objects.select_related(
            "subscription",
            "subscription__customer",
            "subscription__product",
            "subscription__batch",
            "subscription__lucky_id",
        )
        .filter(status=EmiStatus.PENDING)
        .order_by("due_date", "month_no", "id")
    )
    return scope_queryset_to_user_branches(
        queryset,
        user=user,
        field_name="subscription__branch_id",
    )


def _cashier_visible_payments_queryset(*, user):
    queryset = (
        Payment.objects.select_related(
            "customer",
            "branch",
            "cash_counter",
            "subscription",
            "subscription__product",
            "subscription__lucky_id",
            "subscription__batch",
            "emi",
            "collected_by",
            "verified_by",
        )
        .filter(collected_by__role="CASHIER")
        .order_by("-created_at", "-id")
    )
    return scope_queryset_to_user_branches(queryset, user=user, field_name="branch_id")


def _parse_positive_int(value):
    cleaned = str(value or "").strip()
    if not cleaned or not cleaned.isdigit():
        return None
    return int(cleaned)


def _parse_subscription_identifier(value):
    cleaned = str(value or "").strip()
    normalized = cleaned.upper()

    if normalized.startswith("SUB-"):
        suffix = normalized[4:].strip()
        if suffix.isdigit():
            return int(suffix)

    if cleaned.isdigit():
        return int(cleaned)

    return None


def _serialize_cashier_search_result(emi: Emi):
    subscription = emi.subscription
    customer = subscription.customer
    batch = subscription.batch
    lucky_id = subscription.lucky_id

    return {
        "emi_id": emi.id,
        "customer_id": customer.id,
        "customer_name": customer.name,
        "customer_phone": customer.phone,
        "subscription_id": subscription.id,
        "subscription_number": f"SUB-{subscription.id}",
        "contract_reference": subscription.contract_reference,
        "batch_id": batch.id if batch else None,
        "batch_code": batch.batch_code if batch else None,
        "lucky_id": lucky_id.id if lucky_id else None,
        "lucky_number": lucky_id.lucky_number if lucky_id else None,
        "month_no": emi.month_no,
        "due_date": emi.due_date,
        "amount": str(emi.amount),
        "balance_amount": str(emi.balance_amount()),
        "status": emi.status,
        "is_overdue": emi.is_overdue(),
        "overdue_days": max(
            (timezone.localdate() - emi.due_date).days,
            0,
        )
        if emi.is_overdue()
        else 0,
    }


def _filter_cashier_payment_queryset(queryset, query: str):
    query = (query or "").strip()
    if not query:
        return queryset

    numeric_value = _parse_positive_int(query)
    subscription_id = _parse_subscription_identifier(query)

    search_filter = (
        Q(reference_no__icontains=query)
        | Q(customer__phone__icontains=query)
        | Q(customer__name__icontains=query)
        | Q(subscription__contract_reference__icontains=query)
    )

    if subscription_id is not None:
        search_filter |= Q(subscription_id=subscription_id)

    if numeric_value is not None:
        search_filter |= (
            Q(id=numeric_value)
            | Q(emi_id=numeric_value)
            | Q(subscription__lucky_id_id=numeric_value)
            | Q(subscription__lucky_id__lucky_number=numeric_value)
        )

    return queryset.filter(search_filter)


class CashierDashboardView(APIView):
    """
    Cashier operational dashboard.

    Purpose:
    - show pending EMI workload
    - show today's collection summary
    - show today's posted transaction list

    Important:
    - "today transactions" should reflect rows posted today in the system
    - use created_at for cashier activity visibility
    - keep payment_date visibility inside the serialized payment payload
    """

    permission_classes = [IsCashierOrAdmin]

    def get(self, request):
        dashboard = get_dashboard_summary(CashierScope(), request.user)
        metrics = dashboard.metrics

        return Response(
            {
                "summary": dashboard.summary,
                "winner_surface": dashboard.winner_surface,
                "reconciliation": dashboard.reconciliation,
                "due_subscriptions": dashboard.due_subscriptions[:10],
                "total_pending_emis": dashboard.summary["pending_emis"],
                "total_pending_amount": dashboard.summary["total_pending_amount"],
                "today_total_collected": metrics["today_total_collected"],
                "today_transaction_count": metrics["today_transaction_count"],
                "today_cash_total": metrics["today_cash_total"],
                "today_digital_total": metrics["today_digital_total"],
                "today_transactions": PaymentSerializer(
                    dashboard.payment_rows,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )


class CashierPendingEmis(APIView):
    """
    Search pending EMIs for cashier collection flow.

    Current operational lookup:
    - phone-based customer lookup
    - returns pending EMI list for that customer
    """

    permission_classes = [IsCashierOrAdmin]

    def get(self, request):
        phone = (request.query_params.get("phone") or "").strip()

        if not phone:
            return Response(
                {"detail": "phone query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        customer = Customer.objects.filter(phone=phone).order_by("id").first()
        if not customer:
            return Response(
                {"detail": "Customer not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        emis = _pending_emi_queryset(user=request.user).filter(subscription__customer=customer)
        emi_rows = list(emis)

        total_pending_amount = (
            sum((emi.amount for emi in emi_rows), Decimal("0.00"))
            if emi_rows
            else Decimal("0.00")
        )
        overdue_rows = [emi for emi in emi_rows if emi.is_overdue()]
        overdue_amount = (
            sum(
                (emi.balance_amount() for emi in overdue_rows),
                Decimal("0.00"),
            )
            if overdue_rows
            else Decimal("0.00")
        )
        next_due_emi = emi_rows[0] if emi_rows else None

        return Response(
            {
                "customer_id": customer.id,
                "customer_name": customer.name,
                "phone": customer.phone,
                "total_pending_emis": len(emi_rows),
                "total_pending_amount": total_pending_amount,
                "overdue_emi_count": len(overdue_rows),
                "overdue_amount": overdue_amount,
                "next_due_emi_id": next_due_emi.id if next_due_emi else None,
                "next_due_date": next_due_emi.due_date if next_due_emi else None,
                "next_due_amount": (
                    str(next_due_emi.balance_amount()) if next_due_emi else None
                ),
                "emis": EmiSerializer(
                    emi_rows,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )


class CashierSearchEmiView(APIView):
    permission_classes = [IsCashierOrAdmin]

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        mode = (request.query_params.get("mode") or "any").strip().lower()

        allowed_modes = {"any", "phone", "subscription", "lucky", "emi"}
        if mode not in allowed_modes:
            return Response(
                {"detail": "Unsupported cashier search mode."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not query:
            return Response({"count": 0, "results": []}, status=status.HTTP_200_OK)

        queryset = _pending_emi_queryset(user=request.user)
        numeric_value = _parse_positive_int(query)
        subscription_id = _parse_subscription_identifier(query)

        if mode == "phone":
            queryset = queryset.filter(subscription__customer__phone__icontains=query)
        elif mode == "subscription":
            search_filter = Q(subscription__contract_reference__icontains=query)
            if subscription_id is not None:
                search_filter |= Q(subscription_id=subscription_id)
            queryset = queryset.filter(search_filter)
        elif mode == "lucky":
            if numeric_value is None:
                queryset = queryset.none()
            else:
                queryset = queryset.filter(
                    Q(subscription__lucky_id_id=numeric_value)
                    | Q(subscription__lucky_id__lucky_number=numeric_value)
                )
        elif mode == "emi":
            if numeric_value is None:
                queryset = queryset.none()
            else:
                queryset = queryset.filter(id=numeric_value)
        else:
            search_filter = (
                Q(subscription__customer__phone__icontains=query)
                | Q(subscription__customer__name__icontains=query)
                | Q(subscription__contract_reference__icontains=query)
            )

            if subscription_id is not None:
                search_filter |= Q(subscription_id=subscription_id)

            if numeric_value is not None:
                search_filter |= (
                    Q(id=numeric_value)
                    | Q(subscription__lucky_id_id=numeric_value)
                    | Q(subscription__lucky_id__lucky_number=numeric_value)
                )

            queryset = queryset.filter(search_filter)

        rows = list(queryset[:30])

        return Response(
            {
                "count": len(rows),
                "results": [
                    _serialize_cashier_search_result(emi) for emi in rows
                ],
            }
        )


class CashierPaymentHistoryView(APIView):
    permission_classes = [IsCashierOrAdmin]

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        limit = _parse_positive_int(request.query_params.get("limit")) or 50
        limit = max(1, min(limit, 100))

        queryset = _cashier_visible_payments_queryset(user=request.user)
        queryset = _filter_cashier_payment_queryset(queryset, query)

        total_count = queryset.count()
        rows = list(queryset[:limit])

        return Response(
            {
                "count": total_count,
                "results": PaymentSerializer(
                    rows,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )


class CashierPaymentDetailView(APIView):
    permission_classes = [IsCashierOrAdmin]

    def get(self, request, pk):
        payment = _cashier_visible_payments_queryset(user=request.user).filter(pk=pk).first()
        if not payment:
            return Response(
                {"detail": "Cashier payment not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = PaymentSerializer(payment, context={"request": request}).data

        return Response(
            {
                "payment": payload,
                "status_label": "REVERSED" if payload.get("is_reversed") else "POSTED",
            }
        )
