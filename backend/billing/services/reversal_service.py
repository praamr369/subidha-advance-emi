from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from billing.models import (
    BillingChannel,
    BillingCreditNote,
    BillingCreditNoteLine,
    BillingDocumentStatus,
    BillingInvoiceLine,
    BillingInvoice,
    CustomerCreditLedger,
    CustomerRefund,
    CustomerRefundStatus,
    DirectSale,
    DirectSaleReturn,
    DirectSaleReturnKind,
    DirectSaleReturnLine,
    DirectSaleReturnStatus,
    DirectSaleStatus,
    PurchaseReturn,
    PurchaseReturnLine,
    PurchaseReturnStatus,
    RefundMethod,
    ReturnStockDestination,
)
from billing.services.billing_service import (
    _ensure_credit_sequence,
    _issue_series_number,
    post_billing_credit_note,
    void_receipt_document,
)
from inventory.models import (
    InventoryItem,
    PurchaseBill,
    PurchaseBillStatus,
    SOFT_HOLD_MOVEMENT_TYPES,
    StockLedger,
    StockLocation,
    StockMovementType,
)
from inventory.services.stock_movement_service import post_movement
from inventory.services.stock_service import create_stock_ledger_entry
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


def _mask_phone(phone: str | None) -> str:
    raw = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if len(raw) < 4:
        return ""
    return f"{'*' * max(0, len(raw) - 4)}{raw[-4:]}"


def _location_matches(location: StockLocation, token: str) -> bool:
    haystack = f"{location.code} {location.name}".upper()
    return token.upper() in haystack


def _return_destination_catalog() -> dict[str, list[StockLocation]]:
    rows = list(StockLocation.objects.filter(is_active=True).order_by("name", "id"))
    return {
        ReturnStockDestination.INSPECTION: [row for row in rows if _location_matches(row, "INSPECTION") or _location_matches(row, "INSP")],
        ReturnStockDestination.DAMAGED: [row for row in rows if _location_matches(row, "DAMAGED") or _location_matches(row, "DMG")],
        ReturnStockDestination.SERVICE: [row for row in rows if _location_matches(row, "SERVICE") or _location_matches(row, "SVC")],
        ReturnStockDestination.SELLABLE: rows,
    }


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _qty(value) -> Decimal:
    return Decimal(str(value or "0")).quantize(Decimal("0.001"))


def _require_reason(reason: str) -> str:
    cleaned = (reason or "").strip()
    if not cleaned:
        raise ValueError("Reason is required.")
    return cleaned


def _fy_sequence(series_code: str, prefix: str, dt):
    from accounting.services.gst_document_posting_service import ensure_document_sequence, financial_year_for

    fy = financial_year_for(dt)
    return ensure_document_sequence(series_code=series_code, financial_year=fy, prefix=f"{prefix}-{fy}", padding=5)


def _customer_credit_balance(customer_id: int) -> Decimal:
    agg = CustomerCreditLedger.objects.filter(customer_id=customer_id).aggregate(
        credit_total=Sum("credit_amount"),
        debit_total=Sum("debit_amount"),
    )
    return _money(agg.get("credit_total")) - _money(agg.get("debit_total"))


def _clean_return_kind(value: str | None) -> str:
    return_kind = str(value or DirectSaleReturnKind.DELIVERED_RETURN).strip().upper()
    valid = {choice[0] for choice in DirectSaleReturnKind.choices}
    if return_kind not in valid:
        raise ValueError("Invalid direct sale return kind.")
    return return_kind


def _clean_stock_destination(value: str | None) -> str:
    destination = str(value or ReturnStockDestination.INSPECTION).strip().upper()
    valid = {choice[0] for choice in ReturnStockDestination.choices}
    if destination not in valid:
        raise ValueError("Invalid stock destination.")
    return destination


def _stock_location_for_destination(*, destination: str, stock_location_id: int | None, inventory_item=None):
    if destination == ReturnStockDestination.SELLABLE:
        if stock_location_id:
            return StockLocation.objects.get(pk=stock_location_id)
        return getattr(inventory_item, "default_stock_location", None)
    if not stock_location_id:
        raise ValueError(
            f"{destination.title()} returns require an explicit stock location. Create/select a dedicated {destination} location in inventory setup."
        )
    return StockLocation.objects.get(pk=stock_location_id)


def _location_quantity(*, inventory_item: InventoryItem, stock_location: StockLocation | None) -> Decimal:
    aggregate = inventory_item.stock_ledger.exclude(
        movement_type__in=list(SOFT_HOLD_MOVEMENT_TYPES)
    ).filter(
        stock_location=stock_location
    ).aggregate(
        total_in=Sum("quantity_in"),
        total_out=Sum("quantity_out"),
    )
    total_in = _qty(aggregate.get("total_in"))
    total_out = _qty(aggregate.get("total_out"))
    opening = Decimal("0.000")
    if stock_location and inventory_item.default_stock_location_id == stock_location.id:
        opening = _qty(inventory_item.opening_stock_qty)
    return opening + total_in - total_out


def _return_stock_already_posted(*, return_id: int, line_id: int) -> bool:
    return StockLedger.objects.filter(
        movement_type=StockMovementType.SALE_RETURN_IN,
        reference_model="DirectSaleReturnLine",
        reference_id=f"{return_id}:{line_id}",
    ).exists()


def _candidate_invoice_lines(*, direct_sale_line) -> list:
    return list(
        BillingInvoiceLine.objects.filter(invoice__direct_sale=direct_sale_line.direct_sale).filter(
            Q(inventory_item_id=direct_sale_line.inventory_item_id)
            | Q(product_id=direct_sale_line.product_id)
            | Q(description=direct_sale_line.description)
        ).values_list("invoice_id", "id")
    )


def get_sale_out_quantity(direct_sale_line) -> Decimal:
    invoice_line_pairs = _candidate_invoice_lines(direct_sale_line=direct_sale_line)
    sale = direct_sale_line.direct_sale
    by_invoice_line = Decimal("0.000")
    if invoice_line_pairs:
        refs = [f"{invoice_id}:{line_id}" for invoice_id, line_id in invoice_line_pairs]
        aggregate = StockLedger.objects.filter(
            movement_type=StockMovementType.SALE_OUT,
            reference_model="BillingInvoiceLine",
            reference_id__in=refs,
        ).aggregate(total=Sum("quantity_out"))
        by_invoice_line = _qty(aggregate.get("total"))
    if by_invoice_line > Decimal("0.000"):
        return by_invoice_line
    fallback_q = Q(reference_model="DirectSaleLine", reference_id=str(direct_sale_line.id))
    if sale.sale_no:
        fallback_q = fallback_q | Q(notes__icontains=sale.sale_no)
    fallback_q = fallback_q | Q(notes__icontains=f"sale {sale.id}")
    fallback = StockLedger.objects.filter(
        movement_type=StockMovementType.SALE_OUT,
        inventory_item_id=direct_sale_line.inventory_item_id,
    ).filter(fallback_q).aggregate(total=Sum("quantity_out"))
    return _qty(fallback.get("total"))


def get_returned_quantity(direct_sale_line) -> Decimal:
    posted_return_lines = DirectSaleReturnLine.objects.filter(
        direct_sale_line=direct_sale_line,
        direct_sale_return__status=DirectSaleReturnStatus.POSTED,
    )
    refs = [f"{line.direct_sale_return_id}:{line.id}" for line in posted_return_lines.only("id", "direct_sale_return_id")]
    if refs:
        ledger_aggregate = StockLedger.objects.filter(
            movement_type=StockMovementType.SALE_RETURN_IN,
            reference_model="DirectSaleReturnLine",
            reference_id__in=refs,
        ).aggregate(total=Sum("quantity_in"))
        ledger_total = _qty(ledger_aggregate.get("total"))
        if ledger_total > Decimal("0.000"):
            return ledger_total
    aggregate = posted_return_lines.aggregate(total=Sum("quantity"))
    return _qty(aggregate.get("total"))


def _reserved_return_quantity(direct_sale_line) -> Decimal:
    aggregate = DirectSaleReturnLine.objects.filter(
        direct_sale_line=direct_sale_line,
        direct_sale_return__status__in=[
            DirectSaleReturnStatus.DRAFT,
            DirectSaleReturnStatus.APPROVED,
            DirectSaleReturnStatus.POSTED,
        ],
    ).aggregate(total=Sum("quantity"))
    return _qty(aggregate.get("total"))


def get_returnable_quantity(direct_sale_line) -> Decimal:
    sold_qty = _qty(direct_sale_line.quantity)
    sale_out_qty = get_sale_out_quantity(direct_sale_line)
    returned_qty = get_returned_quantity(direct_sale_line)
    return max(Decimal("0.000"), min(sold_qty, sale_out_qty) - returned_qty)


def post_sale_return_stock_movement(*, ret: DirectSaleReturn, line: DirectSaleReturnLine, posted_by):
    sale_out_qty = get_sale_out_quantity(line.direct_sale_line)
    if sale_out_qty <= Decimal("0.000"):
        if ret.return_kind == DirectSaleReturnKind.POST_INVOICE_CANCEL:
            return None, False, "ORIGINAL_SALE_OUT_NOT_POSTED"
        raise ValueError("Original SALE_OUT stock movement was not found for the returned item.")
    if line.quantity > get_returnable_quantity(line.direct_sale_line):
        raise ValueError(f"Return quantity exceeds posted sale-out quantity for line {line.direct_sale_line_id}.")
    location = _stock_location_for_destination(
        destination=ret.stock_destination,
        stock_location_id=ret.stock_location_id,
        inventory_item=line.inventory_item,
    )
    entry, created = create_stock_ledger_entry(
        inventory_item=line.inventory_item,
        movement_type=StockMovementType.SALE_RETURN_IN,
        movement_date=timezone.localdate(),
        stock_location=location,
        quantity_in=line.quantity,
        reference_model="DirectSaleReturnLine",
        reference_id=f"{ret.id}:{line.id}",
        notes=f"{ret.return_no} for original sale {ret.direct_sale.sale_no or ret.direct_sale_id}",
        posted_by=posted_by,
        posted_journal_entry=getattr(ret.credit_note, "posted_journal_entry", None),
    )
    return entry, created, None


def post_exchange_replacement_stock_movement(*, ret: DirectSaleReturn, posted_by) -> dict:
    created_count = 0
    existing_count = 0
    replacement_lines = list((ret.metadata or {}).get("exchange_replacement_lines") or [])
    for index, row in enumerate(replacement_lines, start=1):
        item = InventoryItem.objects.select_related("product", "default_stock_location").get(pk=int(row["inventory_item_id"]))
        qty = _qty(row["quantity"])
        location_id = row.get("stock_location_id")
        location = StockLocation.objects.get(pk=location_id) if location_id else item.default_stock_location
        if location is None:
            raise ValueError("Replacement stock location is required for exchange posting.")
        available = _location_quantity(inventory_item=item, stock_location=location)
        if available < qty:
            raise ValueError(
                f"Insufficient stock for replacement item {item.sku or item.id} at {location.name}. Available: {available}, Requested: {qty}."
            )
        _entry, created = create_stock_ledger_entry(
            inventory_item=item,
            movement_type=StockMovementType.SALE_OUT,
            movement_date=timezone.localdate(),
            stock_location=location,
            quantity_out=qty,
            reference_model="DirectSaleExchangeReplacement",
            reference_id=f"{ret.id}:{index}",
            notes=f"Exchange replacement for {ret.return_no} against sale {ret.direct_sale.sale_no or ret.direct_sale_id}",
            posted_by=posted_by,
            posted_journal_entry=getattr(ret.credit_note, "posted_journal_entry", None),
        )
        created_count += 1 if created else 0
        existing_count += 0 if created else 1
    return {"created_count": created_count, "existing_count": existing_count}


def _post_direct_sale_return_stock(*, ret: DirectSaleReturn, posted_by) -> dict:
    created_count = 0
    existing_count = 0
    skipped_count = 0
    for line in ret.lines.select_related("inventory_item").all():
        if not line.inventory_item_id or not line.inventory_item.stock_tracking_enabled:
            continue
        if _return_stock_already_posted(return_id=ret.id, line_id=line.id):
            existing_count += 1
            continue
        _entry, created, skipped_reason = post_sale_return_stock_movement(ret=ret, line=line, posted_by=posted_by)
        if skipped_reason:
            skipped_count += 1
            continue
        created_count += 1 if created else 0
        existing_count += 0 if created else 1
    return {"created_count": created_count, "existing_count": existing_count, "skipped_count": skipped_count}


def get_direct_sale_return_eligibility(
    *,
    direct_sale_id: int,
    replacement_inventory_item_id: int | None = None,
    replacement_stock_location_id: int | None = None,
    replacement_quantity=None,
) -> dict:
    sale = DirectSale.objects.prefetch_related("lines", "billing_invoices", "receipts").get(pk=direct_sale_id)
    invoice = sale.billing_invoices.order_by("-invoice_date", "-id").first()
    posted_invoice = sale.billing_invoices.filter(status=BillingDocumentStatus.POSTED).order_by("-invoice_date", "-id").first()
    line_ids = [line.id for line in sale.lines.all()]
    returned = {
        int(row["direct_sale_line_id"]): _qty(row["total"])
        for row in DirectSaleReturnLine.objects.filter(
            direct_sale_line_id__in=line_ids,
            direct_sale_return__status__in=[DirectSaleReturnStatus.APPROVED, DirectSaleReturnStatus.POSTED],
        )
        .values("direct_sale_line_id")
        .annotate(total=Sum("quantity"))
    }
    delivered = bool(sale.delivered_at) or sale.status == DirectSaleStatus.DELIVERED
    active_receipt_total = _money(
        sale.receipts.filter(status=BillingDocumentStatus.POSTED).aggregate(total=Sum("amount"))["total"]
    )
    void_receipt_total = _money(
        sale.receipts.filter(status=BillingDocumentStatus.VOID).aggregate(total=Sum("amount"))["total"]
    )
    outstanding_balance = _money(sale.grand_total) - active_receipt_total
    posted_receipt_count = sale.receipts.filter(status=BillingDocumentStatus.POSTED).count()
    invoiced = posted_invoice is not None or sale.status == DirectSaleStatus.INVOICED
    replacement_stock_available = None
    stock_blocking_reasons: list[str] = []
    if replacement_inventory_item_id:
        replacement_item = InventoryItem.objects.select_related("default_stock_location").get(pk=replacement_inventory_item_id)
        replacement_location = (
            StockLocation.objects.get(pk=replacement_stock_location_id)
            if replacement_stock_location_id
            else replacement_item.default_stock_location
        )
        replacement_stock_available = str(
            _location_quantity(inventory_item=replacement_item, stock_location=replacement_location)
        ) if replacement_location else None
        requested_qty = _qty(replacement_quantity or "1.000")
        if replacement_location is None:
            stock_blocking_reasons.append("Replacement stock location is required for exchange.")
        elif _location_quantity(inventory_item=replacement_item, stock_location=replacement_location) < requested_qty:
            stock_blocking_reasons.append("Replacement stock is insufficient at the selected location.")
    invoice_for_payload = posted_invoice or invoice
    sale_out_by_line = {line.id: get_sale_out_quantity(line) for line in sale.lines.all()}
    returnable_by_line = {line.id: get_returnable_quantity(line) for line in sale.lines.all()}
    destination_catalog = _return_destination_catalog()
    missing_location_types = []
    if not destination_catalog[ReturnStockDestination.INSPECTION]:
        missing_location_types.append(ReturnStockDestination.INSPECTION)
    if not destination_catalog[ReturnStockDestination.DAMAGED]:
        missing_location_types.append(ReturnStockDestination.DAMAGED)
    if not destination_catalog[ReturnStockDestination.SERVICE]:
        missing_location_types.append(ReturnStockDestination.SERVICE)
    stock_setup_required = bool(missing_location_types)
    allowed_actions = []
    blocking_reasons: list[str] = []
    if sale.status == DirectSaleStatus.CANCELLED:
        blocking_reasons.append("ALREADY_REVERSED")
    if sale.status == DirectSaleStatus.CANCELLED:
        allowed_actions = []
    elif delivered:
        allowed_actions.extend(["RETURN_PRODUCT", "EXCHANGE_PRODUCT"])
    elif not invoiced and sale.status in {DirectSaleStatus.DRAFT, DirectSaleStatus.CONFIRMED}:
        allowed_actions.append("PRE_INVOICE_CANCEL")
    elif invoiced:
        allowed_actions.append("POST_INVOICE_CANCEL")
        if posted_receipt_count > 0:
            blocking_reasons.append("ACTIVE_RECEIPT_EXISTS")
    if stock_setup_required:
        blocking_reasons.append("STOCK_SETUP_REQUIRED")
    if not blocking_reasons:
        blocking_reasons.append("NONE")
    active_receipt_count = posted_receipt_count
    void_receipt_count = sale.receipts.filter(status=BillingDocumentStatus.VOID).count()
    direct_sale_active_statuses = {
        DirectSaleStatus.DRAFT,
        DirectSaleStatus.CONFIRMED,
        DirectSaleStatus.INVOICED,
        DirectSaleStatus.DELIVERED,
    }
    is_operationally_active = sale.status in direct_sale_active_statuses
    is_collectible = is_operationally_active and outstanding_balance > Decimal("0.00")
    is_dashboard_visible = is_operationally_active
    has_returnable_line = any(qty > Decimal("0.000") for qty in returnable_by_line.values())
    sale_credit_totals = CustomerCreditLedger.objects.filter(
        customer_id=sale.customer_id,
        direct_sale_return__direct_sale_id=sale.id,
    ).aggregate(credit=Sum("credit_amount"), debit=Sum("debit_amount"))
    sale_credit_balance = _money(sale_credit_totals.get("credit")) - _money(sale_credit_totals.get("debit"))
    refund_paid = _money(
        CustomerRefund.objects.filter(
            customer_id=sale.customer_id,
            direct_sale_return__direct_sale_id=sale.id,
            status=CustomerRefundStatus.PAID,
        ).aggregate(total=Sum("amount")).get("total")
    )
    net_customer_value = max(Decimal("0.00"), sale_credit_balance - refund_paid)
    customer_value_settled = net_customer_value <= Decimal("0.00")
    can_create_return = delivered and any(qty > Decimal("0.000") for qty in returnable_by_line.values()) and not stock_setup_required
    can_create_exchange = can_create_return
    can_finalize_reversal = (
        posted_receipt_count == 0
        and getattr(invoice_for_payload, "status", "") in {BillingDocumentStatus.VOID, BillingDocumentStatus.CANCELLED}
        and (not delivered or not has_returnable_line)
        and customer_value_settled
    )
    finalize_blocking_reasons: list[str] = []
    if posted_receipt_count > 0:
        finalize_blocking_reasons.append("Active posted receipts must be voided.")
    if getattr(invoice_for_payload, "status", "") not in {
        BillingDocumentStatus.VOID,
        BillingDocumentStatus.CANCELLED,
    }:
        finalize_blocking_reasons.append("Invoice must be reversed or voided before final archive.")
    if delivered and has_returnable_line:
        finalize_blocking_reasons.append("Delivered lines still have returnable quantity. Post SALE_RETURN_IN first.")
    if not customer_value_settled:
        finalize_blocking_reasons.append("Customer value is unsettled. Complete credit/refund decision first.")
    workflow_steps = [
        {"key": "RECEIPT_VOIDED", "label": "Receipt voided", "status": "DONE" if posted_receipt_count == 0 else "REQUIRED"},
        {
            "key": "INVOICE_REVERSED_OR_VOIDED",
            "label": "Invoice reversed/voided",
            "status": "DONE" if getattr(invoice_for_payload, "status", "") in {BillingDocumentStatus.VOID, BillingDocumentStatus.CANCELLED} else "REQUIRED",
        },
        {
            "key": "PRODUCT_RETURNED_TO_STOCK",
            "label": "Product returned to stock",
            "status": "DONE" if (not delivered or not has_returnable_line) else "REQUIRED",
        },
        {
            "key": "CUSTOMER_VALUE_SETTLED",
            "label": "Customer credit/refund decision",
            "status": "DONE" if customer_value_settled else "BLOCKED",
        },
        {
            "key": "FINALIZE_ARCHIVE",
            "label": "Finalize/archive sale",
            "status": "DONE" if can_finalize_reversal else "BLOCKED",
        },
    ]
    default_destination_row = (
        destination_catalog[ReturnStockDestination.INSPECTION][0]
        if destination_catalog[ReturnStockDestination.INSPECTION]
        else None
    )
    return {
        "sale_id": sale.id,
        "direct_sale_id": sale.id,
        "sale_no": sale.sale_no or "",
        "customer_id": sale.customer_id,
        "customer_name": sale.customer_name_snapshot or getattr(sale.customer, "name", ""),
        "customer_phone_masked": _mask_phone(sale.customer_phone_snapshot or getattr(sale.customer, "phone", "")),
        "sale_status": sale.status,
        "invoice_id": getattr(invoice_for_payload, "id", None),
        "invoice_no": getattr(invoice_for_payload, "document_no", "") or "",
        "invoice_status": getattr(invoice_for_payload, "status", ""),
        "delivery_status": "DELIVERED" if delivered else "PENDING",
        "invoice_received_total": str(_money(getattr(invoice_for_payload, "received_total", Decimal("0.00")))),
        "invoice_balance_total": str(_money(getattr(invoice_for_payload, "balance_total", Decimal("0.00")))),
        "direct_sale_received_total": str(_money(sale.received_total)),
        "direct_sale_balance_total": str(_money(sale.balance_total)),
        "already_returned_quantities": {str(k): str(v) for k, v in returned.items()},
        "returnable_quantities": {str(k): str(v) for k, v in returnable_by_line.items()},
        "original_sale_out_posted": any(qty > Decimal("0.000") for qty in sale_out_by_line.values()),
        "allowed_stock_destinations": [
            ReturnStockDestination.INSPECTION,
            ReturnStockDestination.DAMAGED,
            ReturnStockDestination.SERVICE,
            ReturnStockDestination.SELLABLE,
        ],
        "default_stock_destination": ReturnStockDestination.INSPECTION,
        "return_lines": [
            {
                "sale_line_id": line.id,
                "direct_sale_line_id": line.id,
                "product_id": line.product_id,
                "product_name": getattr(line.product, "name", "") if getattr(line, "product", None) else line.description,
                "sku": line.sku_snapshot or getattr(getattr(line, "inventory_item", None), "sku", ""),
                "inventory_item_id": line.inventory_item_id,
                "description": line.description,
                "sold_quantity": str(_qty(line.quantity)),
                "sale_out_quantity": str(sale_out_by_line.get(line.id, Decimal("0.000"))),
                "already_returned_quantity": str(returned.get(line.id, Decimal("0.000"))),
                "max_returnable_quantity": str(get_returnable_quantity(line)),
                "returnable_quantity": str(get_returnable_quantity(line)),
                "default_return_quantity": str(get_returnable_quantity(line)),
                "unit_price": str(line.unit_price),
                "line_total": str(line.line_total),
                "original_sale_out_posted": sale_out_by_line.get(line.id, Decimal("0.000")) > Decimal("0.000"),
                "return_stock_destination_required": True,
                "allowed_stock_destinations": [
                    ReturnStockDestination.INSPECTION,
                    ReturnStockDestination.DAMAGED,
                    ReturnStockDestination.SERVICE,
                    ReturnStockDestination.SELLABLE,
                ],
                "stock_blocking_reasons": (
                    [] if sale_out_by_line.get(line.id, Decimal("0.000")) > Decimal("0.000") else ["ORIGINAL_SALE_OUT_NOT_POSTED"]
                ),
            }
            for line in sale.lines.all()
        ],
        "sold_lines": [
            {
                "direct_sale_line_id": line.id,
                "product_id": line.product_id,
                "inventory_item_id": line.inventory_item_id,
                "description": line.description,
                "sold_quantity": str(_qty(line.quantity)),
                "already_returned_quantity": str(returned.get(line.id, Decimal("0.000"))),
                "max_returnable_quantity": str(get_returnable_quantity(line)),
                "returnable_quantity": str(get_returnable_quantity(line)),
                "unit_price": str(line.unit_price),
                "line_total": str(line.line_total),
            }
            for line in sale.lines.all()
        ],
        "stock_destinations": [
            {
                "id": row.id,
                "name": row.name,
                "code": row.code,
                "type": (
                    ReturnStockDestination.INSPECTION
                    if row in destination_catalog[ReturnStockDestination.INSPECTION]
                    else ReturnStockDestination.DAMAGED
                    if row in destination_catalog[ReturnStockDestination.DAMAGED]
                    else ReturnStockDestination.SERVICE
                    if row in destination_catalog[ReturnStockDestination.SERVICE]
                    else ReturnStockDestination.SELLABLE
                ),
                "is_sellable": (
                    row not in destination_catalog[ReturnStockDestination.INSPECTION]
                    and row not in destination_catalog[ReturnStockDestination.DAMAGED]
                    and row not in destination_catalog[ReturnStockDestination.SERVICE]
                ),
                "requires_condition_confirmation": (
                    row not in destination_catalog[ReturnStockDestination.INSPECTION]
                    and row not in destination_catalog[ReturnStockDestination.DAMAGED]
                    and row not in destination_catalog[ReturnStockDestination.SERVICE]
                ),
            }
            for row in destination_catalog[ReturnStockDestination.SELLABLE]
        ],
        "default_stock_destination_id": getattr(default_destination_row, "id", None),
        "default_return_kind": DirectSaleReturnKind.DELIVERED_RETURN if delivered else DirectSaleReturnKind.POST_INVOICE_CANCEL,
        "default_condition": "NEEDS_INSPECTION",
        "default_refund_mode": "CUSTOMER_CREDIT",
        "receipt_summary": {
            "active_receipt_count": active_receipt_count,
            "void_receipt_count": void_receipt_count,
            "active_receipt_total": str(active_receipt_total),
            "void_receipt_total": str(void_receipt_total),
            "posted_receipt_count": posted_receipt_count,
            "posted_receipt_total": str(active_receipt_total),
            "received_total": str(active_receipt_total),
            "balance_total": str(outstanding_balance),
        },
        "active_receipt_total": str(active_receipt_total),
        "void_receipt_total": str(void_receipt_total),
        "outstanding_balance": str(outstanding_balance),
        "replacement_stock_available": replacement_stock_available,
        "stock_blocking_reasons": stock_blocking_reasons,
        "allowed_actions": allowed_actions,
        "workflow_steps": workflow_steps,
        "can_create_return": can_create_return,
        "can_create_exchange": can_create_exchange,
        "blocking_reasons": blocking_reasons,
        "stock_setup_required": stock_setup_required,
        "stock_setup_message": (
            "Create INSPECTION, DAMAGED, and SERVICE stock locations before processing returns."
            if stock_setup_required
            else ""
        ),
        "missing_location_types": missing_location_types,
        "can_finalize_reversal": can_finalize_reversal,
        "finalize_blocking_reasons": finalize_blocking_reasons,
        "is_operationally_active": is_operationally_active,
        "is_collectible": is_collectible,
        "is_dashboard_visible": is_dashboard_visible,
    }


@transaction.atomic
def cancel_direct_sale_before_invoice(*, direct_sale_id: int, reason: str, performed_by):
    reason = _require_reason(reason)
    DirectSale.objects.select_for_update(of=("self",)).get(pk=direct_sale_id)
    sale = DirectSale.objects.prefetch_related("billing_invoices", "receipts").get(pk=direct_sale_id)

    posted_invoice_exists = sale.billing_invoices.filter(status=BillingDocumentStatus.POSTED).exists()
    if posted_invoice_exists:
        raise ValueError("Direct sale cannot be cancelled after posted invoice. Use return/credit flow.")

    if sale.status == DirectSaleStatus.CANCELLED:
        return sale, False

    if sale.receipts.filter(status=BillingDocumentStatus.POSTED).exists():
        raise ValueError("Posted receipt exists. Use customer credit/refund flow; silent cancellation is blocked.")

    sale.status = DirectSaleStatus.CANCELLED
    sale.notes = f"{(sale.notes or '').strip()}\nCancellation reason: {reason}".strip()
    sale.save(update_fields=["status", "notes", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=sale,
        performed_by=performed_by,
        metadata={"event": "DIRECT_SALE_CANCELLED_BEFORE_INVOICE", "direct_sale_id": sale.id, "reason": reason},
    )
    return sale, True


@transaction.atomic
def open_direct_sale_cancellation_case(*, direct_sale_id: int, reason: str, performed_by, stock_location_id: int | None = None):
    reason = _require_reason(reason)
    sale = DirectSale.objects.select_for_update(of=("self",)).prefetch_related("billing_invoices", "lines").get(pk=direct_sale_id)
    posted_invoice = sale.billing_invoices.filter(status=BillingDocumentStatus.POSTED).order_by("-invoice_date", "-id").first()
    delivered = bool(sale.delivered_at) or sale.status == DirectSaleStatus.DELIVERED
    if posted_invoice is None:
        sale, updated = cancel_direct_sale_before_invoice(direct_sale_id=direct_sale_id, reason=reason, performed_by=performed_by)
        return {"workflow": "PRE_INVOICE_CANCEL", "updated": updated, "direct_sale_id": sale.id, "status": sale.status}
    if delivered:
        return {
            "workflow": "RETURN_OR_EXCHANGE_REQUIRED",
            "updated": False,
            "direct_sale_id": sale.id,
            "status": sale.status,
            "blocking_reasons": ["DELIVERY_RETURN_REQUIRED"],
            "allowed_actions": ["RETURN_PRODUCT", "EXCHANGE_PRODUCT"],
        }

    return_kind = DirectSaleReturnKind.DELIVERED_RETURN if delivered else DirectSaleReturnKind.POST_INVOICE_CANCEL
    lines = [{"direct_sale_line_id": line.id, "quantity": line.quantity} for line in sale.lines.all()]
    ds_return = create_direct_sale_return(
        direct_sale_id=direct_sale_id,
        lines=lines,
        reason=reason,
        performed_by=performed_by,
        return_kind=return_kind,
        stock_destination=ReturnStockDestination.INSPECTION,
        stock_location_id=stock_location_id,
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=ds_return,
        performed_by=performed_by,
        metadata={
            "event": "DIRECT_SALE_CANCELLATION_CASE_OPENED",
            "direct_sale_id": direct_sale_id,
            "return_id": ds_return.id,
            "return_kind": return_kind,
        },
    )
    return {
        "workflow": return_kind,
        "updated": True,
        "direct_sale_id": sale.id,
        "direct_sale_return_id": ds_return.id,
        "return_no": ds_return.return_no,
        "status": ds_return.status,
    }


@transaction.atomic
def create_direct_sale_return(
    *,
    direct_sale_id: int,
    lines: list[dict],
    reason: str,
    performed_by,
    return_kind: str = DirectSaleReturnKind.DELIVERED_RETURN,
    stock_destination: str = ReturnStockDestination.INSPECTION,
    stock_location_id: int | None = None,
    confirm_sellable_destination: bool = False,
):
    reason = _require_reason(reason)
    return_kind = _clean_return_kind(return_kind)
    stock_destination = _clean_stock_destination(stock_destination)
    if stock_destination == ReturnStockDestination.SELLABLE and not confirm_sellable_destination:
        raise ValueError("SELLABLE return destination requires explicit admin confirmation.")
    if return_kind == DirectSaleReturnKind.DAMAGED_RETURN and stock_destination == ReturnStockDestination.SELLABLE:
        raise ValueError("Damaged returns cannot be sent directly to sellable stock.")
    if (
        return_kind != DirectSaleReturnKind.POST_INVOICE_CANCEL
        and stock_destination != ReturnStockDestination.SELLABLE
        and not stock_location_id
    ):
        raise ValueError(f"{stock_destination.title()} returns require stock_location_id.")
    if not lines:
        raise DjangoValidationError({"lines": ["At least one return line is required."]})

    sale = DirectSale.objects.select_for_update(of=("self",)).prefetch_related("lines", "billing_invoices").get(pk=direct_sale_id)
    destination_catalog = _return_destination_catalog()
    if stock_destination != ReturnStockDestination.SELLABLE and not destination_catalog.get(stock_destination):
        raise ValueError(
            f"{stock_destination.title()} stock setup is missing. Create a matching stock location first."
        )
    latest_invoice = sale.billing_invoices.order_by("-invoice_date", "-id").first()
    posted_invoice = sale.billing_invoices.filter(status=BillingDocumentStatus.POSTED).order_by("-invoice_date", "-id").first()
    if latest_invoice is None:
        raise DjangoValidationError({"detail": ["Original invoice context is required for direct sale return."]})
    if return_kind == DirectSaleReturnKind.POST_INVOICE_CANCEL and posted_invoice is None:
        raise DjangoValidationError({"detail": ["Posted original invoice is required for post-invoice cancellation flow."]})

    if sale.status not in {DirectSaleStatus.INVOICED, DirectSaleStatus.DELIVERED}:
        raise ValueError("Return is allowed only for delivered/invoiced direct sales.")
    if return_kind != DirectSaleReturnKind.POST_INVOICE_CANCEL and stock_destination != ReturnStockDestination.SELLABLE:
        _stock_location_for_destination(destination=stock_destination, stock_location_id=stock_location_id)

    invoice_status = (getattr(latest_invoice, "status", "") or "").strip().upper()
    if return_kind in {
        DirectSaleReturnKind.DELIVERED_RETURN,
        DirectSaleReturnKind.DELIVERED_EXCHANGE,
        DirectSaleReturnKind.DAMAGED_RETURN,
        DirectSaleReturnKind.PARTIAL_RETURN,
    } and not (bool(sale.delivered_at) or sale.status == DirectSaleStatus.DELIVERED):
        raise DjangoValidationError({"detail": ["Delivered return/exchange requires delivered sale evidence."]})

    by_line = {line.id: line for line in sale.lines.all()}
    seq = _fy_sequence("BILL_RET", "RET", timezone.localdate())
    ds_return = DirectSaleReturn.objects.create(
        return_no=_issue_series_number(seq, prefix_fallback=f"RET-{sale.id}"),
        direct_sale=sale,
        original_invoice=posted_invoice or latest_invoice,
        customer=sale.customer,
        return_kind=return_kind,
        stock_destination=stock_destination,
        stock_location_id=stock_location_id,
        reason=reason,
        stock_effect=True,
        metadata={
            "invoice_status_at_return": invoice_status,
            "financial_mode": "STANDARD_REVERSAL",
        },
    )

    subtotal = Decimal("0.00")
    tax_total = Decimal("0.00")
    grand_total = Decimal("0.00")

    for row in lines:
        sale_line_id = int(row.get("direct_sale_line_id") or 0)
        quantity = _qty(row.get("quantity"))
        if sale_line_id <= 0 or quantity <= Decimal("0.000"):
            raise DjangoValidationError({"lines": ["Each return line needs valid direct_sale_line_id and quantity."]})
        sale_line = by_line.get(sale_line_id)
        if sale_line is None:
            raise DjangoValidationError({"lines": [f"Direct sale line {sale_line_id} not found in this sale."]})

        sold_qty = _qty(sale_line.quantity)
        returned_qty = _reserved_return_quantity(sale_line)
        sale_out_qty = get_sale_out_quantity(sale_line)
        allowed_qty = get_returnable_quantity(sale_line)
        if return_kind == DirectSaleReturnKind.POST_INVOICE_CANCEL and sale_out_qty <= Decimal("0.000"):
            allowed_qty = max(Decimal("0.000"), sold_qty - returned_qty)
        if return_kind in {
            DirectSaleReturnKind.DELIVERED_RETURN,
            DirectSaleReturnKind.DELIVERED_EXCHANGE,
            DirectSaleReturnKind.DAMAGED_RETURN,
            DirectSaleReturnKind.PARTIAL_RETURN,
        } and sale_out_qty <= Decimal("0.000"):
            raise DjangoValidationError(
                {"lines": [f"Delivered return requires SALE_OUT evidence for line {sale_line.id}."]}
            )
        if quantity > allowed_qty:
            raise DjangoValidationError(
                {"lines": [f"Return quantity exceeds returnable quantity for line {sale_line.id}. Remaining: {allowed_qty}."]}
            )

        unit_price = _money(sale_line.unit_price)
        taxable = _money((unit_price * quantity).quantize(Decimal("0.01")))
        gst_rate = Decimal(str(sale_line.gst_rate or "0.00"))
        tax_amount = _money((taxable * gst_rate / Decimal("100")).quantize(Decimal("0.01")))
        line_total = _money(taxable + tax_amount)

        DirectSaleReturnLine.objects.create(
            direct_sale_return=ds_return,
            direct_sale_line=sale_line,
            inventory_item=sale_line.inventory_item,
            description=sale_line.description,
            quantity=quantity,
            unit_price=unit_price,
            taxable_value=taxable,
            tax_amount=tax_amount,
            line_total=line_total,
        )
        subtotal += taxable
        tax_total += tax_amount
        grand_total += line_total

    ds_return.subtotal = _money(subtotal)
    ds_return.tax_total = _money(tax_total)
    ds_return.grand_total = _money(grand_total)
    active_receipt_total = _money(
        sale.receipts.filter(status=BillingDocumentStatus.POSTED).aggregate(total=Sum("amount")).get("total")
    )
    if (
        return_kind
        in {
            DirectSaleReturnKind.DELIVERED_RETURN,
            DirectSaleReturnKind.DELIVERED_EXCHANGE,
            DirectSaleReturnKind.DAMAGED_RETURN,
            DirectSaleReturnKind.PARTIAL_RETURN,
        }
        and active_receipt_total <= Decimal("0.00")
        and invoice_status in {BillingDocumentStatus.VOID, BillingDocumentStatus.CANCELLED}
    ):
        metadata = dict(ds_return.metadata or {})
        metadata["financial_mode"] = "NO_ACTIVE_CUSTOMER_VALUE"
        ds_return.metadata = metadata
    ds_return.save(update_fields=["subtotal", "tax_total", "grand_total", "metadata", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=ds_return,
        performed_by=performed_by,
        metadata={"event": "DIRECT_SALE_RETURN_CREATED", "direct_sale_return_id": ds_return.id, "direct_sale_id": sale.id},
    )
    return ds_return


@transaction.atomic
def approve_direct_sale_return(*, return_id: int, performed_by):
    ret = DirectSaleReturn.objects.select_for_update(of=("self",)).get(pk=return_id)
    if ret.status == DirectSaleReturnStatus.APPROVED:
        return ret, False
    if ret.status != DirectSaleReturnStatus.DRAFT:
        raise ValueError("Only draft return can be approved.")
    ret.status = DirectSaleReturnStatus.APPROVED
    ret.approved_by = performed_by
    ret.approved_at = timezone.now()
    ret.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    return ret, True


@transaction.atomic
def post_direct_sale_return(*, return_id: int, posted_by):
    ret = (
        DirectSaleReturn.objects.select_for_update(of=("self",))
        .select_related("original_invoice", "direct_sale")
        .prefetch_related("lines")
        .get(pk=return_id)
    )
    if ret.status == DirectSaleReturnStatus.POSTED:
        return ret, False
    if ret.status != DirectSaleReturnStatus.APPROVED:
        raise ValueError("Only approved return can be posted.")

    metadata = dict(ret.metadata or {})
    financial_mode = str(metadata.get("financial_mode") or "STANDARD_REVERSAL").strip().upper()
    note = None
    if financial_mode != "NO_ACTIVE_CUSTOMER_VALUE":
        note = BillingCreditNote.objects.create(
            note_no=None,
            note_date=timezone.localdate(),
            doc_series=_ensure_credit_sequence(timezone.localdate()),
            original_invoice=ret.original_invoice,
            reason=ret.reason,
            status=BillingDocumentStatus.APPROVED,
            taxable_adjustment=ret.subtotal,
            tax_adjustment=ret.tax_total,
            total_adjustment=ret.grand_total,
            stock_effect=False,
        )
        for line in ret.lines.all():
            BillingCreditNoteLine.objects.create(
                credit_note=note,
                inventory_item=line.inventory_item,
                description=line.description,
                quantity=line.quantity,
                taxable_value=line.taxable_value,
                tax_amount=line.tax_amount,
                line_total=line.line_total,
            )
        note, _ = post_billing_credit_note(credit_note_id=note.id, posted_by=posted_by)
    stock_result = _post_direct_sale_return_stock(ret=ret, posted_by=posted_by) if ret.stock_effect else {"created_count": 0, "existing_count": 0, "skipped_count": 0}
    exchange_stock_result = (
        post_exchange_replacement_stock_movement(ret=ret, posted_by=posted_by)
        if ret.return_kind == DirectSaleReturnKind.DELIVERED_EXCHANGE
        else {"created_count": 0, "existing_count": 0}
    )
    ret.credit_note = note
    ret.status = DirectSaleReturnStatus.POSTED
    ret.posted_by = posted_by
    ret.posted_at = timezone.now()
    metadata["stock_created_count"] = stock_result["created_count"]
    metadata["stock_existing_count"] = stock_result["existing_count"]
    metadata["stock_skipped_count"] = stock_result.get("skipped_count", 0)
    metadata["exchange_replacement_stock_created_count"] = exchange_stock_result["created_count"]
    metadata["exchange_replacement_stock_existing_count"] = exchange_stock_result["existing_count"]
    ret.metadata = metadata
    ret.save(update_fields=["credit_note", "status", "posted_by", "posted_at", "metadata", "updated_at"])

    credit_amount = ret.exchange_customer_credit if ret.return_kind == DirectSaleReturnKind.DELIVERED_EXCHANGE else ret.grand_total
    if note and _money(credit_amount) > Decimal("0.00"):
        create_customer_credit_from_credit_note(
            customer_id=ret.customer_id,
            credit_note_id=note.id,
            direct_sale_return_id=ret.id,
            amount=credit_amount,
            performed_by=posted_by,
        )

    return ret, True


@transaction.atomic
def create_direct_sale_exchange(
    *,
    direct_sale_id: int,
    returned_lines: list[dict],
    replacement_lines: list[dict],
    reason: str,
    performed_by,
    stock_destination: str = ReturnStockDestination.INSPECTION,
    stock_location_id: int | None = None,
    confirm_sellable_destination: bool = False,
):
    reason = _require_reason(reason)
    if not replacement_lines:
        raise ValueError("At least one replacement line is required.")
    ret = create_direct_sale_return(
        direct_sale_id=direct_sale_id,
        lines=returned_lines,
        reason=reason,
        performed_by=performed_by,
        return_kind=DirectSaleReturnKind.DELIVERED_EXCHANGE,
        stock_destination=stock_destination,
        stock_location_id=stock_location_id,
        confirm_sellable_destination=confirm_sellable_destination,
    )
    replacement_total = Decimal("0.00")
    replacement_summary = []
    for row in replacement_lines:
        item_id = int(row.get("inventory_item_id") or 0)
        qty = _qty(row.get("quantity"))
        unit_price = _money(row.get("unit_price"))
        if item_id <= 0 or qty <= Decimal("0.000") or unit_price < Decimal("0.00"):
            raise ValueError("Replacement lines require inventory_item_id, quantity, and unit_price.")
        item = InventoryItem.objects.select_related("product", "default_stock_location").get(pk=item_id)
        replacement_location_id = row.get("stock_location_id")
        replacement_location = (
            StockLocation.objects.get(pk=int(replacement_location_id))
            if replacement_location_id
            else item.default_stock_location
        )
        if replacement_location is None:
            raise ValueError("Replacement stock location is required for exchange.")
        available = _location_quantity(inventory_item=item, stock_location=replacement_location)
        if available < qty:
            raise ValueError(
                f"Insufficient stock for replacement item {item.sku or item.id} at {replacement_location.name}. Available: {available}, Requested: {qty}."
            )
        line_total = _money(qty * unit_price)
        replacement_total += line_total
        replacement_summary.append(
            {
                "inventory_item_id": item.id,
                "product_id": item.product_id,
                "description": str(row.get("description") or item.product.name),
                "quantity": str(qty),
                "unit_price": str(unit_price),
                "line_total": str(line_total),
                "stock_location_id": replacement_location.id,
                "stock_location_name": replacement_location.name,
            }
        )

    return_total = _money(ret.grand_total)
    amount_due = max(Decimal("0.00"), _money(replacement_total - return_total))
    customer_credit = max(Decimal("0.00"), _money(return_total - replacement_total))
    metadata = dict(ret.metadata or {})
    metadata["exchange_replacement_lines"] = replacement_summary
    metadata["exchange_replacement_total"] = str(_money(replacement_total))
    metadata["event"] = "DIRECT_SALE_EXCHANGE_CREATED"
    ret.exchange_amount_due = amount_due
    ret.exchange_customer_credit = customer_credit
    ret.metadata = metadata
    ret.save(update_fields=["exchange_amount_due", "exchange_customer_credit", "metadata", "updated_at"])
    if customer_credit > Decimal("0.00"):
        # Actual customer credit is posted with the credit note when the return is approved and posted.
        metadata["pending_customer_credit_after_post"] = str(customer_credit)
        ret.metadata = metadata
        ret.save(update_fields=["metadata", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=ret,
        performed_by=performed_by,
        metadata={
            "event": "DIRECT_SALE_EXCHANGE_REQUESTED",
            "direct_sale_id": direct_sale_id,
            "return_id": ret.id,
            "replacement_total": str(_money(replacement_total)),
            "amount_due": str(amount_due),
            "customer_credit": str(customer_credit),
        },
    )
    return ret


def void_receipt_with_reason(*, receipt_id: int, reason: str, performed_by):
    reason = _require_reason(reason)
    receipt, updated = void_receipt_document(receipt_id=receipt_id, performed_by=performed_by, reason=reason)
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=receipt,
        performed_by=performed_by,
        metadata={"event": "RECEIPT_VOIDED_WITH_REASON", "receipt_id": receipt.id, "reason": reason},
    )
    return receipt, updated


@transaction.atomic
def create_customer_credit_from_credit_note(*, customer_id: int, credit_note_id: int, direct_sale_return_id: int | None, amount, performed_by):
    credit_note = BillingCreditNote.objects.get(pk=credit_note_id)
    entry = CustomerCreditLedger.objects.create(
        customer_id=customer_id,
        direct_sale_return_id=direct_sale_return_id,
        credit_note=credit_note,
        entry_date=timezone.localdate(),
        reference_no=credit_note.note_no or f"CN-{credit_note.id}",
        credit_amount=_money(amount),
        debit_amount=Decimal("0.00"),
        notes="Customer credit from direct sale return credit note.",
        posted_by=performed_by,
    )
    return entry


@transaction.atomic
def create_customer_refund(*, customer_id: int, amount, method: str, finance_account_id: int, reason: str, direct_sale_return_id: int | None = None, performed_by=None):
    reason = _require_reason(reason)
    amount = _money(amount)
    if amount <= Decimal("0.00"):
        raise ValueError("Refund amount must be greater than zero.")

    balance = _customer_credit_balance(customer_id)
    if amount > balance:
        raise ValueError("Refund amount cannot exceed available customer credit.")

    if method not in {RefundMethod.CASH_REFUND, RefundMethod.UPI_REFUND, RefundMethod.BANK_REFUND}:
        raise ValueError("Invalid refund method.")

    seq = _fy_sequence("BILL_RFND", "RFND", timezone.localdate())
    refund = CustomerRefund.objects.create(
        refund_no=_issue_series_number(seq, prefix_fallback=f"RFND-{customer_id}"),
        customer_id=customer_id,
        direct_sale_return_id=direct_sale_return_id,
        amount=amount,
        method=method,
        finance_account_id=finance_account_id,
        reason=reason,
        status=CustomerRefundStatus.DRAFT,
    )
    return refund


@transaction.atomic
def approve_customer_refund(*, refund_id: int, performed_by):
    refund = CustomerRefund.objects.select_for_update(of=("self",)).get(pk=refund_id)
    if refund.status == CustomerRefundStatus.APPROVED:
        return refund, False
    if refund.status != CustomerRefundStatus.DRAFT:
        raise ValueError("Only draft refund can be approved.")
    refund.status = CustomerRefundStatus.APPROVED
    refund.approved_by = performed_by
    refund.approved_at = timezone.now()
    refund.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    return refund, True


@transaction.atomic
def pay_customer_refund(*, refund_id: int, paid_by):
    refund = CustomerRefund.objects.select_for_update(of=("self",)).select_related("finance_account", "customer").get(pk=refund_id)
    if refund.status == CustomerRefundStatus.PAID:
        return refund, False
    if refund.status != CustomerRefundStatus.APPROVED:
        raise ValueError("Refund must be approved before payment.")

    balance = _customer_credit_balance(refund.customer_id)
    if refund.amount > balance:
        raise ValueError("Refund exceeds current customer credit balance.")

    accounts = ensure_phase3_system_accounts()
    payable_account = accounts["CUSTOMER_DEPOSITS"]

    posted_journal, _ = post_bridge_entry(
        source_instance=refund,
        purpose="CUSTOMER_REFUND",
        entry_date=timezone.localdate(),
        memo=f"Customer refund {refund.refund_no}",
        lines=[
            {
                "chart_account": payable_account,
                "description": refund.refund_no,
                "debit_amount": refund.amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": refund.finance_account.chart_account,
                "description": refund.refund_no,
                "debit_amount": Decimal("0.00"),
                "credit_amount": refund.amount,
            },
        ],
        voucher_type="CUSTOMER_REFUND",
        source_type="CUSTOMER_REFUND",
        source_reference=refund.refund_no,
        source_document_no=refund.refund_no,
        source_event_date=timezone.localdate(),
        trace_metadata={"customer_id": refund.customer_id, "refund_id": refund.id, "method": refund.method},
        posted_by=paid_by,
    )

    CustomerCreditLedger.objects.create(
        customer=refund.customer,
        refund=refund,
        entry_date=timezone.localdate(),
        reference_no=refund.refund_no,
        credit_amount=Decimal("0.00"),
        debit_amount=refund.amount,
        notes="Customer refund payout.",
        posted_by=paid_by,
    )

    refund.status = CustomerRefundStatus.PAID
    refund.paid_by = paid_by
    refund.paid_at = timezone.now()
    refund.posted_journal_entry = posted_journal
    refund.save(update_fields=["status", "paid_by", "paid_at", "posted_journal_entry", "updated_at"])
    return refund, True


@transaction.atomic
def create_purchase_return(*, purchase_bill_id: int, lines: list[dict], reason: str, performed_by, stock_location_id: int | None = None):
    reason = _require_reason(reason)
    if not lines:
        raise ValueError("At least one purchase return line is required.")

    bill = PurchaseBill.objects.select_for_update(of=("self",)).prefetch_related("lines").get(pk=purchase_bill_id)
    if bill.status != PurchaseBillStatus.POSTED:
        raise ValueError("Purchase return requires posted purchase bill.")

    by_line = {line.id: line for line in bill.lines.all()}
    returned_by_bill_line: dict[int, Decimal] = defaultdict(lambda: Decimal("0.000"))
    existing = PurchaseReturnLine.objects.filter(
        purchase_bill_line_id__in=list(by_line.keys()),
        purchase_return__status=PurchaseReturnStatus.POSTED,
    ).values("purchase_bill_line_id").annotate(total=Sum("quantity"))
    for row in existing:
        returned_by_bill_line[int(row["purchase_bill_line_id"])] = _qty(row["total"])

    seq = _fy_sequence("BILL_PR", "PR", timezone.localdate())
    purchase_return = PurchaseReturn.objects.create(
        return_no=_issue_series_number(seq, prefix_fallback=f"PR-{bill.id}"),
        purchase_bill=bill,
        vendor=bill.vendor,
        reason=reason,
        metadata={"stock_location_id": stock_location_id or bill.stock_location_id},
    )

    subtotal = Decimal("0.00")
    tax_total = Decimal("0.00")
    grand_total = Decimal("0.00")
    for row in lines:
        pb_line_id = int(row.get("purchase_bill_line_id") or 0)
        quantity = _qty(row.get("quantity"))
        if pb_line_id <= 0 or quantity <= Decimal("0.000"):
            raise ValueError("Each line needs purchase_bill_line_id and positive quantity.")
        pb_line = by_line.get(pb_line_id)
        if pb_line is None:
            raise ValueError(f"Purchase bill line {pb_line_id} not found.")
        sold = _qty(pb_line.quantity)
        already = returned_by_bill_line[pb_line.id]
        remaining = sold - already
        if quantity > remaining:
            raise ValueError(f"Return quantity exceeds available purchased quantity for line {pb_line.id}. Remaining: {remaining}.")

        taxable_value = _money((_qty(quantity) * _money(pb_line.unit_cost)).quantize(Decimal("0.01")))
        tax_amount = _money((taxable_value * (Decimal("100") * _money(pb_line.tax_amount) / (_money(pb_line.taxable_value) if _money(pb_line.taxable_value) > Decimal("0.00") else Decimal("100"))) / Decimal("100")).quantize(Decimal("0.01"))) if _money(pb_line.tax_amount) > Decimal("0.00") else Decimal("0.00")
        line_total = _money(taxable_value + tax_amount)
        PurchaseReturnLine.objects.create(
            purchase_return=purchase_return,
            purchase_bill_line=pb_line,
            inventory_item=pb_line.inventory_item,
            description=pb_line.description,
            quantity=quantity,
            unit_cost=pb_line.unit_cost,
            taxable_value=taxable_value,
            tax_amount=tax_amount,
            line_total=line_total,
        )
        subtotal += taxable_value
        tax_total += tax_amount
        grand_total += line_total

    purchase_return.subtotal = _money(subtotal)
    purchase_return.tax_total = _money(tax_total)
    purchase_return.grand_total = _money(grand_total)
    purchase_return.save(update_fields=["subtotal", "tax_total", "grand_total", "updated_at"])
    return purchase_return


@transaction.atomic
def post_purchase_return(*, purchase_return_id: int, posted_by):
    purchase_return = (
        PurchaseReturn.objects.select_for_update(of=("self",))
        .select_related("purchase_bill", "purchase_bill__finance_account")
        .prefetch_related("lines", "lines__inventory_item")
        .get(pk=purchase_return_id)
    )
    if purchase_return.status == PurchaseReturnStatus.POSTED:
        return purchase_return, False
    if purchase_return.status != PurchaseReturnStatus.DRAFT:
        raise ValueError("Only draft purchase return can be posted.")

    stock_location_id = (purchase_return.metadata or {}).get("stock_location_id") or purchase_return.purchase_bill.stock_location_id
    stock_location = StockLocation.objects.filter(pk=stock_location_id).first() if stock_location_id else None
    if stock_location is None:
        raise ValueError("Purchase return requires a valid source stock location.")
    for line in purchase_return.lines.all():
        available = _location_quantity(inventory_item=line.inventory_item, stock_location=stock_location)
        if available < line.quantity:
            raise ValueError(
                f"Insufficient stock at {stock_location.name} for purchase return line {line.id}. Available: {available}, Requested: {line.quantity}."
            )
        post_movement(
            inventory_item=line.inventory_item,
            movement_type=StockMovementType.PURCHASE_RETURN_OUT,
            quantity=line.quantity,
            movement_date=purchase_return.return_date,
            stock_location=stock_location,
            reference_model="PurchaseReturnLine",
            reference_id=f"{purchase_return.id}:{line.id}",
            posted_by=posted_by,
            notes=f"Purchase return {purchase_return.return_no} from {stock_location.name}",
        )

    accounts = ensure_phase3_system_accounts()
    payable_account = accounts["ACCOUNTS_PAYABLE"]
    inventory_account = accounts["INVENTORY_ASSET"]
    posted_journal, _ = post_bridge_entry(
        source_instance=purchase_return,
        purpose="PURCHASE_RETURN",
        entry_date=purchase_return.return_date,
        memo=f"Purchase return {purchase_return.return_no}",
        lines=[
            {
                "chart_account": payable_account,
                "description": purchase_return.return_no,
                "debit_amount": purchase_return.grand_total,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": inventory_account,
                "description": purchase_return.return_no,
                "debit_amount": Decimal("0.00"),
                "credit_amount": purchase_return.grand_total,
            },
        ],
        voucher_type="PURCHASE_RETURN",
        source_type="PURCHASE_RETURN",
        source_reference=purchase_return.return_no,
        source_document_no=purchase_return.return_no,
        source_event_date=purchase_return.return_date,
        trace_metadata={"purchase_return_id": purchase_return.id, "purchase_bill_id": purchase_return.purchase_bill_id},
        posted_by=posted_by,
    )

    purchase_return.status = PurchaseReturnStatus.POSTED
    purchase_return.posted_journal_entry = posted_journal
    purchase_return.posted_by = posted_by
    purchase_return.posted_at = timezone.now()
    purchase_return.save(update_fields=["status", "posted_journal_entry", "posted_by", "posted_at", "updated_at"])
    return purchase_return, True
