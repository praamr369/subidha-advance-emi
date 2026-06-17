"""
Invoice-anchored delivery readiness + controlled creation/confirmation.

This is an ADDITIVE facade. It does not own any delivery state, does not move
stock, and does not duplicate the existing delivery engines. It reads/routes a
billing invoice to the correct, already-built delivery workflow:

* DIRECT_SALE invoices  -> ServiceDeskCase(DIRECT_SALE_DELIVERY) retail workflow
  (``sync_direct_sale_delivery_case`` + ``mark_direct_sale_delivered``). Retail
  stock already leaves as ``SALE_OUT`` at invoice posting (existing workflow);
  this layer only tracks the physical handover and never writes a second ledger
  row.
* SUBSCRIPTION invoices -> ``SubscriptionDelivery`` EMI/rent/lease workflow
  (``create_subscription_delivery`` + ``mark_subscription_delivery_delivered``).
  Confirming a subscription delivery routes through the existing idempotent
  inventory bridge, which writes ``EMI_DELIVERY_OUT`` exactly once.

Every blocker is surfaced as a controlled :class:`InvoiceDeliveryBlocked`
(HTTP 400 at the API edge), never a 500.
"""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from billing.models import BillingDocumentStatus, BillingInvoice, BillingSourceType, DirectSaleStatus


# Canonical, source-agnostic display statuses for the invoice delivery rail.
STATUS_NOT_REQUIRED = "NOT_REQUIRED"
STATUS_PENDING_DELIVERY = "PENDING_DELIVERY"
STATUS_PARTIALLY_DELIVERED = "PARTIALLY_DELIVERED"
STATUS_DELIVERED = "DELIVERED"
STATUS_RETURNED = "RETURNED"
STATUS_CANCELLED = "CANCELLED"
STATUS_BLOCKED = "BLOCKED"

DELIVERY_STATUS_CHOICES = (
    STATUS_NOT_REQUIRED,
    STATUS_PENDING_DELIVERY,
    STATUS_PARTIALLY_DELIVERED,
    STATUS_DELIVERED,
    STATUS_RETURNED,
    STATUS_CANCELLED,
    STATUS_BLOCKED,
)

# Fail-closed blocker codes: when the contract activation/handover readiness
# evaluator cannot be imported or raises, subscription/rent/lease delivery MUST
# be blocked — never optimistically allowed.
CONTRACT_READINESS_SERVICE_UNAVAILABLE = "CONTRACT_READINESS_SERVICE_UNAVAILABLE"
CONTRACT_READINESS_EVALUATION_FAILED = "CONTRACT_READINESS_EVALUATION_FAILED"
_CONTRACT_READINESS_BLOCK_MESSAGE = "Contract readiness could not be evaluated. Delivery is blocked."

_INVOICE_INACTIVE_STATUSES = {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}

_DIRECT_SALE_REVERSED_STATUSES = {
    DirectSaleStatus.CANCELLED,
    DirectSaleStatus.CANCELLED_PRE_INVOICE,
    DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
    DirectSaleStatus.REVERSED_POST_INVOICE,
    DirectSaleStatus.RETURNED,
    DirectSaleStatus.ARCHIVED,
    DirectSaleStatus.EXCHANGED_CLOSED,
}


class InvoiceDeliveryBlocked(Exception):
    """Controlled, user-facing block (rendered as HTTP 400, never 500)."""

    def __init__(self, message: str, *, blockers: list[str] | None = None, code: str = "INVOICE_DELIVERY_BLOCKED"):
        super().__init__(message)
        self.message = message
        self.code = code
        self.blockers = blockers or [message]


def _q3(value) -> Decimal:
    try:
        return Decimal(str(value or "0")).quantize(Decimal("0.001"))
    except Exception:
        return Decimal("0.000")


def _invoice_is_active(invoice: BillingInvoice) -> bool:
    return (invoice.status or "").strip().upper() not in _INVOICE_INACTIVE_STATUSES


def _resolve_source(invoice: BillingInvoice) -> tuple[str, object | None]:
    """Return (source_type, source_object). source_type is DIRECT_SALE/SUBSCRIPTION/MANUAL."""
    if invoice.direct_sale_id:
        return BillingSourceType.DIRECT_SALE, invoice.direct_sale
    if invoice.subscription_id:
        return BillingSourceType.SUBSCRIPTION, invoice.subscription
    return BillingSourceType.MANUAL, None


def _default_stock_location_name(invoice: BillingInvoice) -> str | None:
    for line in invoice.lines.all():
        item = getattr(line, "inventory_item", None)
        location = getattr(item, "default_stock_location", None)
        if location is not None:
            return getattr(location, "name", None)
    return None


# ---------------------------------------------------------------------------
# Direct sale readiness
# ---------------------------------------------------------------------------
def _direct_sale_readiness(invoice: BillingInvoice, sale) -> dict:
    from billing.services.direct_sale_delivery_bridge_service import (
        compute_direct_sale_delivery_snapshot,
        get_direct_sale_delivery_case,
    )
    from billing.services.direct_sale_operational_state import get_direct_sale_operational_state

    snap = compute_direct_sale_delivery_snapshot(sale=sale)
    op = get_direct_sale_operational_state(sale)
    case = get_direct_sale_delivery_case(sale=sale)

    blockers = list(op.get("blocking_reasons") or [])
    invoice_active = _invoice_is_active(invoice)
    sale_reversed = sale.status in _DIRECT_SALE_REVERSED_STATUSES
    already_delivered = bool(sale.delivered_at) or sale.status == DirectSaleStatus.DELIVERED

    total_qty = _q3(sum((Decimal(str(line.quantity or "0")) for line in sale.lines.all()), Decimal("0")))
    delivered_qty = total_qty if already_delivered else Decimal("0.000")
    remaining_qty = (total_qty - delivered_qty) if total_qty > delivered_qty else Decimal("0.000")

    blocked_phases = {"STOCK_BLOCKED", "PAYMENT_HOLD", "DRAFT_HOLD"}
    if not invoice_active:
        delivery_status = STATUS_CANCELLED
    elif sale.status == DirectSaleStatus.RETURNED:
        delivery_status = STATUS_RETURNED
    elif sale_reversed:
        delivery_status = STATUS_CANCELLED
    elif already_delivered:
        delivery_status = STATUS_DELIVERED
    elif not sale.delivery_required:
        delivery_status = STATUS_NOT_REQUIRED
    elif snap.get("phase_code") in blocked_phases:
        delivery_status = STATUS_BLOCKED
    else:
        delivery_status = STATUS_PENDING_DELIVERY

    # A non-terminal tracking case means a delivery record already exists.
    from service_desk.models import ServiceDeskCaseStatus

    case_active = case is not None and case.status not in {
        ServiceDeskCaseStatus.CLOSED,
        ServiceDeskCaseStatus.CANCELLED,
        ServiceDeskCaseStatus.RESOLVED,
        ServiceDeskCaseStatus.REJECTED,
    }
    linked_delivery = None
    if case is not None:
        linked_delivery = {
            "kind": "DIRECT_SALE_DELIVERY",
            "id": case.id,
            "reference": case.case_no,
            "service_desk_status": case.status,
            "status": delivery_status,
        }

    can_create_delivery = bool(
        invoice_active
        and not sale_reversed
        and not already_delivered
        and not case_active
    )
    can_confirm_delivery = bool(
        invoice_active
        and not sale_reversed
        and not already_delivered
        and ("MARK_DELIVERED" in (op.get("next_actions") or []) or snap.get("phase_code") == "READY_FOR_DELIVERY")
    )

    return {
        "source_type": BillingSourceType.DIRECT_SALE,
        "source_id": sale.id,
        "source_reference": sale.sale_no,
        "delivery_required": bool(sale.delivery_required),
        "delivery_status": delivery_status,
        "delivery_display": snap.get("phase_label"),
        "stock_status": op.get("inventory_state"),
        "stock_location": _default_stock_location_name(invoice),
        "delivery_id": case.id if case else None,
        "linked_delivery": linked_delivery,
        "blockers": blockers,
        "can_create_delivery": can_create_delivery,
        "can_confirm_delivery": can_confirm_delivery,
        "already_delivered_quantity": str(delivered_qty),
        "remaining_quantity": str(remaining_qty),
        "delivery_workflow": "DIRECT_SALE",
    }


# ---------------------------------------------------------------------------
# Subscription (EMI / rent / lease) readiness
# ---------------------------------------------------------------------------
_SUBSCRIPTION_TERMINAL_FAILURE = {"FAILED", "CANCELLED"}


def _subscription_readiness(invoice: BillingInvoice, subscription) -> dict:
    from subscriptions.models import DeliveryStatus
    from subscriptions.services.delivery_service import get_current_subscription_delivery

    current = get_current_subscription_delivery(subscription)
    invoice_active = _invoice_is_active(invoice)

    # Fail-closed: if the contract activation/handover readiness gate cannot be
    # imported or evaluated, the asset must NOT be allowed to leave the shop.
    readiness_unavailable = False
    readiness_failure_code: str | None = None
    activation: dict | None = None
    try:
        from subscriptions.services.contract_activation_readiness_service import (
            evaluate_contract_activation_readiness,
        )
    except ImportError:
        readiness_unavailable = True
        readiness_failure_code = CONTRACT_READINESS_SERVICE_UNAVAILABLE
    else:
        try:
            activation = evaluate_contract_activation_readiness(subscription)
        except Exception:
            readiness_unavailable = True
            readiness_failure_code = CONTRACT_READINESS_EVALUATION_FAILED

    if readiness_unavailable:
        activation_ready = False
        blockers = [readiness_failure_code, _CONTRACT_READINESS_BLOCK_MESSAGE]
    else:
        blockers = list((activation or {}).get("blocker_messages") or [])
        activation_ready = bool((activation or {}).get("can_reach_active_or_handover", False))

    current_status = (getattr(current, "status", "") or "").strip().upper()
    if not invoice_active:
        delivery_status = STATUS_CANCELLED
    elif current_status == DeliveryStatus.DELIVERED:
        delivery_status = STATUS_DELIVERED
    elif current_status == DeliveryStatus.RETURNED:
        delivery_status = STATUS_RETURNED
    elif readiness_unavailable:
        # Readiness could not be checked -> block (never pass).
        delivery_status = STATUS_BLOCKED
    elif current is None:
        delivery_status = STATUS_PENDING_DELIVERY
    elif current_status in _SUBSCRIPTION_TERMINAL_FAILURE:
        delivery_status = STATUS_CANCELLED
    elif current_status == DeliveryStatus.BLOCKED_STOCK_UNAVAILABLE:
        delivery_status = STATUS_BLOCKED
    else:
        delivery_status = STATUS_PENDING_DELIVERY

    # Stock snapshot for the linked product (read-only, never raises).
    stock_status = None
    product_id = getattr(subscription, "product_id", None)
    if product_id:
        try:
            from inventory.services.demand_planning_service import stock_status_for_delivery

            stock_status = stock_status_for_delivery(product_id=product_id).get("status")
        except Exception:  # pragma: no cover
            stock_status = None

    current_active = current is not None and current_status not in {
        DeliveryStatus.DELIVERED,
        DeliveryStatus.RETURNED,
        DeliveryStatus.FAILED,
        DeliveryStatus.CANCELLED,
    }
    already_delivered = current_status == DeliveryStatus.DELIVERED
    delivered_qty = Decimal("1.000") if already_delivered else Decimal("0.000")
    remaining_qty = Decimal("0.000") if already_delivered else Decimal("1.000")

    linked_delivery = None
    if current is not None:
        linked_delivery = {
            "kind": "SUBSCRIPTION_DELIVERY",
            "id": current.id,
            "reference": current.delivery_reference,
            "service_desk_status": None,
            "status": delivery_status,
        }

    can_create_delivery = bool(invoice_active and current is None and not readiness_unavailable)
    can_confirm_delivery = bool(
        invoice_active and current_active and activation_ready and not readiness_unavailable
    )

    return {
        "source_type": BillingSourceType.SUBSCRIPTION,
        "source_id": subscription.id,
        "source_reference": getattr(subscription, "subscription_number", None)
        or getattr(subscription, "contract_reference", None),
        "delivery_required": True,
        "delivery_status": delivery_status,
        "delivery_display": (current_status or "PENDING_DELIVERY").replace("_", " ").title(),
        "stock_status": stock_status,
        "stock_location": _default_stock_location_name(invoice),
        "delivery_id": current.id if current else None,
        "linked_delivery": linked_delivery,
        "blockers": blockers if not activation_ready else [],
        "can_create_delivery": can_create_delivery,
        "can_confirm_delivery": can_confirm_delivery,
        "already_delivered_quantity": str(delivered_qty),
        "remaining_quantity": str(remaining_qty),
        "delivery_workflow": "SUBSCRIPTION",
        "readiness_unavailable": readiness_unavailable,
    }


def _manual_readiness(invoice: BillingInvoice) -> dict:
    invoice_active = _invoice_is_active(invoice)
    return {
        "source_type": BillingSourceType.MANUAL,
        "source_id": None,
        "source_reference": invoice.source_reference or None,
        "delivery_required": False,
        "delivery_status": STATUS_CANCELLED if not invoice_active else STATUS_NOT_REQUIRED,
        "delivery_display": "No deliverable source",
        "stock_status": None,
        "stock_location": _default_stock_location_name(invoice),
        "delivery_id": None,
        "linked_delivery": None,
        "blockers": (
            []
            if invoice_active
            else ["Invoice is cancelled/void."]
        ),
        "can_create_delivery": False,
        "can_confirm_delivery": False,
        "already_delivered_quantity": "0.000",
        "remaining_quantity": "0.000",
        "delivery_workflow": "NONE",
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def get_invoice_delivery_readiness(invoice: BillingInvoice) -> dict:
    """Read-only delivery readiness snapshot for a billing invoice (no mutation)."""
    source_type, source = _resolve_source(invoice)
    if source_type == BillingSourceType.DIRECT_SALE and source is not None:
        payload = _direct_sale_readiness(invoice, source)
    elif source_type == BillingSourceType.SUBSCRIPTION and source is not None:
        payload = _subscription_readiness(invoice, source)
    else:
        payload = _manual_readiness(invoice)

    payload["invoice_id"] = invoice.id
    payload["invoice_no"] = invoice.document_no
    payload["invoice_status"] = invoice.status
    return payload


@transaction.atomic
def create_delivery_from_invoice(invoice: BillingInvoice, performed_by, payload: dict | None = None) -> dict:
    """
    Controlled creation of a delivery from a posted/active invoice.

    Reuses the existing per-source delivery engines. Never silently edits the
    posted invoice's financial fields; for direct sales it may enable the
    deliverable flag on the *source sale* (audited inside the reused service).
    """
    payload = payload or {}
    if not _invoice_is_active(invoice):
        raise InvoiceDeliveryBlocked(
            "Cannot create a delivery for a cancelled/void invoice.",
            code="INVOICE_NOT_ACTIVE",
        )

    source_type, source = _resolve_source(invoice)

    if source_type == BillingSourceType.DIRECT_SALE and source is not None:
        return _create_direct_sale_delivery(invoice, source, performed_by, payload)
    if source_type == BillingSourceType.SUBSCRIPTION and source is not None:
        return _create_subscription_delivery(invoice, source, performed_by, payload)

    raise InvoiceDeliveryBlocked(
        "This invoice has no deliverable source. Link a direct sale or subscription first.",
        code="NO_DELIVERABLE_SOURCE",
    )


def _create_direct_sale_delivery(invoice, sale, performed_by, payload) -> dict:
    from billing.models import DirectSale
    from billing.services.direct_sale_delivery_bridge_service import sync_direct_sale_delivery_case
    from subscriptions.models import AuditLog

    locked = DirectSale.objects.select_for_update(of=("self",)).get(pk=sale.id)

    if locked.status in _DIRECT_SALE_REVERSED_STATUSES:
        raise InvoiceDeliveryBlocked(
            "Source sale is reversed/archived and cannot be delivered.",
            code="SOURCE_REVERSED",
        )
    if locked.delivered_at or locked.status == DirectSaleStatus.DELIVERED:
        raise InvoiceDeliveryBlocked(
            "Stock has already been delivered for this sale.",
            code="ALREADY_DELIVERED",
        )

    readiness = _direct_sale_readiness(invoice, locked)
    if not readiness["can_create_delivery"]:
        # A live tracking case already exists -> not a duplicate-creating path.
        if readiness.get("delivery_id"):
            raise InvoiceDeliveryBlocked(
                "A delivery already exists for this invoice.",
                code="DELIVERY_EXISTS",
                blockers=["A delivery already exists for this invoice."],
            )
        raise InvoiceDeliveryBlocked(
            "Delivery cannot be created for this invoice right now.",
            code="CREATE_BLOCKED",
            blockers=readiness.get("blockers") or ["Delivery cannot be created for this invoice right now."],
        )

    # Controlled, audited enablement of the deliverable flag on the SOURCE sale
    # (not the posted invoice). This is the explicit "create delivery later" path.
    if not locked.delivery_required:
        locked.delivery_required = True
        locked.save(update_fields=["delivery_required", "updated_at"])
        AuditLog.objects.create(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            model_name="DirectSale",
            object_id=locked.id,
            performed_by=performed_by,
            metadata={
                "event": "DIRECT_SALE_DELIVERY_ENABLED_FROM_INVOICE",
                "direct_sale_id": locked.id,
                "invoice_id": invoice.id,
                "invoice_no": invoice.document_no,
            },
        )

    case = sync_direct_sale_delivery_case(sale=locked, actor=performed_by)
    if case is None:
        raise InvoiceDeliveryBlocked(
            "Unable to open delivery tracking for this sale.",
            code="DELIVERY_OPEN_FAILED",
        )

    locked.refresh_from_db()
    result = get_invoice_delivery_readiness(invoice)
    result["created"] = True
    result["delivery_id"] = case.id
    return result


def _create_subscription_delivery(invoice, subscription, performed_by, payload) -> dict:
    from subscriptions.services.delivery_service import create_subscription_delivery
    from subscriptions.services.kyc_readiness_service import KycGateError

    try:
        delivery = create_subscription_delivery(
            subscription=subscription,
            performed_by=performed_by,
            delivery_reference=(payload.get("delivery_reference") or None),
            scheduled_date=payload.get("scheduled_date"),
            receiver_name=(payload.get("receiver_name") or ""),
            receiver_phone=(payload.get("receiver_phone") or ""),
            delivery_address_snapshot=(payload.get("delivery_address_snapshot") or ""),
            notes=(payload.get("notes") or ""),
        )
    except KycGateError:
        # Already a controlled HTTP 400; let it bubble for the standard renderer.
        raise
    except ValueError as exc:
        raise InvoiceDeliveryBlocked(str(exc), code="CREATE_BLOCKED") from exc

    result = get_invoice_delivery_readiness(invoice)
    result["created"] = True
    result["delivery_id"] = delivery.id
    return result


@transaction.atomic
def confirm_delivery_for_invoice(invoice: BillingInvoice, performed_by) -> dict:
    """
    Confirm/handover the delivery linked to an invoice.

    Routes to the existing confirmation service. For subscriptions this writes
    ``EMI_DELIVERY_OUT`` exactly once via the existing idempotent inventory
    bridge; for direct sales the retail ``SALE_OUT`` already happened at posting,
    so confirmation only records the handover (no second ledger row).
    """
    if not _invoice_is_active(invoice):
        raise InvoiceDeliveryBlocked(
            "Cannot confirm a delivery for a cancelled/void invoice.",
            code="INVOICE_NOT_ACTIVE",
        )

    source_type, source = _resolve_source(invoice)

    if source_type == BillingSourceType.DIRECT_SALE and source is not None:
        return _confirm_direct_sale_delivery(invoice, source, performed_by)
    if source_type == BillingSourceType.SUBSCRIPTION and source is not None:
        return _confirm_subscription_delivery(invoice, source, performed_by)

    raise InvoiceDeliveryBlocked(
        "This invoice has no deliverable source to confirm.",
        code="NO_DELIVERABLE_SOURCE",
    )


def _confirm_direct_sale_delivery(invoice, sale, performed_by) -> dict:
    from billing.services.billing_service import mark_direct_sale_delivered

    readiness = _direct_sale_readiness(invoice, sale)
    if readiness["delivery_status"] == STATUS_DELIVERED:
        result = get_invoice_delivery_readiness(invoice)
        result["confirmed"] = False
        return result
    if not readiness["can_confirm_delivery"]:
        raise InvoiceDeliveryBlocked(
            "Delivery cannot be confirmed yet.",
            code="CONFIRM_BLOCKED",
            blockers=readiness.get("blockers") or ["Delivery cannot be confirmed yet."],
        )

    try:
        mark_direct_sale_delivered(direct_sale_id=sale.id, delivered_by=performed_by)
    except ValueError as exc:
        raise InvoiceDeliveryBlocked(str(exc), code="CONFIRM_BLOCKED") from exc

    result = get_invoice_delivery_readiness(invoice)
    result["confirmed"] = True
    return result


def _confirm_subscription_delivery(invoice, subscription, performed_by) -> dict:
    from subscriptions.models import DeliveryStatus
    from subscriptions.services.delivery_service import (
        get_current_subscription_delivery,
        mark_subscription_delivery_delivered,
    )
    from subscriptions.services.kyc_readiness_service import KycGateError

    delivery = get_current_subscription_delivery(subscription)
    if delivery is None:
        raise InvoiceDeliveryBlocked(
            "No delivery exists for this subscription invoice yet.",
            code="NO_DELIVERY",
        )
    if delivery.status == DeliveryStatus.DELIVERED:
        result = get_invoice_delivery_readiness(invoice)
        result["confirmed"] = False
        return result

    try:
        mark_subscription_delivery_delivered(
            delivery=delivery,
            performed_by=performed_by,
        )
    except KycGateError:
        raise
    except ValueError as exc:
        raise InvoiceDeliveryBlocked(str(exc), code="CONFIRM_BLOCKED") from exc

    result = get_invoice_delivery_readiness(invoice)
    result["confirmed"] = True
    return result
