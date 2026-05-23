"""
Serialize ServiceDesk DIRECT_SALE_DELIVERY cases into admin delivery-queue payloads.

Subscription EMI deliveries remain the source of truth on SubscriptionDelivery; direct-sale
retail deliveries are tracked on ServiceDeskCase and merged into the admin delivery list API.
"""

from __future__ import annotations

from decimal import Decimal

from billing.models import DirectSaleStatus
from billing.services.direct_sale_delivery_bridge_service import (
    TERMINAL_CASE_STATUSES,
    compute_direct_sale_delivery_snapshot,
)
from billing.services.direct_sale_operational_state import get_direct_sale_operational_state
from billing.services.reversal_service import get_returnable_quantity
from inventory.services.demand_planning_service import stock_status_for_delivery
from service_desk.models import ServiceDeskCase, ServiceDeskCaseStatus, ServiceDeskCaseType
from subscriptions.models import DeliveryStatus


ACTIVE_DIRECT_SALE_CASE_STATUSES = (
    ServiceDeskCaseStatus.OPEN,
    ServiceDeskCaseStatus.UNDER_REVIEW,
    ServiceDeskCaseStatus.AUTHORIZED,
    ServiceDeskCaseStatus.IN_SERVICE,
)

DIRECT_SALE_SUCCESS_TERMINAL_STATUSES = (
    ServiceDeskCaseStatus.CLOSED,
    ServiceDeskCaseStatus.RESOLVED,
)

PAYMENT_HOLD_BLOCKING_REASON = "Outstanding balance must be collected before delivery release."


def map_case_status_to_delivery_status(case_status: str) -> str:
    token = (case_status or "").strip().upper()
    if token in (ServiceDeskCaseStatus.CLOSED, ServiceDeskCaseStatus.RESOLVED):
        return DeliveryStatus.DELIVERED
    if token in (ServiceDeskCaseStatus.CANCELLED, ServiceDeskCaseStatus.REJECTED):
        return DeliveryStatus.CANCELLED
    if token == ServiceDeskCaseStatus.IN_SERVICE:
        return DeliveryStatus.OUT_FOR_DELIVERY
    if token == ServiceDeskCaseStatus.AUTHORIZED:
        return DeliveryStatus.SCHEDULED
    return DeliveryStatus.PENDING


def _payment_exception_release_active(*, case: ServiceDeskCase, balance: Decimal, source_reversed: bool) -> bool:
    return bool(
        not source_reversed
        and balance > Decimal("0.00")
        and case.payment_exception_approved
        and case.payment_exception_approved_at
    )


def _release_blocking_reasons(blocking_reasons: list[str]) -> list[str]:
    return [
        reason
        for reason in blocking_reasons
        if reason != PAYMENT_HOLD_BLOCKING_REASON
    ]


def _release_next_actions(next_actions: list[str]) -> list[str]:
    released_actions = list(next_actions)
    for action in ["SCHEDULE_DELIVERY", "MARK_DELIVERED"]:
        if action not in released_actions:
            released_actions.append(action)
    return released_actions


def serialize_direct_sale_delivery_case(case: ServiceDeskCase) -> dict:
    sale = case.direct_sale
    invoice = case.billing_invoice
    product = case.product
    balance = Decimal(str(getattr(sale, "balance_total", None) or "0.00")).quantize(Decimal("0.01"))
    snap = compute_direct_sale_delivery_snapshot(sale=sale)
    op = get_direct_sale_operational_state(sale)
    phase_code = snap["phase_code"]
    phase_label = snap["phase_label"]
    mapped_status = map_case_status_to_delivery_status(case.status)
    source_status = (getattr(sale, "status", "") or "").strip().upper() or "UNKNOWN"
    source_reversed = source_status in {
        DirectSaleStatus.REVERSED_POST_INVOICE,
        DirectSaleStatus.RETURNED,
        DirectSaleStatus.ARCHIVED,
        DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
        DirectSaleStatus.CANCELLED_PRE_INVOICE,
        DirectSaleStatus.EXCHANGED_CLOSED,
        DirectSaleStatus.CANCELLED,
    }
    source_archived = source_status in {
        DirectSaleStatus.REVERSED_POST_INVOICE,
        DirectSaleStatus.RETURNED,
        DirectSaleStatus.ARCHIVED,
        DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
        DirectSaleStatus.CANCELLED_PRE_INVOICE,
        DirectSaleStatus.EXCHANGED_CLOSED,
        DirectSaleStatus.CANCELLED,
    }
    payment_release_active = _payment_exception_release_active(
        case=case,
        balance=balance,
        source_reversed=source_reversed,
    )
    blocking_reasons = list(op["blocking_reasons"])
    next_actions = list(op["next_actions"])
    if payment_release_active and phase_code == "PAYMENT_HOLD":
        phase_code = "READY_FOR_DELIVERY"
        phase_label = "Ready for delivery"
        blocking_reasons = _release_blocking_reasons(blocking_reasons)
        next_actions = _release_next_actions(next_actions)
    elif case.payment_exception_approved and "SCHEDULE_DELIVERY" not in next_actions:
        next_actions.append("SCHEDULE_DELIVERY")

    returnable_exists = False
    if source_reversed:
        try:
            for line in sale.lines.all():
                if get_returnable_quantity(line) > Decimal("0.000"):
                    returnable_exists = True
                    break
        except Exception:
            returnable_exists = False

    history_only = bool(source_reversed or phase_code == "HISTORY_ONLY")
    normal_delivery_pending = bool(not source_reversed and case.status in ACTIVE_DIRECT_SALE_CASE_STATUSES)
    normal_delivery_completed = bool(
        not source_reversed and case.status in DIRECT_SALE_SUCCESS_TERMINAL_STATUSES
    )
    return_pickup_required = bool(source_reversed and returnable_exists)
    return_pickup_completed = bool(source_reversed and not returnable_exists)

    addr_parts = [
        (getattr(sale, "delivery_snapshot_address_line1", "") or "").strip(),
        (getattr(sale, "delivery_snapshot_address_line2", "") or "").strip(),
        " ".join(
            [
                (getattr(sale, "delivery_snapshot_city", "") or "").strip(),
                (getattr(sale, "delivery_snapshot_state", "") or "").strip(),
                (getattr(sale, "delivery_snapshot_pincode", "") or "").strip(),
            ]
        ).strip(),
    ]
    sale_address_snapshot = "\n".join(p for p in addr_parts if p)
    delivery_address_snapshot = (case.issue_details or "").strip() or sale_address_snapshot

    customer_name = (getattr(sale, "customer_name_snapshot", "") or "").strip()
    customer_phone = (getattr(sale, "customer_phone_snapshot", "") or "").strip()
    cust = getattr(sale, "customer", None)
    if cust is not None:
        customer_name = customer_name or (getattr(cust, "name", "") or "").strip()
        customer_phone = customer_phone or (getattr(cust, "phone", "") or "").strip()

    inv_no = getattr(invoice, "document_no", None)
    first_line = sale.lines.order_by("id").first()
    pid = getattr(first_line, "product_id", None) if first_line else getattr(product, "id", None)
    inventory_snapshot: dict | None = None
    if pid:
        try:
            inventory_snapshot = stock_status_for_delivery(product_id=pid)
        except Exception:
            inventory_snapshot = None

    stock_blocked = bool(snap.get("stock_blocked"))
    stock_hint = (
        "Stock gate active — resolve purchase or intake before dispatch."
        if stock_blocked
        else None
    )

    case_id = case.id
    scheduled_date = case.service_due_at.date().isoformat() if case.service_due_at else None
    operational_notes = (case.internal_notes or "").strip() or None
    failure_or_cancellation_reason = (case.resolution_summary or "").strip() or None
    action_endpoints = {}
    if not source_reversed:
        action_endpoints = {
            "save_metadata": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/metadata/",
            "schedule": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/schedule/",
            "dispatch": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/dispatch/",
            "mark_delivered": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/mark-delivered/",
            "cancel": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/cancel/",
            "note": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/note/",
            "approve_payment_exception": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/approve-payment-exception/",
        }
    blocked_by_payment = bool(balance > Decimal("0.00")) and not payment_release_active

    return {
        "record_kind": "DIRECT_SALE_DELIVERY",
        "source_type": "DIRECT_SALE",
        "source_label": sale.sale_no or f"Direct sale #{sale.id}",
        "id": case_id,
        "case_id": case_id,
        "service_case_id": case.id,
        "case_no": case.case_no,
        "subscription": None,
        "subscription_id": None,
        "subscription_number": None,
        "customer_id": getattr(sale, "customer_id", None),
        "customer_name": customer_name or None,
        "customer_phone": customer_phone or None,
        "product_id": getattr(product, "id", None),
        "product_name": getattr(product, "name", None),
        "product_code": getattr(product, "product_code", None),
        "batch_id": None,
        "batch_code": None,
        "partner_id": None,
        "partner_username": None,
        "lucky_id": None,
        "lucky_number": None,
        "status": mapped_status,
        "service_desk_status": case.status,
        "delivery_reference": (getattr(sale, "delivery_reference", "") or "").strip() or case.case_no,
        "scheduled_date": scheduled_date,
        "dispatched_at": None,
        "out_for_delivery_at": None,
        "delivered_at": getattr(sale, "delivered_at", None),
        "failed_at": None,
        "cancelled_at": None,
        "return_requested_at": None,
        "returned_at": None,
        "receiver_name": (case.reporter_name_snapshot or customer_name or "").strip() or None,
        "receiver_phone": (case.reporter_phone_snapshot or customer_phone or "").strip() or None,
        "delivery_address_snapshot": delivery_address_snapshot or None,
        "notes": operational_notes,
        "operational_notes": operational_notes,
        "failure_reason": failure_or_cancellation_reason,
        "failure_or_cancellation_reason": failure_or_cancellation_reason,
        "stock_blocked_reason": stock_hint,
        "created_by_id": None,
        "created_by_username": None,
        "updated_by_id": None,
        "updated_by_username": None,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
        "fulfillment_status": None,
        "is_terminal": case.status in TERMINAL_CASE_STATUSES,
        "is_active_delivery": case.status in ACTIVE_DIRECT_SALE_CASE_STATUSES,
        "normal_delivery_pending": normal_delivery_pending,
        "normal_delivery_completed": normal_delivery_completed,
        "return_pickup_required": return_pickup_required,
        "return_pickup_completed": return_pickup_completed,
        "history_only": history_only,
        "source_status": source_status,
        "source_reversed": source_reversed,
        "source_archived": source_archived,
        "is_actionable": bool(normal_delivery_pending),
        "inventory_stock_status": inventory_snapshot.get("status") if inventory_snapshot else None,
        "inventory_available_qty": inventory_snapshot.get("available") if inventory_snapshot else None,
        "direct_sale_id": sale.id,
        "sale_number": sale.sale_no,
        "sale_no": sale.sale_no,
        "invoice_id": getattr(invoice, "id", None),
        "invoice_number": inv_no,
        "invoice_document_no": inv_no,
        "billing_invoice_id": getattr(invoice, "id", None),
        "invoice_state": snap.get("invoice_state"),
        "grand_total": str(sale.grand_total),
        "balance_total": str(balance),
        "received_total": str(sale.received_total),
        "delivery_phase_code": phase_code,
        "delivery_phase_label": phase_label,
        "delivery_status": phase_code,
        "delivery_display": phase_label,
        "payment_state": snap.get("payment_state") or ("PAID" if balance <= Decimal("0.00") else "OUTSTANDING"),
        "operational_state": op["operational_state"],
        "next_actions": next_actions,
        "blocking_reasons": blocking_reasons,
        "status_label": phase_label,
        "stock_state": op.get("inventory_state"),
        "stock_return_status": (
            "SALE_RETURN_IN_POSTED" if return_pickup_completed else "PENDING_RETURN_PICKUP" if return_pickup_required else None
        ),
        "delivery_state": phase_code,
        "blocked_by_stock": stock_blocked,
        "blocked_by_payment": blocked_by_payment,
        "payment_exception_approved_at": case.payment_exception_approved_at.isoformat() if case.payment_exception_approved_at else None,
        "payment_exception_approved_by_username": (
            case.payment_exception_approved_by.username if case.payment_exception_approved_by_id else None
        ),
        "payment_exception_reason": case.payment_exception_reason or None,
        "payment_exception_acknowledged": bool(case.payment_exception_acknowledged),
        "payment_exception_outstanding_amount_snapshot": str(balance) if case.payment_exception_approved else None,
        "action_endpoints": action_endpoints,
        "links": {
            "open_invoice": f"/admin/billing/documents/{getattr(invoice, 'id', '')}" if getattr(invoice, "id", None) else None,
            "open_direct_sale": f"/admin/billing/direct-sale?highlight_sale={sale.id}",
            "open_customer": f"/admin/customers/{getattr(sale, 'customer_id', '')}" if getattr(sale, "customer_id", None) else None,
            "open_service_case": f"/admin/service-desk/cases/{case_id}",
        },
        "detail_hint": "Direct Sale Delivery (Service Desk)",
    }


def direct_sale_delivery_cases_queryset(*, active_only: bool = True):
    qs = (
        ServiceDeskCase.objects.filter(
            case_type=ServiceDeskCaseType.DIRECT_SALE_DELIVERY,
            direct_sale_id__isnull=False,
        )
        .select_related(
            "direct_sale",
            "direct_sale__customer",
            "billing_invoice",
            "product",
            "payment_exception_approved_by",
        )
        .order_by("-created_at", "-id")
    )
    if active_only:
        qs = qs.filter(status__in=ACTIVE_DIRECT_SALE_CASE_STATUSES).exclude(
            direct_sale__status__in=[
                DirectSaleStatus.CANCELLED,
                DirectSaleStatus.CANCELLED_PRE_INVOICE,
                DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
                DirectSaleStatus.REVERSED_POST_INVOICE,
                DirectSaleStatus.RETURNED,
                DirectSaleStatus.ARCHIVED,
                DirectSaleStatus.EXCHANGED_CLOSED,
            ]
        )
    return qs


def apply_direct_sale_case_filters(queryset, request):
    q = (request.query_params.get("q") or "").strip()
    bucket = (request.query_params.get("bucket") or "").strip().upper()
    date_from = (request.query_params.get("date_from") or "").strip()
    date_to = (request.query_params.get("date_to") or "").strip()

    customer_filter = (request.query_params.get("customer") or "").strip()
    if customer_filter.isdigit():
        queryset = queryset.filter(direct_sale__customer_id=int(customer_filter))

    sale_ref = (request.query_params.get("sale") or "").strip()
    if sale_ref:
        queryset = queryset.filter(direct_sale__sale_no__iexact=sale_ref.upper())

    invoice_ref = (request.query_params.get("invoice") or "").strip()
    if invoice_ref:
        queryset = queryset.filter(billing_invoice__document_no__icontains=invoice_ref)

    if bucket == "DELIVERED":
        queryset = queryset.filter(status__in=DIRECT_SALE_SUCCESS_TERMINAL_STATUSES)
    elif bucket == "READY_DISPATCH":
        queryset = queryset.filter(status=ServiceDeskCaseStatus.AUTHORIZED)
    elif bucket == "PENDING":
        queryset = queryset.filter(
            status__in=[
                ServiceDeskCaseStatus.OPEN,
                ServiceDeskCaseStatus.UNDER_REVIEW,
                ServiceDeskCaseStatus.AUTHORIZED,
                ServiceDeskCaseStatus.IN_SERVICE,
            ]
        )

    if date_from:
        queryset = queryset.filter(created_at__date__gte=date_from)
    if date_to:
        queryset = queryset.filter(created_at__date__lte=date_to)

    if q:
        from django.db.models import Q

        filters = (
            Q(direct_sale__sale_no__icontains=q)
            | Q(reporter_name_snapshot__icontains=q)
            | Q(reporter_phone_snapshot__icontains=q)
            | Q(issue_summary__icontains=q)
            | Q(billing_invoice__document_no__icontains=q)
        )
        if q.isdigit():
            filters = filters | Q(direct_sale_id=int(q)) | Q(id=int(q)) | Q(billing_invoice_id=int(q))
        queryset = queryset.filter(filters)

    return queryset


def merge_delivery_summaries(
    *,
    subscription_summary: dict,
    direct_sale_cases_count: int,
    pending_ds: int,
    scheduled_ds: int,
    ofd_ds: int,
    delivered_ds: int = 0,
) -> dict:
    merged = dict(subscription_summary)
    merged["total"] = (merged.get("total") or 0) + direct_sale_cases_count
    merged["pending"] = (merged.get("pending") or 0) + pending_ds
    merged["scheduled"] = (merged.get("scheduled") or 0) + scheduled_ds
    merged["out_for_delivery"] = (merged.get("out_for_delivery") or 0) + ofd_ds
    merged["in_transit"] = (merged.get("in_transit") or 0) + ofd_ds
    merged["delivered"] = (merged.get("delivered") or 0) + delivered_ds
    merged["direct_sale_delivery_cases"] = direct_sale_cases_count
    return merged
