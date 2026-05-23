from __future__ import annotations

from decimal import Decimal

from billing.models import DirectSale, DirectSaleStatus
from billing.services.direct_sale_operational_state import get_direct_sale_operational_state
from service_desk.models import (
    ServiceDeskCase,
    ServiceDeskCaseStatus,
    ServiceDeskCaseType,
    ServiceDeskFinanceStatus,
    ServiceDeskStockStatus,
)

TERMINAL_CASE_STATUSES = frozenset(
    {
        ServiceDeskCaseStatus.CLOSED,
        ServiceDeskCaseStatus.CANCELLED,
        ServiceDeskCaseStatus.RESOLVED,
        ServiceDeskCaseStatus.REJECTED,
    }
)


def _balance_decimal(sale: DirectSale) -> Decimal:
    return Decimal(str(sale.balance_total or "0")).quantize(Decimal("0.01"))


def _received_decimal(sale: DirectSale) -> Decimal:
    return Decimal(str(sale.received_total or "0")).quantize(Decimal("0.01"))


def _delivery_snapshot_lines(sale: DirectSale) -> str:
    parts = [
        (sale.delivery_snapshot_address_line1 or "").strip(),
        (sale.delivery_snapshot_address_line2 or "").strip(),
        " ".join(
            [
                (sale.delivery_snapshot_city or "").strip(),
                (sale.delivery_snapshot_district or "").strip(),
                (sale.delivery_snapshot_state or "").strip(),
                (sale.delivery_snapshot_pincode or "").strip(),
            ]
        ).strip(),
    ]
    return "\n".join(line for line in parts if line)


def _primary_invoice(sale: DirectSale):
    return sale.billing_invoices.order_by("-id").first()


def _invoice_financial_label(invoice) -> str:
    if invoice is None:
        return "NONE"
    return (invoice.status or "").strip().upper() or "UNKNOWN"


def compute_direct_sale_delivery_snapshot(*, sale: DirectSale) -> dict:
    """
    Canonical delivery UX snapshot aligned with get_direct_sale_operational_state.

    Invoice posting is allowed before dispatch; payment and stock gates follow posted AR.
    """
    balance = _balance_decimal(sale)
    received = _received_decimal(sale)
    invoice = _primary_invoice(sale)
    invoice_state = _invoice_financial_label(invoice)

    if not sale.delivery_required:
        return {
            "phase_code": "NONE",
            "phase_label": "Counter sale",
            "payment_state": "NOT_APPLICABLE",
            "invoice_state": invoice_state,
            "stock_blocked": False,
        }

    op = get_direct_sale_operational_state(sale)
    dst = op["delivery_state"]
    ost = str(op["operational_state"])

    if sale.status in {
        DirectSaleStatus.CANCELLED,
        DirectSaleStatus.CANCELLED_PRE_INVOICE,
        DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
        DirectSaleStatus.REVERSED_POST_INVOICE,
        DirectSaleStatus.RETURNED,
        DirectSaleStatus.ARCHIVED,
        DirectSaleStatus.EXCHANGED_CLOSED,
    } or ost in {"CANCELLED", "HISTORY_ONLY"}:
        return {
            "phase_code": "HISTORY_ONLY",
            "phase_label": "History only · Reversed/archived",
            "payment_state": "NOT_APPLICABLE",
            "invoice_state": invoice_state,
            "stock_blocked": False,
        }

    delivered_pipeline = sale.delivered_at is not None or sale.status == DirectSaleStatus.DELIVERED
    if delivered_pipeline or ost == "DELIVERED_COMPLETE":
        if received > Decimal("0.00") and balance > Decimal("0.00"):
            pay_state = "PARTIAL"
        elif balance > Decimal("0.00"):
            pay_state = "OUTSTANDING"
        else:
            pay_state = "PAID"
        return {
            "phase_code": "DELIVERED_PIPELINE",
            "phase_label": "Delivered · Completed",
            "payment_state": pay_state,
            "invoice_state": invoice_state,
            "stock_blocked": False,
        }

    phase_map = {
        "INVOICE_PENDING": (
            "DRAFT_HOLD",
            "Delivery hold · Invoice pending",
        ),
        "PAYMENT_HOLD": (
            "PAYMENT_HOLD",
            "Delivery hold · Payment due",
        ),
        "STOCK_BLOCKED": (
            "STOCK_BLOCKED",
            "Delivery blocked · Stock outstanding",
        ),
        "READY_FOR_DELIVERY": (
            "READY_FOR_DELIVERY",
            "Ready for delivery",
        ),
        "DELIVERED": (
            "COMPLETED",
            "Completed",
        ),
        "COUNTER_SALE_COMPLETE": (
            "COMPLETED",
            "Completed",
        ),
        "CANCELLED": (
            "CANCELLED",
            "Cancelled",
        ),
    }
    phase_code, phase_label = phase_map.get(dst, ("PAYMENT_HOLD", "Delivery hold"))
    stock_blocked = dst == "STOCK_BLOCKED"

    if balance > Decimal("0.00") and received > Decimal("0.00"):
        pay_state = "PARTIAL"
    elif balance > Decimal("0.00"):
        pay_state = "OUTSTANDING"
    else:
        pay_state = "PAID"

    return {
        "phase_code": phase_code,
        "phase_label": phase_label,
        "payment_state": pay_state,
        "invoice_state": invoice_state,
        "stock_blocked": stock_blocked,
    }


def get_direct_sale_delivery_case(*, sale: DirectSale) -> ServiceDeskCase | None:
    if sale.pk is None:
        return None
    return (
        ServiceDeskCase.objects.filter(
            direct_sale=sale,
            case_type=ServiceDeskCaseType.DIRECT_SALE_DELIVERY,
        )
        .order_by("-id")
        .first()
    )


def direct_sale_delivery_phase(*, sale: DirectSale) -> tuple[str, str]:
    """Returns (machine_code, human_label) for UI/API summaries."""
    snap = compute_direct_sale_delivery_snapshot(sale=sale)
    return snap["phase_code"], snap["phase_label"]


def sync_direct_sale_delivery_case(*, sale: DirectSale, actor=None) -> ServiceDeskCase | None:
    """
    Persist a ServiceDesk delivery-tracking row for retail direct sales when delivery is required.
    Does not mutate subscription EMI deliveries or stock ledgers.
    """
    from subscriptions.services.operational_notification_service import (
        schedule_direct_sale_delivery_ready_notifications,
    )

    if not sale.delivery_required or sale.pk is None:
        return None

    terminal_source_statuses = {
        DirectSaleStatus.CANCELLED,
        DirectSaleStatus.CANCELLED_PRE_INVOICE,
        DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
        DirectSaleStatus.REVERSED_POST_INVOICE,
        DirectSaleStatus.RETURNED,
        DirectSaleStatus.ARCHIVED,
        DirectSaleStatus.EXCHANGED_CLOSED,
    }
    case = get_direct_sale_delivery_case(sale=sale)
    if sale.status in terminal_source_statuses:
        if case is None:
            return None
        if case.status not in TERMINAL_CASE_STATUSES:
            case.status = ServiceDeskCaseStatus.CANCELLED
            case.resolution_summary = (case.resolution_summary or "").strip() or "Source sale reversed/archived."
            case.internal_notes = (case.internal_notes or "").strip() or "Delivery workspace auto-closed due to reversal/archive."
            case.save(update_fields=["status", "resolution_summary", "internal_notes", "updated_at"])
        return case

    snapshot = compute_direct_sale_delivery_snapshot(sale=sale)
    if case is not None and case.status in TERMINAL_CASE_STATUSES:
        return case

    phase = snapshot["phase_code"]
    desired_status = ServiceDeskCaseStatus.OPEN
    if phase == "COMPLETED":
        desired_status = ServiceDeskCaseStatus.CLOSED
    elif phase == "DELIVERED_PIPELINE":
        desired_status = ServiceDeskCaseStatus.IN_SERVICE
    elif phase == "READY_FOR_DELIVERY":
        desired_status = ServiceDeskCaseStatus.AUTHORIZED
    else:
        desired_status = ServiceDeskCaseStatus.OPEN

    desired_stock = (
        ServiceDeskStockStatus.PENDING
        if snapshot.get("stock_blocked")
        else ServiceDeskStockStatus.NOT_REQUIRED
    )

    first_line = sale.lines.select_related("product").order_by("id").first()
    product = first_line.product if first_line else None
    invoice = _primary_invoice(sale)

    summary = (sale.sale_no or f"SALE-{sale.id}")[:200]
    issue_summary = f"Retail delivery · {summary}".strip()
    issue_details = _delivery_snapshot_lines(sale)

    previous_status = case.status if case else None
    closing_summary = "Retail direct sale invoiced."
    resolution_summary = closing_summary if desired_status == ServiceDeskCaseStatus.CLOSED else ""

    if case is None:
        case = ServiceDeskCase.objects.create(
            case_type=ServiceDeskCaseType.DIRECT_SALE_DELIVERY,
            status=desired_status,
            direct_sale=sale,
            billing_invoice=invoice,
            product=product,
            issue_summary=issue_summary or "Retail delivery",
            issue_details=issue_details,
            reporter_name_snapshot=sale.customer_name_snapshot or "",
            reporter_phone_snapshot=sale.customer_phone_snapshot or "",
            finance_status=ServiceDeskFinanceStatus.NOT_REQUIRED,
            stock_status=desired_stock,
            resolution_summary=resolution_summary,
            payment_exception_acknowledged=False,
        )
    else:
        updates = []
        if case.status != desired_status:
            case.status = desired_status
            updates.append("status")
        if (
            desired_status == ServiceDeskCaseStatus.CLOSED
            and not (case.resolution_summary or "").strip()
        ):
            case.resolution_summary = closing_summary
            updates.append("resolution_summary")
        if case.billing_invoice_id != getattr(invoice, "id", None):
            case.billing_invoice = invoice
            updates.append("billing_invoice")
        if product_id := getattr(product, "id", None):
            if case.product_id != product_id:
                case.product_id = product_id
                updates.append("product")
        if case.stock_status != desired_stock:
            case.stock_status = desired_stock
            updates.append("stock_status")
        if updates:
            case.save(update_fields=updates + ["updated_at"])

    if (
        previous_status in {None, ServiceDeskCaseStatus.OPEN, ServiceDeskCaseStatus.UNDER_REVIEW}
        and desired_status == ServiceDeskCaseStatus.AUTHORIZED
        and case is not None
    ):
        schedule_direct_sale_delivery_ready_notifications(
            direct_sale_id=sale.id,
            sale_no=sale.sale_no or "",
            service_case_id=case.id,
        )

    return case
