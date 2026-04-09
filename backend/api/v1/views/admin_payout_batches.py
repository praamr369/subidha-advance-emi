import csv

from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_commission import CommissionListSerializer
from api.v1.serializers.admin_payout_batch import (
    PayoutBatchActionSerializer,
    PayoutBatchCreateSerializer,
    PayoutBatchDetailSerializer,
    PayoutBatchListSerializer,
    PayoutBatchPreviewQuerySerializer,
)
from subscriptions.models import CommissionPayoutBatch
from subscriptions.services.commission_payout_service import (
    cancel_commission_payout_batch,
    create_commission_payout_batch,
    finalize_commission_payout_batch,
    preview_commission_payout_candidates,
)


class AdminPayoutBatchPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        serializer = PayoutBatchPreviewQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        preview = preview_commission_payout_candidates(
            partner_id=serializer.validated_data.get("partner"),
            date_from=serializer.validated_data.get("date_from"),
            date_to=serializer.validated_data.get("date_to"),
        )

        return Response(
            {
                "summary": preview["summary"],
                "per_partner": preview["per_partner"],
                "results": CommissionListSerializer(
                    preview["queryset"],
                    many=True,
                ).data,
            }
        )


class AdminPayoutBatchCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = PayoutBatchCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = create_commission_payout_batch(
                commission_ids=serializer.validated_data["commission_ids"],
                processed_by=request.user,
                payout_date=serializer.validated_data.get("payout_date"),
                notes=serializer.validated_data.get("notes", ""),
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        batch = result["batch"]

        return Response(
            {
                "message": "Payout batch created successfully.",
                "batch_id": batch.id,
                "batch_code": batch.batch_code,
                "line_count": result["line_count"],
                "total_amount": str(result["total_amount"]),
                "status": batch.status,
            },
            status=status.HTTP_201_CREATED,
        )


class AdminPayoutBatchListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset = CommissionPayoutBatch.objects.select_related(
            "processed_by",
            "finance_account",
        ).prefetch_related("lines").order_by("-created_at")

        status_filter = request.query_params.get("status")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if date_from:
            queryset = queryset.filter(payout_date__gte=date_from)

        if date_to:
            queryset = queryset.filter(payout_date__lte=date_to)

        serializer = PayoutBatchListSerializer(queryset, many=True)

        return Response(
            {
                "count": queryset.count(),
                "results": serializer.data,
            }
        )


class AdminPayoutBatchDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        try:
            batch = CommissionPayoutBatch.objects.select_related(
                "processed_by",
                "finance_account",
            ).prefetch_related(
                "lines__partner",
                "lines__commission__subscription__customer",
                "lines__commission__subscription__batch",
                "lines__commission__subscription__lucky_id",
                "lines__commission__payment",
            ).get(pk=pk)
        except CommissionPayoutBatch.DoesNotExist:
            return Response(
                {"detail": "Batch not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PayoutBatchDetailSerializer(batch)
        return Response(serializer.data)


class AdminPayoutBatchExportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request, pk: int):
        try:
            batch = CommissionPayoutBatch.objects.select_related(
                "processed_by"
            ).prefetch_related(
                "lines__partner",
                "lines__commission__payment",
                "lines__commission__subscription",
                "lines__commission__subscription__customer",
                "lines__commission__emi",
            ).get(pk=pk)
        except CommissionPayoutBatch.DoesNotExist:
            return Response(
                {"detail": "Batch not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        filename = f"commission_payout_batch_{batch.batch_code}.csv"

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'

        writer = csv.writer(response)
        writer.writerow(
            [
                "batch_code",
                "payout_date",
                "batch_status",
                "commission_id",
                "commission_status",
                "partner_id",
                "partner_username",
                "partner_phone",
                "customer_name",
                "subscription_id",
                "payment_id",
                "payment_reference_no",
                "emi_id",
                "commission_rate",
                "commission_amount",
                "settlement_date",
                "line_created_at",
            ]
        )

        for line in batch.lines.all().order_by("id"):
            commission = line.commission
            partner = line.partner
            payment = commission.payment
            customer = commission.subscription.customer if commission.subscription else None

            writer.writerow(
                [
                    batch.batch_code,
                    batch.payout_date.isoformat() if batch.payout_date else "",
                    batch.status,
                    commission.id,
                    commission.status,
                    partner.id if partner else "",
                    getattr(partner, "username", "") or "",
                    getattr(partner, "phone", "") or "",
                    getattr(customer, "name", "") or "",
                    commission.subscription_id or "",
                    commission.payment_id or "",
                    getattr(payment, "reference_no", "") or "",
                    commission.emi_id or "",
                    str(commission.commission_rate),
                    str(line.amount),
                    commission.settlement_date.isoformat()
                    if commission.settlement_date
                    else "",
                    line.created_at.isoformat() if line.created_at else "",
                ]
            )

        return response


class AdminPayoutBatchFinalizeView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        serializer = PayoutBatchActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = finalize_commission_payout_batch(
                batch_id=pk,
                processed_by=request.user,
                finance_account_id=serializer.validated_data.get("finance_account"),
                reference_no=serializer.validated_data.get("reference_no"),
            )
        except CommissionPayoutBatch.DoesNotExist:
            return Response(
                {"detail": "Batch not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        batch = result["batch"]
        return Response(
            {
                "message": (
                    "Payout batch finalized successfully."
                    if result["updated"]
                    else "Payout batch was already finalized."
                ),
                "updated": result["updated"],
                "settled_count": result.get("settled_count", 0),
                "batch": {
                    "id": batch.id,
                    "batch_code": batch.batch_code,
                    "status": batch.status,
                    "total_amount": str(batch.total_amount),
                    "finance_account": batch.finance_account_id,
                    "reference_no": batch.reference_no,
                    "payout_date": batch.payout_date.isoformat() if batch.payout_date else None,
                    "updated_at": batch.updated_at.isoformat() if batch.updated_at else None,
                },
            },
            status=status.HTTP_200_OK,
        )


class AdminPayoutBatchCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        serializer = PayoutBatchActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = cancel_commission_payout_batch(
                batch_id=pk,
                processed_by=request.user,
                reason=serializer.validated_data.get("reason", ""),
            )
        except CommissionPayoutBatch.DoesNotExist:
            return Response(
                {"detail": "Batch not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        batch = result["batch"]
        return Response(
            {
                "message": (
                    "Payout batch cancelled successfully."
                    if result["updated"]
                    else "Payout batch was already cancelled."
                ),
                "updated": result["updated"],
                "batch": {
                    "id": batch.id,
                    "batch_code": batch.batch_code,
                    "status": batch.status,
                    "notes": batch.notes,
                    "total_amount": str(batch.total_amount),
                    "payout_date": batch.payout_date.isoformat() if batch.payout_date else None,
                    "updated_at": batch.updated_at.isoformat() if batch.updated_at else None,
                },
            },
            status=status.HTTP_200_OK,
        )
