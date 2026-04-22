from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.services.finance_transfer_service import FinanceTransferService
from accounting.services.reconciliation_overview_service import ReconciliationOverviewService
from api.v1.permissions import IsAdmin
from api.v1.serializers.finance_operations import (
    AdminAdvanceAllocationSerializer,
    FinanceTransferCreateSerializer,
)
from subscriptions.services.payment_allocation_service import PaymentAllocationService


class AdminAdvanceAllocationView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

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

        queryset = (
            MoneyMovement.objects.select_related(
                "from_finance_account",
                "to_finance_account",
                "posted_journal_entry",
            )
            .order_by("-movement_date", "-id")[:100]
        )
        return Response(
            {
                "count": queryset.count(),
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
                        "notes": row.notes,
                        "status": row.status,
                        "posted_journal_entry_id": row.posted_journal_entry_id,
                    }
                    for row in queryset
                ],
            }
        )

    def post(self, request, *args, **kwargs):
        serializer = FinanceTransferCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        try:
            movement, created = FinanceTransferService.create_transfer(
                movement_date=validated["movement_date"],
                from_finance_account_id=validated["from_finance_account_id"],
                to_finance_account_id=validated["to_finance_account_id"],
                amount=validated["amount"],
                performed_by=request.user,
                reference_no=validated.get("reference_no"),
                notes=validated.get("notes"),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "success": True,
                "message": "Finance transfer posted successfully.",
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
