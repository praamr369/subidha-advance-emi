"""Structured API payloads for direct-sale invoice finalization (additive fields)."""

from __future__ import annotations

from billing.services.direct_sale_delivery_bridge_service import direct_sale_delivery_phase
from billing.services.direct_sale_operational_state import get_direct_sale_operational_state


def build_finalize_invoice_api_response(*, sale, updated: bool, request=None) -> dict:
    from api.v1.serializers.billing import DirectSaleSerializer

    invoice = sale.billing_invoices.order_by("-id").first()
    op = get_direct_sale_operational_state(sale)
    _, delivery_display = direct_sale_delivery_phase(sale=sale)
    ctx = {"request": request} if request is not None else {}
    payload = DirectSaleSerializer(sale, context=ctx).data
    return {
        "updated": updated,
        "sale_id": sale.id,
        "sale_number": sale.sale_no,
        "invoice_id": getattr(invoice, "id", None),
        "invoice_number": getattr(invoice, "document_no", None),
        "status": sale.status,
        "balance_total": str(sale.balance_total),
        "operational_state": op["operational_state"],
        "next_actions": op["next_actions"],
        "blocking_reasons": op["blocking_reasons"],
        "delivery_display": delivery_display,
        "requirement_count": op["requirement_count"],
        "direct_sale": payload,
    }
