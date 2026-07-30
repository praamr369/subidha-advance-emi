from __future__ import annotations

from datetime import timedelta
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
from crm.models import PartyInteraction, PartyInteractionStatus
from inventory.models import InventoryItem, StockLedger, StockLocation
from service_desk.support_ticket_models import SupportTicket, SupportTicketStatus
from subscriptions.models import (
    Batch,
    CustomerKycDocument,
    CustomerKycDocumentStatus,
    DeliveryStatus,
    Emi,
    EmiStatus,
    PaymentReconciliation,
    ReconciliationStatus,
    SubscriptionDelivery,
)
from subscriptions.services.admin_operations_queue_service import build_admin_queue_summary
from system_jobs.models import Notification

_BADGE_CACHE_KEY = "admin_nav_badges"
_BADGE_CACHE_TTL = 30  # seconds — fresh enough for navigation badges


def build_admin_navigation_badges(user=None) -> dict:
    """Cache-aware badge payload, shared by the REST view and the SSE stream."""
    user_id = user if isinstance(user, int) else getattr(user, "id", None)
    cache_key = f"{_BADGE_CACHE_KEY}:{user_id}" if user_id else _BADGE_CACHE_KEY
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

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

    # Merge dynamic queue counts from admin_operations_queue_service
    today_work_total = 0
    try:
        queue_summary = build_admin_queue_summary()
        for row in queue_summary.get("results", []):
            count_val = int(row.get("count") or 0)
            today_work_total += count_val
            badge_src = row.get("badge_source")
            if badge_src:
                payload[badge_src] = count_val
            row_key = row.get("key")
            if row_key:
                payload[f"queue.{row_key}"] = count_val
                if row_key not in payload:
                    payload[row_key] = count_val
    except Exception:
        pass

    try:
        kyc_reverification_count = CustomerKycDocument.objects.filter(
            Q(expiry_date__lte=today + timedelta(days=60)) | Q(expiry_date__lt=today),
            status=CustomerKycDocumentStatus.APPROVED,
            expiry_date__isnull=False,
        ).count()
    except Exception:
        kyc_reverification_count = 0

    try:
        due_followups_count = PartyInteraction.objects.filter(
            status=PartyInteractionStatus.OPEN,
            next_follow_up_at__isnull=False,
            next_follow_up_at__lte=timezone.now(),
        ).count()
    except Exception:
        due_followups_count = 0

    try:
        if user_id:
            unread_count = Notification.objects.filter(recipient_id=user_id, read_at__isnull=True).count()
        else:
            unread_count = Notification.objects.filter(read_at__isnull=True).count()
    except Exception:
        unread_count = 0

    payload["today_work_count"] = int(today_work_total)
    payload["today_action_count"] = int(today_work_total)
    payload["unread_count"] = int(unread_count)
    payload["kyc_reverification_count"] = int(kyc_reverification_count)
    payload["due_followups_count"] = int(due_followups_count)

    # Ensure queue.* alias mappings are consistent across both naming styles
    payload["queue.outstanding_count"] = payload["outstanding_count"]
    payload["queue.overdue_count"] = payload["overdue_count"]
    payload["queue.pending_delivery_count"] = payload["pending_delivery_count"]
    payload["queue.pending_return_count"] = payload["pending_return_count"]
    payload["queue.pending_refund_count"] = payload["pending_refund_count"]
    payload["queue.pending_reversal_count"] = payload["pending_reversal_count"]
    payload["queue.open_support_ticket_count"] = payload["open_support_ticket_count"]
    payload["queue.low_stock_count"] = payload["low_stock_count"]
    payload["queue.inspection_stock_count"] = payload["inspection_stock_count"]
    payload["queue.unreconciled_count"] = payload["unreconciled_count"]
    payload["reconciliation_pending"] = payload["unreconciled_count"]
    payload["queue.pending_draw_count"] = payload["pending_draw_count"]
    payload["queue.unread_count"] = payload["unread_count"]

    cache.set(cache_key, payload, _BADGE_CACHE_TTL)
    return payload


class AdminNavigationBadgesView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(build_admin_navigation_badges(user=request.user))
