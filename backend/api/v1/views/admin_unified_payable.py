from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.services.unified_payable_service import (
    build_unified_payable_list,
    execute_payable_payment,
)
from accounting.models import FinanceAccount


class AdminUnifiedPayableListView(APIView):
    """GET /admin/payables/ — all pending payable obligations."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        payable_type = (request.query_params.get("payable_type") or "").strip() or None
        search = (request.query_params.get("search") or "").strip() or None
        try:
            data = build_unified_payable_list(payable_type=payable_type, search=search)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(data)


class AdminPayableFinanceAccountsView(APIView):
    """GET /admin/payables/finance-accounts/ — selectable accounts for paying."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        accounts = (
            FinanceAccount.objects
            .select_related("chart_account", "branch")
            .filter(is_active=True, kind__in=["CASH", "BANK", "UPI"])
            .order_by("kind", "name")
        )
        return Response([
            {
                "id": a.id,
                "name": a.name,
                "kind": a.kind,
                "branch_id": a.branch_id,
                "branch_name": a.branch.name if a.branch_id else None,
            }
            for a in accounts
        ])


class AdminPayableExecuteView(APIView):
    """POST /admin/payables/execute/ — pay one payable item."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        data = request.data
        payable_type = (data.get("payable_type") or "").strip()
        payable_id_raw = data.get("payable_id")
        finance_account_id_raw = data.get("finance_account_id")
        amount_raw = data.get("amount")
        payment_date = data.get("payment_date") or None
        reference_no = (data.get("reference_no") or "").strip()
        notes = (data.get("notes") or "").strip()

        if not payable_type:
            return Response({"detail": "payable_type is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            payable_id = int(payable_id_raw)
        except (TypeError, ValueError):
            return Response({"detail": "payable_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        # commission payouts don't always need a finance_account
        finance_account_id = None
        if finance_account_id_raw:
            try:
                finance_account_id = int(finance_account_id_raw)
            except (TypeError, ValueError):
                return Response({"detail": "finance_account_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        # Two-account model: if no explicit account is given, auto-resolve it from
        # the payout instrument (Cash → cash desk; UPI/transfer/cheque/deposit →
        # the single Bank/UPI account). Payouts default to Bank/UPI.
        if not finance_account_id:
            from payments.services.payment_service import _fallback_finance_account_for_method

            payment_method = (data.get("payment_method") or "UPI").strip().upper()
            resolved = _fallback_finance_account_for_method(payment_method)
            if resolved is not None:
                finance_account_id = resolved.id

        if payable_type not in ("commission", "credit_refund") and not finance_account_id:
            return Response(
                {"detail": "No active finance account is available for this payout."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = execute_payable_payment(
                payable_type=payable_type,
                payable_id=payable_id,
                finance_account_id=finance_account_id,
                amount=amount_raw,
                payment_date=payment_date,
                reference_no=reference_no,
                notes=notes,
                executed_by=request.user,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response(
                {"detail": f"Payment failed: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(result, status=status.HTTP_200_OK)
