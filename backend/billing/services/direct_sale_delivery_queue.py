"""
Serialize ServiceDesk DIRECT_SALE_DELIVERY cases into admin delivery-queue payloads.

Subscription EMI deliveries remain the source of truth on SubscriptionDelivery; direct-sale
retail deliveries are tracked on ServiceDeskCase and merged into the admin delivery list API.
"""

from __future__ import annotations

from decimal import Decimal

from billing.services.direct_sale_delivery_bridge_service import (
    TERMINAL_CASE_STATUSES,
    compute_direct_sale_delivery_snapshot,
)
from billing.services.direct_sale_operational_state import get_direct_sale_operational_state
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
    delivery_address_snapshot = "\n".join(p for p in addr_parts if p)

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

    stock_hint = (
        "Stock gate active — resolve purchase or intake before dispatch."
        if snap.get("stock_blocked")
        else None
    )

    case_id = case.id
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
        "scheduled_date": None,
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
        "notes": (case.internal_notes or case.issue_summary or "").strip() or None,
        "failure_reason": None,
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
        "inventory_stock_status": inventory_snapshot.get("status") if inventory_snapshot else None,
        "inventory_available_qty": inventory_snapshot.get("available") if inventory_snapshot else None,
        "direct_sale_id": sale.id,
        "sale_no": sale.sale_no,
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
        "next_actions": op["next_actions"],
        "blocking_reasons": op["blocking_reasons"],
        "status_label": phase_label,
        "stock_state": op.get("inventory_state"),
        "delivery_state": snap.get("phase_code"),
        "action_endpoints": {
            "schedule": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/schedule/",
            "dispatch": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/dispatch/",
            "mark_delivered": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/mark-delivered/",
            "cancel": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/cancel/",
            "note": f"/api/v1/admin/deliveries/direct-sale-cases/{case_id}/note/",
        },
        "links": {
            "open_invoice": f"/admin/billing/documents/{getattr(invoice, 'id', '')}" if getattr(invoice, "id", None) else None,
            "open_direct_sale": f"/admin/billing/direct-sale?highlight_sale={sale.id}",
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
        .select_related("direct_sale", "direct_sale__customer", "billing_invoice", "product")
        .order_by("-created_at", "-id")
    )
    if active_only:
        qs = qs.filter(status__in=ACTIVE_DIRECT_SALE_CASE_STATUSES)
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
