from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.db.models import Q

from billing.models import BillingDocumentStatus, DirectSaleStatus
from inventory.models import PurchaseNeed, PurchaseNeedStatus


@dataclass(frozen=True)
class _OperationalState:
    operational_state: str
    payment_state: str
    inventory_state: str
    delivery_state: str
    collection_state: str
    blocking_reasons: list[str]
    next_actions: list[str]


def _to_decimal(value, default: str = "0.00") -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


def _latest_invoice(sale):
    return sale.billing_invoices.order_by("-id").first()


def _open_requirement_count(sale) -> int:
    """
    Count direct-sale PurchaseNeeds that still block dispatch: OPEN with positive shortage snapshot.
    OPEN rows with zero shortage (covered by ATP) do not block delivery or payment-finalized gates.
    """
    legacy = {"source_module": PurchaseNeed.SourceModule.DIRECT_SALE, "source_object_id": str(sale.id)}
    keyed = {
        "source_module": PurchaseNeed.SourceModule.DIRECT_SALE,
        "source_object_id__startswith": f"ds:{sale.id}:p:",
    }
    q_short = Q(shortage_quantity__gt=Decimal("0.000"))
    return (
        PurchaseNeed.objects.filter(status=PurchaseNeedStatus.OPEN, **legacy).filter(q_short).count()
        + PurchaseNeed.objects.filter(status=PurchaseNeedStatus.OPEN, **keyed).filter(q_short).count()
    )


def _derive_state(*, sale, invoice_status: str, paid_amount: Decimal, due_amount: Decimal, requirement_count: int) -> _OperationalState:
    inactive_invoice_statuses = {
        BillingDocumentStatus.VOID,
        BillingDocumentStatus.CANCELLED,
        "REVERSED",
        "CREDITED_FULLY",
    }

    if sale.status in {
        DirectSaleStatus.CANCELLED,
        DirectSaleStatus.CANCELLED_PRE_INVOICE,
        DirectSaleStatus.REVERSED_POST_INVOICE,
        DirectSaleStatus.RETURNED,
        DirectSaleStatus.ARCHIVED,
        DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
        DirectSaleStatus.EXCHANGED_CLOSED,
    }:
        return _OperationalState(
            operational_state="HISTORY_ONLY",
            payment_state="N/A",
            inventory_state="N/A",
            delivery_state="HISTORY_ONLY",
            collection_state="NOT_COLLECTIBLE",
            blocking_reasons=["Sale is reversed/returned and archived from active operations."],
            next_actions=["VIEW_DOCUMENTS", "VIEW_AUDIT", "OPEN_REVERSAL_CENTER"],
        )

    if invoice_status in inactive_invoice_statuses:
        return _OperationalState(
            operational_state="REVERSAL_IN_PROGRESS",
            payment_state="N/A",
            inventory_state="N/A",
            delivery_state="HISTORY_ONLY" if bool(getattr(sale, "delivered_at", None)) else "INVOICE_PENDING",
            collection_state="NOT_COLLECTIBLE",
            blocking_reasons=["Invoice is void/reversed; direct-sale collection is blocked."],
            next_actions=["OPEN_REVERSAL_CENTER", "VIEW_DOCUMENTS", "VIEW_AUDIT"],
        )

    if sale.status == DirectSaleStatus.DELIVERED or bool(getattr(sale, "delivered_at", None)):
        return _OperationalState(
            operational_state="DELIVERED_COMPLETE",
            payment_state="PAID" if due_amount <= Decimal("0.00") else "PARTIAL",
            inventory_state="FULFILLED",
            delivery_state="DELIVERED",
            collection_state="NOT_COLLECTIBLE" if due_amount <= Decimal("0.00") else "COLLECTIBLE",
            blocking_reasons=[],
            next_actions=(
                ["RETURN_PRODUCT", "EXCHANGE_PRODUCT", "VIEW_RECEIPTS"]
                if due_amount <= Decimal("0.00")
                else ["COLLECT_DIRECT_SALE_BALANCE", "RETURN_PRODUCT", "EXCHANGE_PRODUCT"]
            ),
        )

    if sale.status == DirectSaleStatus.DRAFT:
        return _OperationalState(
            operational_state="DRAFT_NEEDS_INVOICE",
            payment_state="UNPAID",
            inventory_state="PENDING_REVIEW" if requirement_count else "READY",
            delivery_state="INVOICE_PENDING",
            collection_state="NOT_COLLECTIBLE",
            blocking_reasons=["Finalize and post invoice before collection and delivery."],
            next_actions=["FINALIZE_INVOICE"],
        )

    if invoice_status == BillingDocumentStatus.DRAFT:
        return _OperationalState(
            operational_state="INVOICE_PENDING_POST",
            payment_state="UNPAID" if paid_amount <= Decimal("0.00") else "PARTIAL",
            inventory_state="PENDING_REVIEW" if requirement_count else "READY",
            delivery_state="INVOICE_PENDING",
            collection_state="NOT_COLLECTIBLE",
            blocking_reasons=["Invoice exists but is not posted yet."],
            next_actions=["POST_INVOICE"],
        )

    if due_amount > Decimal("0.00"):
        return _OperationalState(
            operational_state="PARTIAL_PAYMENT_HOLD" if paid_amount > Decimal("0.00") else "RECEIVABLE_READY",
            payment_state="PARTIAL" if paid_amount > Decimal("0.00") else "UNPAID",
            inventory_state="PENDING_REVIEW" if requirement_count else "READY",
            delivery_state="PAYMENT_HOLD",
            collection_state="COLLECTIBLE",
            blocking_reasons=["Outstanding balance must be collected before delivery release."],
            next_actions=["COLLECT_DIRECT_SALE_BALANCE"],
        )

    if requirement_count > 0:
        return _OperationalState(
            operational_state="PAID_STOCK_BLOCKED",
            payment_state="PAID",
            inventory_state="STOCK_BLOCKED",
            delivery_state="STOCK_BLOCKED",
            collection_state="NOT_COLLECTIBLE",
            blocking_reasons=["Open stock requirement blocks delivery release."],
            next_actions=["RESOLVE_STOCK_REQUIREMENT", "OPEN_PURCHASE_NEED"],
        )

    if sale.delivery_required:
        return _OperationalState(
            operational_state="PAID_READY_FOR_DELIVERY",
            payment_state="PAID",
            inventory_state="READY",
            delivery_state="READY_FOR_DELIVERY",
            collection_state="NOT_COLLECTIBLE",
            blocking_reasons=[],
            next_actions=["SCHEDULE_DELIVERY", "MARK_DELIVERED"],
        )

    return _OperationalState(
        operational_state="DELIVERED_COMPLETE",
        payment_state="PAID",
        inventory_state="READY",
        delivery_state="COUNTER_SALE_COMPLETE",
        collection_state="NOT_COLLECTIBLE",
        blocking_reasons=[],
        next_actions=["RETURN_PRODUCT", "EXCHANGE_PRODUCT", "VIEW_RECEIPTS"],
    )


def get_direct_sale_operational_state(sale) -> dict[str, object]:
    invoice = _latest_invoice(sale)
    invoice_status = (getattr(invoice, "status", "") or "").strip().upper()
    paid_amount = _to_decimal(sale.received_total)
    due_amount = _to_decimal(sale.balance_total)
    requirement_count = _open_requirement_count(sale)
    state = _derive_state(
        sale=sale,
        invoice_status=invoice_status,
        paid_amount=paid_amount,
        due_amount=due_amount,
        requirement_count=requirement_count,
    )
    return {
        "sale_id": sale.id,
        "sale_number": sale.sale_no,
        "invoice_id": getattr(invoice, "id", None),
        "invoice_number": getattr(invoice, "document_no", None),
        "sale_status": sale.status,
        "invoice_status": invoice_status or None,
        "payment_state": state.payment_state,
        "inventory_state": state.inventory_state,
        "delivery_state": state.delivery_state,
        "collection_state": state.collection_state,
        "operational_state": state.operational_state,
        "blocking_reasons": state.blocking_reasons,
        "next_actions": state.next_actions,
        "requirement_count": requirement_count,
        "due_amount": str(due_amount),
        "paid_amount": str(paid_amount),
    }
