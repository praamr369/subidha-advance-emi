from __future__ import annotations

from decimal import Decimal

from billing.models import DirectSale, DirectSaleStatus
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
    """
    Returns (machine_code, human_label) for UI/API summaries.
    """
    if not sale.delivery_required:
        return "NONE", "Counter sale"
    if sale.status == DirectSaleStatus.INVOICED:
        return "COMPLETED", "Completed"
    if sale.delivered_at is not None or sale.status == DirectSaleStatus.DELIVERED:
        return "IN_DELIVERY", "In delivery"
    balance = _balance_decimal(sale)
    if balance > Decimal("0.00"):
        return "PAYMENT_HOLD", "Delivery required · Payment hold"
    return "READY_FOR_DELIVERY", "Ready for delivery"


def sync_direct_sale_delivery_case(*, sale: DirectSale, actor=None) -> ServiceDeskCase | None:
    """
    Persist a ServiceDesk delivery-tracking row for retail direct sales when delivery is required.
    Does not mutate subscription EMI deliveries or stock ledgers.
    """
    from subscriptions.services.operational_notification_service import (
        schedule_direct_sale_delivery_ready_notifications,
    )

    if (
        not sale.delivery_required
        or sale.status == DirectSaleStatus.CANCELLED
        or sale.pk is None
    ):
        return None

    desired_status = ServiceDeskCaseStatus.OPEN
    balance = _balance_decimal(sale)
    if sale.status == DirectSaleStatus.INVOICED:
        desired_status = ServiceDeskCaseStatus.CLOSED
    elif sale.delivered_at is not None or sale.status == DirectSaleStatus.DELIVERED:
        desired_status = ServiceDeskCaseStatus.IN_SERVICE
    elif balance > Decimal("0.00"):
        desired_status = ServiceDeskCaseStatus.OPEN
    else:
        desired_status = ServiceDeskCaseStatus.AUTHORIZED

    case = get_direct_sale_delivery_case(sale=sale)
    if case is not None and case.status in TERMINAL_CASE_STATUSES:
        return case

    first_line = sale.lines.select_related("product").order_by("id").first()
    product = first_line.product if first_line else None
    invoice = sale.billing_invoices.order_by("-id").first()

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
            stock_status=ServiceDeskStockStatus.NOT_REQUIRED,
            resolution_summary=resolution_summary,
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
        if updates:
            case.save(update_fields=updates + ["updated_at"])

    if (
        previous_status in {None, ServiceDeskCaseStatus.OPEN}
        and desired_status == ServiceDeskCaseStatus.AUTHORIZED
        and case is not None
    ):
        schedule_direct_sale_delivery_ready_notifications(
            direct_sale_id=sale.id,
            sale_no=sale.sale_no or "",
            service_case_id=case.id,
        )

    return case
