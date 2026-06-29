from __future__ import annotations

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.services.finance_transfer_service import (
    FinanceTransferService,
    strip_finance_transfer_idempotency_marker,
)
from accounting.services.reconciliation_overview_service import ReconciliationOverviewService
from accounts.capabilities import require_capability
from api.v1.permissions import IsAdmin
from api.v1.serializers.finance_operations import (
    AdminAdvanceAllocationSerializer,
    FinanceTransferCreateSerializer,
)
from subscriptions.services.payment_allocation_service import PaymentAllocationService


def _positive_int(value, *, default: int, maximum: int | None = None) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    parsed = max(1, parsed)
    if maximum is not None:
        parsed = min(parsed, maximum)
    return parsed


class AdminAdvanceAllocationView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @require_capability("billing.override_allocation")
    def post(self, request, *args, **kwargs):
        serializer = AdminAdvanceAllocationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        try:
            result = PaymentAllocationService.allocate_customer_advance(
                customer_advance_id=validated["customer_advance_id"],
                emi_id=validated["emi_id"],
                amount=validated["amount"],
                allocated_by=request.user,
                note=validated.get("note"),
                reference_no=validated.get("reference_no"),
                allocation_date=validated.get("allocation_date") or timezone.localdate(),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        payment = result["payment"]
        advance = result["advance"]
        allocation = result["allocation"]
        reconciliation = result["reconciliation"]
        return Response(
            {
                "success": True,
                "message": "Customer advance allocated successfully.",
                "data": {
                    "customer_advance_id": advance.id,
                    "allocation_id": allocation.id,
                    "payment_id": payment.id,
                    "subscription_id": payment.subscription_id,
                    "emi_id": payment.emi_id,
                    "amount": str(payment.amount),
                    "remaining_unapplied_amount": str(advance.unapplied_amount),
                    "reconciliation_status": reconciliation.status,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class AdminFinanceTransferView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        from accounting.models import MoneyMovement

        page = _positive_int(request.query_params.get("page"), default=1)
        page_size = _positive_int(request.query_params.get("page_size"), default=25, maximum=100)
        offset = (page - 1) * page_size
        status_filter = (request.query_params.get("status") or "").strip().upper()
        account_id = (request.query_params.get("finance_account_id") or "").strip()
        date_from = (request.query_params.get("date_from") or "").strip()
        date_to = (request.query_params.get("date_to") or "").strip()

        queryset = MoneyMovement.objects.select_related(
            "from_finance_account",
            "to_finance_account",
            "posted_journal_entry",
        ).order_by("-movement_date", "-id")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if account_id.isdigit():
            account_pk = int(account_id)
            queryset = queryset.filter(Q(from_finance_account_id=account_pk) | Q(to_finance_account_id=account_pk))
        if date_from:
            queryset = queryset.filter(movement_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(movement_date__lte=date_to)

        total_count = queryset.count()
        rows = list(queryset[offset : offset + page_size])
        return Response(
            {
                "count": total_count,
                "page": page,
                "page_size": page_size,
                "total_pages": (total_count + page_size - 1) // page_size if page_size else 1,
                "results": [
                    {
                        "id": row.id,
                        "movement_no": row.movement_no,
                        "movement_date": row.movement_date,
                        "from_finance_account_id": row.from_finance_account_id,
                        "from_finance_account_name": row.from_finance_account.name,
                        "to_finance_account_id": row.to_finance_account_id,
                        "to_finance_account_name": row.to_finance_account.name,
                        "amount": str(row.amount),
                        "reference_no": row.reference_no,
                        "notes": strip_finance_transfer_idempotency_marker(row.notes),
                        "status": row.status,
                        "posted_journal_entry_id": row.posted_journal_entry_id,
                    }
                    for row in rows
                ],
            }
        )

    @require_capability("finance.transfer.create")
    def post(self, request, *args, **kwargs):
        serializer = FinanceTransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        try:
            if validated.get("preview"):
                preview = FinanceTransferService.preview_transfer(
                    movement_date=validated["movement_date"],
                    from_finance_account_id=validated["from_finance_account_id"],
                    to_finance_account_id=validated["to_finance_account_id"],
                    amount=validated["amount"],
                    reference_no=validated.get("reference_no"),
                    notes=validated.get("notes"),
                )
                return Response({"success": True, "message": "Finance transfer preview ready.", "data": preview}, status=status.HTTP_200_OK)

            movement, created = FinanceTransferService.create_transfer(
                movement_date=validated["movement_date"],
                from_finance_account_id=validated["from_finance_account_id"],
                to_finance_account_id=validated["to_finance_account_id"],
                amount=validated["amount"],
                performed_by=request.user,
                reference_no=validated.get("reference_no"),
                notes=validated.get("notes"),
                idempotency_key=validated.get("idempotency_key"),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "success": True,
                "message": "Finance transfer posted successfully." if created else "Finance transfer was already posted for this idempotency key.",
                "data": {
                    "transfer_id": movement.id,
                    "movement_no": movement.movement_no,
                    "amount": str(movement.amount),
                    "status": movement.status,
                    "from_finance_account_id": movement.from_finance_account_id,
                    "to_finance_account_id": movement.to_finance_account_id,
                    "posted_journal_entry_id": movement.posted_journal_entry_id,
                    "created": created,
                },
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AdminReconciliationOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        return Response(ReconciliationOverviewService.build_overview())


class AdminFinanceAccountOperationalSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, *args, **kwargs):
        return Response(ReconciliationOverviewService.build_finance_account_operational_summary())
