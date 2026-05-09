from __future__ import annotations

from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from billing.models import CustomerRefund, CustomerRefundStatus, DirectSaleReturn, DirectSaleReturnStatus
from billing.services.outstanding_ledger_service import build_outstanding_ledger, parse_outstanding_filters
from core.services.operational_visibility import subscription_collectible_q
from inventory.models import StockLedger, StockLocation
from inventory.services.inventory_readiness_service import get_inventory_readiness_snapshot
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


class AdminNavigationBadgesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        today = timezone.localdate()
        # Parse through the same filter parser used by outstandings for consistency.
        outstanding_payload = build_outstanding_ledger(
            filters=parse_outstanding_filters({"page": "1", "page_size": "1"})
        )
        inventory_snapshot = get_inventory_readiness_snapshot()

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
        low_stock_count = int(inventory_snapshot.get("low_stock_items_count") or 0)

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

        return Response(
            {
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
        )
