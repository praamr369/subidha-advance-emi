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
                "customer_name": c.reporter_name_snapshot or (c.direct_sale.customer_name if getattr(c, 'direct_sale_id', None) else ""),
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
