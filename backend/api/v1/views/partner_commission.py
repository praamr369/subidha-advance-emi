from decimal import Decimal

from django.http import HttpResponse
from django.db.models import Sum
from rest_framework import serializers
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsPartner
from subscriptions.models import Commission, CommissionStatus, MONEY_ZERO
from subscriptions.services.commission_statement_service import (
    CommissionStatementFilters,
    build_commission_statement_payload,
    render_commission_statement_csv,
    render_commission_statement_pdf,
)


def _money(value) -> str:
    return f"{Decimal(value or MONEY_ZERO):.2f}"


class PartnerCommissionStatementExportQuerySerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        required=False,
        choices=CommissionStatus.choices,
    )
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    export_format = serializers.ChoiceField(choices=["csv", "pdf"], default="csv")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        date_from = attrs.get("date_from")
        date_to = attrs.get("date_to")
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError(
                {"date_to": "date_to must be on or after date_from."}
            )
        return attrs


class PartnerCommissionView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        partner = request.user

        commissions = (
            Commission.objects
            .filter(partner=partner)
            .select_related("subscription", "payment", "emi")
            .order_by("-created_at", "-id")
        )

        total_commission = (
            commissions.exclude(status=CommissionStatus.REVERSED)
            .aggregate(total=Sum("commission_amount"))["total"]
            or MONEY_ZERO
        )

        pending_commission = (
            commissions.filter(status=CommissionStatus.PENDING)
            .aggregate(total=Sum("commission_amount"))["total"]
            or MONEY_ZERO
        )

        settled_commission = (
            commissions.filter(status=CommissionStatus.SETTLED)
            .aggregate(total=Sum("commission_amount"))["total"]
            or MONEY_ZERO
        )

        results = []
        for commission in commissions:
            results.append(
                {
                    "id": commission.id,
                    "partner": commission.partner_id,
                    "subscription": commission.subscription_id,
                    "payment": commission.payment_id,
                    "emi": commission.emi_id,
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
                }
            )

        return Response(
            {
                "count": commissions.count(),
                "summary": {
                    "total_commission": _money(total_commission),
                    "pending_commission": _money(pending_commission),
                    "settled_commission": _money(settled_commission),
                },
                "results": results,
            }
        )


class PartnerCommissionStatementExportView(APIView):
    permission_classes = [IsAuthenticated, IsPartner]

    def get(self, request):
        serializer = PartnerCommissionStatementExportQuerySerializer(
            data=request.query_params
        )
        serializer.is_valid(raise_exception=True)

        try:
            payload = build_commission_statement_payload(
                CommissionStatementFilters(
                    partner=request.user,
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
        filename = f"partner_earnings_statement_{request.user.id}.{export_format}"

        if export_format == "pdf":
            response = HttpResponse(
                render_commission_statement_pdf(payload),
                content_type="application/pdf",
            )
        else:
            response = HttpResponse(
                render_commission_statement_csv(payload),
                content_type="text/csv",
            )

        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
