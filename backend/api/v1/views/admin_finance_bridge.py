from __future__ import annotations

from django.core.exceptions import ValidationError
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.models import (
    CustomerAdvance,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
)
from subscriptions.services.rent_lease_accounting_bridge_service import (
    EVENT_DEPOSIT_DAMAGE_RECOVERY,
    EVENT_DEPOSIT_REFUND,
    build_accounting_bridge_summary,
    post_customer_advance,
    post_deposit_liability,
    post_deposit_transaction,
    post_monthly_demand,
    preview_customer_advance_posting,
    preview_deposit_liability_posting,
    preview_deposit_transaction_posting,
    preview_monthly_demand_posting,
)


def _error_response(exc: Exception) -> Response:
    if isinstance(exc, ValidationError):
        message = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
    else:
        message = str(exc)
    return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)


def _require_confirm(request) -> Response | None:
    if request.data.get("confirm") is not True:
        return Response(
            {"detail": "Explicit confirm=true is required before accounting bridge posting."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


def _deposit(pk: int) -> RentLeaseBillingDemand | None:
    return (
        RentLeaseBillingDemand.objects.select_related("subscription", "subscription__customer", "subscription__product")
        .filter(pk=pk, demand_type=RentLeaseDemandType.SECURITY_DEPOSIT)
        .first()
    )


def _monthly_demand(pk: int) -> RentLeaseBillingDemand | None:
    return (
        RentLeaseBillingDemand.objects.select_related("subscription", "subscription__customer", "subscription__product")
        .filter(pk=pk, demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY])
        .first()
    )


class AdminAccountingBridgeSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(build_accounting_bridge_summary())


class AdminCustomerAdvanceBridgeListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        rows = []
        advances = (
            CustomerAdvance.objects.select_related("customer", "finance_account", "finance_account__chart_account")
            .order_by("-payment_date", "-id")[:100]
        )
        for advance in advances:
            preview = preview_customer_advance_posting(advance)
            rows.append(
                {
                    "id": advance.id,
                    "customer_id": advance.customer_id,
                    "customer_name": advance.customer.name,
                    "finance_account_id": advance.finance_account_id,
                    "finance_account_name": advance.finance_account.name,
                    "amount": f"{advance.amount:.2f}",
                    "unapplied_amount": f"{advance.unapplied_amount:.2f}",
                    "method": advance.method,
                    "reference_no": advance.reference_no,
                    "payment_date": advance.payment_date,
                    "status": advance.status,
                    "posting_status": preview.get("status"),
                    "posting_reason": preview.get("reason"),
                    "journal_entry_id": preview.get("journal_entry_id"),
                }
            )
        return Response({"count": len(rows), "results": rows})


class AdminCustomerAdvancePostingPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        advance = CustomerAdvance.objects.select_related("finance_account", "finance_account__chart_account").filter(pk=pk).first()
        if advance is None:
            return Response({"detail": "Customer advance not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(preview_customer_advance_posting(advance))


class AdminCustomerAdvancePostingExecuteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        confirm_error = _require_confirm(request)
        if confirm_error:
            return confirm_error
        advance = CustomerAdvance.objects.select_related("finance_account", "finance_account__chart_account").filter(pk=pk).first()
        if advance is None:
            return Response({"detail": "Customer advance not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            return Response(post_customer_advance(advance, performed_by=request.user))
        except Exception as exc:
            return _error_response(exc)


class AdminDepositLiabilityPostingPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        demand = _deposit(pk)
        if demand is None:
            return Response({"detail": "Security deposit demand not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(preview_deposit_liability_posting(demand))


class AdminDepositLiabilityPostingExecuteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        confirm_error = _require_confirm(request)
        if confirm_error:
            return confirm_error
        demand = _deposit(pk)
        if demand is None:
            return Response({"detail": "Security deposit demand not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            return Response(post_deposit_liability(demand, performed_by=request.user))
        except Exception as exc:
            return _error_response(exc)


class AdminDepositRefundPostingPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        demand = _deposit(pk)
        if demand is None:
            return Response({"detail": "Security deposit demand not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(preview_deposit_transaction_posting(demand, event=EVENT_DEPOSIT_REFUND))


class AdminDepositRefundPostingExecuteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        confirm_error = _require_confirm(request)
        if confirm_error:
            return confirm_error
        demand = _deposit(pk)
        if demand is None:
            return Response({"detail": "Security deposit demand not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            return Response(post_deposit_transaction(demand, event=EVENT_DEPOSIT_REFUND, performed_by=request.user))
        except Exception as exc:
            return _error_response(exc)


class AdminDepositDamagePostingPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        demand = _deposit(pk)
        if demand is None:
            return Response({"detail": "Security deposit demand not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(preview_deposit_transaction_posting(demand, event=EVENT_DEPOSIT_DAMAGE_RECOVERY))


class AdminDepositDamagePostingExecuteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        confirm_error = _require_confirm(request)
        if confirm_error:
            return confirm_error
        demand = _deposit(pk)
        if demand is None:
            return Response({"detail": "Security deposit demand not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            return Response(post_deposit_transaction(demand, event=EVENT_DEPOSIT_DAMAGE_RECOVERY, performed_by=request.user))
        except Exception as exc:
            return _error_response(exc)


class AdminRentLeaseAccountingSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        demands = RentLeaseBillingDemand.objects.filter(
            demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
            collected_amount__gt=0,
        ).order_by("-due_date", "-id")[:100]
        rows = []
        for demand in demands:
            preview = preview_monthly_demand_posting(demand)
            rows.append(
                {
                    "demand_id": demand.id,
                    "reference_key": demand.reference_key,
                    "subscription_id": demand.subscription_id,
                    "subscription_number": getattr(demand.subscription, "subscription_number", None),
                    "customer_name": demand.subscription.customer.name,
                    "plan_type": demand.subscription.plan_type,
                    "demand_type": demand.demand_type,
                    "amount": f"{demand.amount:.2f}",
                    "collected_amount": f"{demand.collected_amount:.2f}",
                    "status": demand.status,
                    "due_date": demand.due_date,
                    "posting_status": preview.get("status"),
                    "posting_reason": preview.get("reason"),
                    "journal_entry_id": preview.get("journal_entry_id"),
                }
            )
        return Response({"count": len(rows), "results": rows, "summary": build_accounting_bridge_summary().get("rent_lease_dues")})


class AdminRentLeaseDemandPostingPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        demand = _monthly_demand(pk)
        if demand is None:
            return Response({"detail": "Rent/lease monthly demand not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(preview_monthly_demand_posting(demand))


class AdminRentLeaseDemandPostingExecuteView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        confirm_error = _require_confirm(request)
        if confirm_error:
            return confirm_error
        demand = _monthly_demand(pk)
        if demand is None:
            return Response({"detail": "Rent/lease monthly demand not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            return Response(post_monthly_demand(demand, performed_by=request.user))
        except Exception as exc:
            return _error_response(exc)
