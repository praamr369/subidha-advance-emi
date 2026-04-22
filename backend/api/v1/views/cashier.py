from decimal import Decimal, InvalidOperation

from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import FinanceAccount
from api.v1.permissions import IsCashierOrAdmin
from api.v1.serializers.accounting import FinanceAccountSerializer
from api.v1.serializers.finance_operations import (
    CashierAdvanceCollectionSerializer,
    CashierPaymentCollectionSerializer,
)
from billing.models import DirectSale
from billing.services.direct_sale_collection_service import collect_direct_sale_payment
from branch_control.services.branch_service import scope_queryset_to_user_branches
from subscriptions.services.customer_advance_service import CustomerAdvanceService
from subscriptions.services.payment_collection_service import PaymentCollectionService


def _parse_amount(value) -> Decimal:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid payment amount.")

    if amount <= 0:
        raise ValueError("Payment amount must be greater than zero.")

    return amount


def _parse_optional_int(value, *, field_name: str):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be a valid integer.")


def _outstanding_direct_sale_queryset(*, user):
    queryset = (
        DirectSale.objects.select_related(
            "customer",
            "branch",
            "cash_counter",
            "finance_account",
        )
        .prefetch_related("billing_invoices")
        .filter(status="INVOICED", balance_total__gt=Decimal("0.00"))
        .order_by("sale_date", "id")
    )
    return scope_queryset_to_user_branches(
        queryset,
        user=user,
        field_name="branch_id",
    )


def _serialize_cashier_direct_sale_result(sale: DirectSale):
    latest_invoice = sale.billing_invoices.order_by("-id").first()
    return {
        "direct_sale_id": sale.id,
        "sale_no": sale.sale_no,
        "sale_date": sale.sale_date,
        "status": sale.status,
        "customer_id": sale.customer_id,
        "customer_name": sale.customer_name_snapshot or getattr(sale.customer, "name", ""),
        "customer_phone": sale.customer_phone_snapshot or getattr(sale.customer, "phone", ""),
        "branch_id": sale.branch_id,
        "branch_code": getattr(sale.branch, "code", None),
        "branch_name": getattr(sale.branch, "name", None),
        "cash_counter_id": sale.cash_counter_id,
        "cash_counter_code": getattr(sale.cash_counter, "code", None),
        "cash_counter_name": getattr(sale.cash_counter, "name", None),
        "finance_account_id": sale.finance_account_id,
        "finance_account_name": getattr(sale.finance_account, "name", None),
        "grand_total": str(sale.grand_total),
        "received_total": str(sale.received_total),
        "balance_total": str(sale.balance_total),
        "billing_invoice_id": getattr(latest_invoice, "id", None),
        "billing_invoice_no": getattr(latest_invoice, "document_no", None),
        "billing_invoice_status": getattr(latest_invoice, "status", None),
    }


class CashierFinanceAccountListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]

    def get(self, request, *args, **kwargs):
        queryset = FinanceAccount.objects.select_related("chart_account", "branch")
        queryset = scope_queryset_to_user_branches(
            queryset,
            user=request.user,
            field_name="branch_id",
        )

        is_active = request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(
                is_active=is_active in {"1", "true", "TRUE", "yes", "YES"}
            )

        kind = (request.query_params.get("kind") or "").strip().upper()
        if kind:
            queryset = queryset.filter(kind=kind)

        try:
            page_size = int(request.query_params.get("page_size") or 100)
        except (TypeError, ValueError):
            page_size = 100
        page_size = max(1, min(page_size, 200))

        rows = list(queryset.order_by("name", "id")[:page_size])
        payload = FinanceAccountSerializer(
            rows,
            many=True,
            context={"request": request},
        ).data
        return Response(
            {
                "count": len(payload),
                "next": None,
                "previous": None,
                "results": payload,
            },
            status=status.HTTP_200_OK,
        )


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
        serializer = CashierPaymentCollectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        try:
            result = PaymentCollectionService.collect_emi_payment(
                emi_id=validated["emi_id"],
                amount=validated["amount"],
                collected_by=request.user,
                method=validated["method"],
                finance_account_id=validated["finance_account_id"],
                reference_no=validated.get("reference_no") or None,
                note=validated.get("note") or None,
                branch_id=validated.get("branch_id"),
                cash_counter_id=validated.get("cash_counter_id"),
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
        finance_account = result.get("finance_account")
        reconciliation = result.get("reconciliation")

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
                    "branch_id": getattr(payment, "branch_id", None),
                    "cash_counter_id": getattr(payment, "cash_counter_id", None),
                    "finance_account_id": getattr(payment, "finance_account_id", None),
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
                "finance_account": (
                    {
                        "id": finance_account.id,
                        "name": finance_account.name,
                        "kind": finance_account.kind,
                        "chart_account_id": finance_account.chart_account_id,
                        "chart_account_code": finance_account.chart_account.code,
                    }
                    if finance_account is not None
                    else None
                ),
                "reconciliation_status": getattr(reconciliation, "status", None),
            },
            status=response_status,
        )


class CashierCollectAdvance(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]

    def post(self, request, *args, **kwargs):
        serializer = CashierAdvanceCollectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        try:
            advance = CustomerAdvanceService.collect_unapplied_advance(
                customer_id=validated["customer_id"],
                amount=validated["amount"],
                collected_by=request.user,
                finance_account_id=validated["finance_account_id"],
                method=validated["method"],
                reference_no=validated.get("reference_no") or None,
                note=validated.get("note") or None,
                payment_date=validated.get("payment_date") or timezone.localdate(),
                branch_id=validated.get("branch_id"),
                cash_counter_id=validated.get("cash_counter_id"),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "success": True,
                "message": "Customer advance collected successfully.",
                "data": {
                    "customer_advance_id": advance.id,
                    "customer_id": advance.customer_id,
                    "finance_account_id": advance.finance_account_id,
                    "amount": str(advance.amount),
                    "unapplied_amount": str(advance.unapplied_amount),
                    "status": advance.status,
                    "reference_no": advance.reference_no,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class CashierPendingDirectSales(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]

    def get(self, request, *args, **kwargs):
        phone = (request.query_params.get("phone") or "").strip()
        if not phone:
            return Response(
                {"detail": "phone query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = _outstanding_direct_sale_queryset(user=request.user).filter(
            Q(customer_phone_snapshot__icontains=phone)
            | Q(customer__phone__icontains=phone)
        )
        rows = list(queryset[:50])
        if not rows:
            return Response(
                {"detail": "Outstanding direct sales not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        first = rows[0]
        total_outstanding = queryset.aggregate(total=Sum("balance_total"))["total"] or Decimal("0.00")
        return Response(
            {
                "customer_id": first.customer_id,
                "customer_name": first.customer_name_snapshot or getattr(first.customer, "name", ""),
                "phone": first.customer_phone_snapshot or getattr(first.customer, "phone", ""),
                "total_outstanding_sales": len(rows),
                "total_outstanding_amount": str(total_outstanding),
                "direct_sales": [_serialize_cashier_direct_sale_result(row) for row in rows],
            },
            status=status.HTTP_200_OK,
        )


class CashierSearchDirectSaleView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]

    def get(self, request, *args, **kwargs):
        query = (request.query_params.get("q") or "").strip()
        mode = (request.query_params.get("mode") or "any").strip().lower()

        allowed_modes = {"any", "phone", "sale", "customer"}
        if mode not in allowed_modes:
            return Response(
                {"detail": "Unsupported cashier direct-sale search mode."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not query:
            return Response({"count": 0, "results": []}, status=status.HTTP_200_OK)

        queryset = _outstanding_direct_sale_queryset(user=request.user)
        search_filter = Q()

        if mode == "phone":
            search_filter = Q(customer_phone_snapshot__icontains=query) | Q(customer__phone__icontains=query)
        elif mode == "sale":
            search_filter = Q(sale_no__icontains=query)
            if query.isdigit():
                search_filter |= Q(id=int(query))
        elif mode == "customer":
            search_filter = Q(customer_name_snapshot__icontains=query) | Q(customer__name__icontains=query)
        else:
            search_filter = (
                Q(sale_no__icontains=query)
                | Q(customer_name_snapshot__icontains=query)
                | Q(customer_phone_snapshot__icontains=query)
                | Q(customer__name__icontains=query)
                | Q(customer__phone__icontains=query)
            )
            if query.isdigit():
                search_filter |= Q(id=int(query))

        rows = list(queryset.filter(search_filter).distinct()[:30])
        return Response(
            {
                "count": len(rows),
                "results": [_serialize_cashier_direct_sale_result(row) for row in rows],
            },
            status=status.HTTP_200_OK,
        )


class CashierCollectDirectSalePayment(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCashierOrAdmin]

    def post(self, request, *args, **kwargs):
        data = request.data or {}
        direct_sale_id = data.get("direct_sale_id")
        amount_raw = data.get("amount")
        branch_id = data.get("branch_id")
        cash_counter_id = data.get("cash_counter_id")
        finance_account_id = data.get("finance_account_id")
        reference_no = (data.get("reference_no") or "").strip()
        note = (data.get("note") or data.get("notes") or "").strip()

        if direct_sale_id in (None, ""):
            return Response(
                {"detail": "direct_sale_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            direct_sale_id = int(direct_sale_id)
        except (TypeError, ValueError):
            return Response(
                {"detail": "direct_sale_id must be a valid integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if amount_raw in (None, ""):
            return Response(
                {"detail": "amount is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            amount = _parse_amount(amount_raw)
            resolved_branch_id = _parse_optional_int(branch_id, field_name="branch_id")
            resolved_cash_counter_id = _parse_optional_int(
                cash_counter_id,
                field_name="cash_counter_id",
            )
            resolved_finance_account_id = _parse_optional_int(
                finance_account_id,
                field_name="finance_account_id",
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = collect_direct_sale_payment(
                direct_sale_id=direct_sale_id,
                amount=amount,
                collected_by=request.user,
                branch_id=resolved_branch_id,
                cash_counter_id=resolved_cash_counter_id,
                finance_account_id=resolved_finance_account_id,
                reference_no=reference_no or None,
                notes=note or None,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {"detail": f"Direct-sale collection failed: {str(exc)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        receipt = result["receipt"]
        sale = result["direct_sale"]
        invoice = result["invoice"]

        return Response(
            {
                "message": (
                    "Direct-sale collection posted successfully."
                    if result["created"]
                    else "Duplicate collection reference detected; existing retail receipt returned."
                ),
                "created": result["created"],
                "receipt": {
                    "id": receipt.id,
                    "receipt_no": receipt.receipt_no,
                    "receipt_type": receipt.receipt_type,
                    "status": receipt.status,
                    "receipt_date": receipt.receipt_date,
                    "amount": str(receipt.amount),
                    "finance_account_id": receipt.finance_account_id,
                    "branch_id": receipt.branch_id,
                    "cash_counter_id": receipt.cash_counter_id,
                    "source_reference": receipt.source_reference,
                },
                "direct_sale": {
                    "id": sale.id,
                    "sale_no": sale.sale_no,
                    "status": sale.status,
                    "grand_total": str(sale.grand_total),
                    "received_total": str(sale.received_total),
                    "balance_total": str(sale.balance_total),
                    "branch_id": sale.branch_id,
                    "cash_counter_id": sale.cash_counter_id,
                    "finance_account_id": sale.finance_account_id,
                },
                "invoice": {
                    "id": invoice.id,
                    "document_no": invoice.document_no,
                    "status": invoice.status,
                    "received_total": str(invoice.received_total),
                    "balance_total": str(invoice.balance_total),
                },
                "outstanding_before": str(result["outstanding_before"]),
                "outstanding_after": str(result["outstanding_after"]),
            },
            status=status.HTTP_201_CREATED if result["created"] else status.HTTP_200_OK,
        )
