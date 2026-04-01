from django.http import HttpResponse
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.admin_commission import (
    CommissionBulkSettleSerializer,
    CommissionListSerializer,
    CommissionReportFilterSerializer,
    CommissionSettleSerializer,
    CommissionStatementExportSerializer,
)
from subscriptions.models import Commission
from subscriptions.services.commission_reporting_service import (
    build_commission_reconciliation_snapshot,
    build_commission_summary,
    get_filtered_commission_queryset,
)
from subscriptions.services.commission_service import settle_commission
from subscriptions.services.commission_statement_service import (
    CommissionStatementFilters,
    build_commission_statement_payload,
    render_commission_statement_csv,
    render_commission_statement_pdf,
)


class AdminCommissionListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        filter_serializer = CommissionReportFilterSerializer(data=request.query_params)
        filter_serializer.is_valid(raise_exception=True)

        queryset = get_filtered_commission_queryset(
            partner_id=filter_serializer.validated_data.get("partner"),
            status=filter_serializer.validated_data.get("status"),
            subscription_id=filter_serializer.validated_data.get("subscription"),
            payment_id=filter_serializer.validated_data.get("payment"),
            date_from=filter_serializer.validated_data.get("date_from"),
            date_to=filter_serializer.validated_data.get("date_to"),
        )

        limit_param = (request.query_params.get("limit") or "20").strip().lower()
        offset = int(request.query_params.get("offset", 0))

        total = queryset.count()

        if limit_param == "all":
            limit = max(total - offset, 0)
            results = queryset[offset:]
        else:
            limit = int(limit_param or 20)
            results = queryset[offset: offset + limit]

        serializer = CommissionListSerializer(results, many=True)

        return Response(
            {
                "count": total,
                "limit": limit,
                "offset": offset,
                "results": serializer.data,
            }
        )


class AdminCommissionSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        filter_serializer = CommissionReportFilterSerializer(data=request.query_params)
        filter_serializer.is_valid(raise_exception=True)

        payload = build_commission_summary(
            partner_id=filter_serializer.validated_data.get("partner"),
            status=filter_serializer.validated_data.get("status"),
            subscription_id=filter_serializer.validated_data.get("subscription"),
            payment_id=filter_serializer.validated_data.get("payment"),
            date_from=filter_serializer.validated_data.get("date_from"),
            date_to=filter_serializer.validated_data.get("date_to"),
        )
        return Response(payload)


class AdminCommissionReconciliationView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        filter_serializer = CommissionReportFilterSerializer(data=request.query_params)
        filter_serializer.is_valid(raise_exception=True)

        snapshot = build_commission_reconciliation_snapshot(
            partner_id=filter_serializer.validated_data.get("partner"),
        )
        return Response(snapshot)


class AdminCommissionStatementExportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        serializer = CommissionStatementExportSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        try:
            payload = build_commission_statement_payload(
                CommissionStatementFilters(
                    partner_id=serializer.validated_data.get("partner"),
                    status=serializer.validated_data.get("status"),
                    date_from=serializer.validated_data.get("date_from"),
                    date_to=serializer.validated_data.get("date_to"),
                )
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        export_format = serializer.validated_data["export_format"]
        partner_fragment = (
            f"partner_{serializer.validated_data['partner']}"
            if serializer.validated_data.get("partner")
            else "all_partners"
        )

        if export_format == "pdf":
            response = HttpResponse(
                render_commission_statement_pdf(payload),
                content_type="application/pdf",
            )
            response["Content-Disposition"] = (
                f'attachment; filename="commission_statement_{partner_fragment}.pdf"'
            )
            return response

        response = HttpResponse(
            render_commission_statement_csv(payload),
            content_type="text/csv",
        )
        response["Content-Disposition"] = (
            f'attachment; filename="commission_statement_{partner_fragment}.csv"'
        )
        return response


class AdminCommissionSettleView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk: int):
        serializer = CommissionSettleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not Commission.objects.filter(pk=pk).exists():
            return Response(
                {"detail": "Commission not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            result = settle_commission(
                commission_id=pk,
                settled_by=request.user,
                settlement_date=serializer.validated_data.get("settlement_date"),
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        commission = result["commission"]

        return Response(
            {
                "message": "Commission settled successfully."
                if result["updated"]
                else "Commission was already settled.",
                "updated": result["updated"],
                "commission": {
                    "id": commission.id,
                    "partner_id": commission.partner_id,
                    "subscription_id": commission.subscription_id,
                    "payment_id": commission.payment_id,
                    "emi_id": commission.emi_id,
                    "commission_rate": str(commission.commission_rate),
                    "commission_amount": str(commission.commission_amount),
                    "status": commission.status,
                    "settlement_date": (
                        str(commission.settlement_date)
                        if commission.settlement_date
                        else None
                    ),
                    "reversal_reason": commission.reversal_reason,
                    "metadata": commission.metadata or {},
                    "created_at": commission.created_at.isoformat()
                    if commission.created_at
                    else None,
                    "updated_at": commission.updated_at.isoformat()
                    if commission.updated_at
                    else None,
                },
            },
            status=status.HTTP_200_OK,
        )


class AdminCommissionBulkSettleView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = CommissionBulkSettleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        commission_ids = serializer.validated_data["commission_ids"]
        settlement_date = serializer.validated_data.get("settlement_date")

        settled_ids = []
        already_settled_ids = []
        failed = []

        for commission_id in commission_ids:
            if not Commission.objects.filter(id=commission_id).exists():
                failed.append(
                    {
                        "commission_id": commission_id,
                        "reason": "Commission not found.",
                    }
                )
                continue

            try:
                result = settle_commission(
                    commission_id=commission_id,
                    settled_by=request.user,
                    settlement_date=settlement_date,
                )
            except ValueError as exc:
                failed.append(
                    {
                        "commission_id": commission_id,
                        "reason": str(exc),
                    }
                )
                continue

            if result["updated"]:
                settled_ids.append(commission_id)
            else:
                already_settled_ids.append(commission_id)

        return Response(
            {
                "message": "Bulk settlement processed.",
                "requested_count": len(commission_ids),
                "settled_count": len(settled_ids),
                "already_settled_count": len(already_settled_ids),
                "failed_count": len(failed),
                "settled_ids": settled_ids,
                "already_settled_ids": already_settled_ids,
                "failed": failed,
            }
        )
