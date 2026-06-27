from __future__ import annotations

from django.core.cache import cache
from django.db.models import F, Q, Sum
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from billing.models import CustomerRefund, CustomerRefundStatus, DirectSaleReturn, DirectSaleReturnStatus
from billing.services.outstanding_ledger_service import build_outstanding_ledger, parse_outstanding_filters
from core.services.operational_visibility import subscription_collectible_q
from inventory.models import InventoryItem, StockLedger, StockLocation
from service_desk.support_ticket_models import SupportTicket, SupportTicketStatus
from subscriptions.models import (
    Batch,
    DeliveryStatus,
    Emi,
    EmiStatus,
    PaymentReconciliation,
    ReconciliationStatus,
    SubscriptionDelivery,
)

_BADGE_CACHE_KEY = "admin_nav_badges"
_BADGE_CACHE_TTL = 30  # seconds — fresh enough for navigation badges


class AdminNavigationBadgesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        cached = cache.get(_BADGE_CACHE_KEY)
        if cached is not None:
            return Response(cached)

        today = timezone.localdate()
        # Parse through the same filter parser used by outstandings for consistency.
        outstanding_payload = build_outstanding_ledger(
            filters=parse_outstanding_filters({"page": "1", "page_size": "1"})
        )

        overdue_count = (
            Emi.objects.filter(status=EmiStatus.PENDING)
            .filter(subscription_collectible_q("subscription__"))
            .filter(due_date__lt=today)
            .count()
        )

        pending_delivery_count = SubscriptionDelivery.objects.filter(
            status__in=[
                DeliveryStatus.PENDING,
                DeliveryStatus.SCHEDULED,
                DeliveryStatus.BLOCKED_STOCK_UNAVAILABLE,
                DeliveryStatus.DISPATCHED,
                DeliveryStatus.OUT_FOR_DELIVERY,
                DeliveryStatus.RETURN_REQUESTED,
            ]
        ).count()
        pending_return_count = DirectSaleReturn.objects.filter(
            status__in=[DirectSaleReturnStatus.DRAFT, DirectSaleReturnStatus.APPROVED]
        ).count()
        pending_refund_count = CustomerRefund.objects.filter(
            status__in=[CustomerRefundStatus.DRAFT, CustomerRefundStatus.APPROVED]
        ).count()
        pending_reversal_count = DirectSaleReturn.objects.filter(
            status__in=[DirectSaleReturnStatus.DRAFT, DirectSaleReturnStatus.APPROVED]
        ).count()
        open_support_ticket_count = SupportTicket.objects.exclude(
            status__in=[SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED, SupportTicketStatus.REJECTED]
        ).count()
        # Count low-stock items using opening_stock_qty as a fast approximation.
        # Avoids the full inventory readiness scan on every navigation load.
        low_stock_count = InventoryItem.objects.filter(
            stock_tracking_enabled=True,
            reorder_level_qty__gt=0,
            opening_stock_qty__lte=F("reorder_level_qty"),
        ).count()

        inspection_locations = StockLocation.objects.filter(
            is_active=True
        ).filter(Q(code__icontains="INSPECTION") | Q(name__icontains="INSPECTION"))
        inspection_stock_count = (
            StockLedger.objects.filter(stock_location__in=inspection_locations)
            .values("inventory_item_id")
            .annotate(total_in=Sum("quantity_in"), total_out=Sum("quantity_out"))
            .filter(total_in__gt=0)
            .count()
        )
        unreconciled_count = PaymentReconciliation.objects.filter(
            Q(status=ReconciliationStatus.PENDING) | Q(is_flagged=True)
        ).count()
        pending_draw_count = Batch.objects.filter(status="OPEN").count()

        payload = {
            "outstanding_count": int(outstanding_payload.get("count") or 0),
            "overdue_count": int(overdue_count),
            "pending_delivery_count": int(pending_delivery_count),
            "pending_return_count": int(pending_return_count),
            "pending_refund_count": int(pending_refund_count),
            "pending_reversal_count": int(pending_reversal_count),
            "open_support_ticket_count": int(open_support_ticket_count),
            "low_stock_count": int(low_stock_count),
            "inspection_stock_count": int(inspection_stock_count),
            "unreconciled_count": int(unreconciled_count),
            "pending_draw_count": int(pending_draw_count),
        }
        cache.set(_BADGE_CACHE_KEY, payload, _BADGE_CACHE_TTL)
        return Response(payload)
