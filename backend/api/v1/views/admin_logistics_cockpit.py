from datetime import timedelta
from django.core.cache import cache
from django.utils import timezone
from django.db import models
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from inventory.services.stock_service import build_stock_summary
from deliveries.services.delivery_service import get_delivery_queryset
from billing.services.direct_sale_delivery_queue import direct_sale_delivery_cases_queryset
from subscriptions.models import DeliveryStatus
from service_desk.models import ServiceDeskCase, ServiceDeskCaseStatus, ServiceDeskCaseType, ServiceDeskStockStatus

CACHE_KEY = "solopreneur:logistics:cockpit"
CACHE_TTL_SECONDS = 30


class AdminLogisticsCockpitView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        cached = cache.get(CACHE_KEY)
        if cached is not None:
            return Response(cached)

        today = timezone.localdate()

        # Ship today: subscription deliveries scheduled today or overdue-and-not-dispatched
        sub_qs = (
            get_delivery_queryset()
            .filter(
                status__in=[DeliveryStatus.PENDING, DeliveryStatus.SCHEDULED, DeliveryStatus.DISPATCHED, DeliveryStatus.OUT_FOR_DELIVERY],
            )
            .filter(models.Q(scheduled_date__lte=today) | models.Q(scheduled_date__isnull=True))
            .order_by("scheduled_date", "id")[:100]
        )
        sub_rows = [
            {
                "id": d.id,
                "type": "SUBSCRIPTION",
                "customer_name": d.subscription.customer.name if getattr(d, 'subscription', None) else "",
                "customer_phone": d.subscription.customer.phone if getattr(d, 'subscription', None) else "",
                "address": getattr(d, 'delivery_address_snapshot', "") or "",
                "product_name": d.subscription.product.name if getattr(d, 'subscription', None) else "",
                "subscription_number": d.subscription.subscription_number if getattr(d, 'subscription', None) else "",
                "status": d.status,
                "scheduled_date": d.scheduled_date.isoformat() if getattr(d, 'scheduled_date', None) else None,
                "is_overdue": bool(getattr(d, 'scheduled_date', None) and d.scheduled_date < today),
            }
            for d in sub_qs
        ]

        # Ship today: direct-sale delivery cases not yet delivered
        ds_qs = direct_sale_delivery_cases_queryset(active_only=True)[:100]
        ds_rows = [
            {
                "id": c.id,
                "type": "DIRECT_SALE",
                "case_no": c.case_no,
                "customer_name": c.reporter_name_snapshot or (c.direct_sale.customer_name_snapshot if getattr(c, 'direct_sale_id', None) else ""),
                "status": c.status,
                "scheduled_date": None,
                "is_overdue": False,
            }
            for c in ds_qs
        ]

        # Stock alerts — reuse build_stock_summary, filter is_below_reorder
        stock_summary = build_stock_summary()
        stock_alerts = [row for row in stock_summary.get("results", []) if row.get("is_below_reorder")][:50]

        # Returns in flight — ServiceDeskCase, stock not yet settled
        returns_qs = (
            ServiceDeskCase.objects.filter(
                case_type__in=[ServiceDeskCaseType.SALES_RETURN, ServiceDeskCaseType.DELIVERY_RETURN, ServiceDeskCaseType.EXCHANGE],
                stock_status=ServiceDeskStockStatus.PENDING,
            )
            .exclude(status__in=[ServiceDeskCaseStatus.CLOSED, ServiceDeskCaseStatus.CANCELLED, ServiceDeskCaseStatus.REJECTED])
            .select_related("party")
            .order_by("-created_at")[:50]
        )
        returns_rows = [
            {
                "id": r.id,
                "case_no": r.case_no,
                "case_type": r.case_type,
                "customer_name": r.reporter_name_snapshot or (r.party.name if r.party_id else ""),
                "status": r.status,
                "stock_status": r.stock_status,
                "finance_status": r.finance_status,
            }
            for r in returns_qs
        ]

        payload = {
            "generated_at": timezone.now().isoformat(),
            "deliveries_today": sub_rows + ds_rows,
            "deliveries_today_count": len(sub_rows) + len(ds_rows),
            "stock_alerts": stock_alerts,
            "stock_alerts_count": len(stock_alerts),
            "returns_in_flight": returns_rows,
            "returns_in_flight_count": len(returns_rows),
        }
        cache.set(CACHE_KEY, payload, CACHE_TTL_SECONDS)
        return Response(payload)


def _serialize_transport_fare_entry(entry) -> dict:
    return {
        "id": entry.id,
        "source_type": entry.source_type,
        "reference_no": entry.reference_no,
        "customer_name": entry.customer_name,
        "entry_date": entry.entry_date.isoformat() if entry.entry_date else None,
        "branch": entry.branch_id,
        "branch_name": entry.branch.name if entry.branch_id and getattr(entry, "branch", None) else "",
        "direct_sale": entry.direct_sale_id,
        "subscription": entry.subscription_id,
        "subscription_delivery": entry.subscription_delivery_id,
        "service_case": entry.service_case_id,
        "van_number": entry.van_number,
        "transport_boy_name": entry.transport_boy_name,
        "transport_boy_phone": entry.transport_boy_phone,
        "van_fare": f"{entry.van_fare:.2f}",
        "settlement_status": entry.settlement_status,
        "paid_to_transport_at": entry.paid_to_transport_at.isoformat() if entry.paid_to_transport_at else None,
        "notes": entry.notes,
        "accounting_posted": False,
        "ledger_scope": "TRANSPORT_ONLY_OFF_ACCOUNT",
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
    }


class AdminTransportFareListCreateView(APIView):
    """Transport-only off-ledger fare register (isolated from company financial accounts)."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        from deliveries.services.transport_finance_service import (
            build_transport_finance_summary,
            filter_transport_fare_entries,
        )

        qs = filter_transport_fare_entries(
            source_type=request.query_params.get("source_type", ""),
            settlement_status=request.query_params.get("settlement_status", ""),
            date_from=request.query_params.get("date_from", ""),
            date_to=request.query_params.get("date_to", ""),
            q=request.query_params.get("q", ""),
        )
        summary = build_transport_finance_summary(qs)
        results = [_serialize_transport_fare_entry(item) for item in qs[:200]]
        return Response({"summary": summary, "results": results})

    def post(self, request):
        from decimal import Decimal
        from django.shortcuts import get_object_or_404
        from rest_framework import serializers as drf_serializers, status
        from deliveries.models import (
            TransportFareEntry,
            TransportFareSettlementStatus,
            TransportFareSourceType,
        )
        from deliveries.services.transport_finance_service import to_fare_decimal

        payload = request.data or {}
        source_type = str(payload.get("source_type") or TransportFareSourceType.MANUAL).strip().upper()
        if source_type not in TransportFareSourceType.values:
            raise drf_serializers.ValidationError({"source_type": "Invalid transport fare source_type."})
        settlement_status = str(
            payload.get("settlement_status") or TransportFareSettlementStatus.PENDING
        ).strip().upper()
        if settlement_status not in TransportFareSettlementStatus.values:
            raise drf_serializers.ValidationError({"settlement_status": "Invalid settlement_status."})

        try:
            van_fare = to_fare_decimal(payload.get("van_fare"))
        except ValueError as exc:
            raise drf_serializers.ValidationError({"van_fare": str(exc)}) from exc

        van_number = str(payload.get("van_number") or "").strip().upper()
        boy_name = str(payload.get("transport_boy_name") or "").strip()
        boy_phone = str(payload.get("transport_boy_phone") or "").strip()
        if not (van_number or boy_name or boy_phone or van_fare > Decimal("0.00")):
            raise drf_serializers.ValidationError(
                {"detail": "Enter van number, transport boy details, or van fare amount."}
            )

        entry_date = payload.get("entry_date") or timezone.localdate()
        paid_at = (
            timezone.now()
            if settlement_status == TransportFareSettlementStatus.PAID_TO_TRANSPORT
            else None
        )
        entry = TransportFareEntry.objects.create(
            source_type=source_type,
            reference_no=str(payload.get("reference_no") or "").strip(),
            customer_name=str(payload.get("customer_name") or "").strip(),
            entry_date=entry_date,
            van_number=van_number,
            transport_boy_name=boy_name,
            transport_boy_phone=boy_phone,
            van_fare=van_fare,
            settlement_status=settlement_status,
            paid_to_transport_at=paid_at,
            notes=str(payload.get("notes") or "").strip(),
            created_by=request.user,
            updated_by=request.user,
        )
        return Response(_serialize_transport_fare_entry(entry), status=status.HTTP_201_CREATED)


class AdminTransportFareDetailView(APIView):
    """Update settlement status or details on an off-ledger TransportFareEntry."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def patch(self, request, pk: int):
        from django.shortcuts import get_object_or_404
        from rest_framework import serializers as drf_serializers
        from deliveries.models import TransportFareEntry, TransportFareSettlementStatus
        from deliveries.services.transport_finance_service import update_transport_fare_entry

        entry = get_object_or_404(TransportFareEntry, pk=pk)
        payload = dict(request.data or {})
        if "settlement_status" in payload and payload["settlement_status"]:
            st = str(payload["settlement_status"]).strip().upper()
            if st not in TransportFareSettlementStatus.values:
                raise drf_serializers.ValidationError({"settlement_status": "Invalid settlement_status."})
        try:
            updated = update_transport_fare_entry(
                entry=entry,
                data=payload,
                performed_by=request.user,
            )
        except ValueError as exc:
            raise drf_serializers.ValidationError({"van_fare": str(exc)}) from exc
        return Response(_serialize_transport_fare_entry(updated))
