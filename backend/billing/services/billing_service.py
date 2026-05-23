from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.gst_document_posting_service import ensure_document_sequence, financial_year_for
from accounting.services.journal_posting_service import _log_accounting_event
from accounting.services.non_gst_document_service import build_non_gst_snapshot
from accounting.services.tax_guard_service import (
    current_tax_mode,
    normalize_non_gst_breakdown,
    resolve_operational_tax_mode,
)
from accounting.services.tax_profile_service import build_product_tax_snapshot, build_tax_profile_snapshot
from accounting.services.finance_account_collection_guard import (
    assert_finance_account_allowed_for_payment_collection,
)
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from billing.models import (
    BillingChannel,
    BillingCreditNote,
    BillingDebitNote,
    BillingDocumentStatus,
    BillingInvoice,
    BillingInvoiceLine,
    BillingInvoiceType,
    BillingSourceType,
    DirectSale,
    DirectSaleLine,
    DirectSaleStatus,
    ReceiptDocument,
    ReceiptType,
)
from inventory.models import InventoryItem
from inventory.services.purchase_need_service import (
    StockNeedSignal,
    direct_sale_purchase_need_source_key,
    upsert_direct_sale_purchase_need,
)
from inventory.services.stock_service import (
    post_credit_note_stock_movements,
    post_debit_note_stock_movements,
    post_invoice_stock_movements,
)
from subscriptions.models import AuditLog, FulfillmentStatus, Payment
from subscriptions.services.audit_service import log_audit
from reconciliation.models import FinancialSourceLifecycleEvent
from reconciliation.services.financial_source_lifecycle_event_service import create_lifecycle_event
from reconciliation.services.financial_source_lifecycle_event_service import (
    create_lifecycle_event_for_receipt_invalidation,
)


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def recalculate_invoice_settlement(invoice: BillingInvoice) -> BillingInvoice:
    active_receipt_total = _money(
        invoice.receipts.filter(status=BillingDocumentStatus.POSTED).aggregate(total=Sum("amount"))["total"]
    )
    invoice.received_total = active_receipt_total
    invoice.balance_total = _money(invoice.grand_total) - active_receipt_total
    invoice.save(update_fields=["received_total", "balance_total", "updated_at"])
    return invoice


def recalculate_direct_sale_settlement(sale: DirectSale) -> DirectSale:
    active_receipt_total = _money(
        sale.receipts.filter(
            receipt_type=ReceiptType.RETAIL_RECEIPT,
            status=BillingDocumentStatus.POSTED,
        ).aggregate(total=Sum("amount"))["total"]
    )
    sale.received_total = active_receipt_total
    sale.balance_total = _money(sale.grand_total) - active_receipt_total
    sale.save(update_fields=["received_total", "balance_total", "updated_at"])
    return sale


def _issue_series_number(sequence, *, prefix_fallback: str) -> str:
    from accounting.services.gst_document_posting_service import _issue_document_number

    number = _issue_document_number(sequence)
    return number if number else prefix_fallback


def _ensure_receipt_sequence(reference_date):
    fy = financial_year_for(reference_date)
    return ensure_document_sequence(
        series_code="BILL_RCT",
        financial_year=fy,
        prefix=f"RCT-{fy}",
        padding=5,
    )


def _ensure_invoice_sequence(reference_date):
    fy = financial_year_for(reference_date)
    return ensure_document_sequence(
        series_code="BILL_INV",
        financial_year=fy,
        prefix=f"INV-{fy}",
        padding=5,
    )


def _ensure_credit_sequence(reference_date):
    fy = financial_year_for(reference_date)
    return ensure_document_sequence(
        series_code="BILL_CN",
        financial_year=fy,
        prefix=f"CN-{fy}",
        padding=5,
    )


def _ensure_debit_sequence(reference_date):
    fy = financial_year_for(reference_date)
    return ensure_document_sequence(
        series_code="BILL_DN",
        financial_year=fy,
        prefix=f"DN-{fy}",
        padding=5,
    )


def _ensure_direct_sale_sequence(reference_date):
    fy = financial_year_for(reference_date)
    return ensure_document_sequence(
        series_code="DIRSALE",
        financial_year=fy,
        prefix=f"SALE-{fy}",
        padding=5,
    )


def _direct_sale_source_reference(sale: DirectSale) -> str:
    return sale.sale_no or f"SALE-{sale.id}"


def _resolve_line_inventory_item(*, product, inventory_item):
    if inventory_item is not None:
        return inventory_item
    profile = getattr(product, "inventory_profile", None)
    if profile is not None:
        return profile
    return InventoryItem.objects.filter(product=product).first()


def _assert_products_not_in_active_rent_lease_possession(*, line_payloads: list[dict]) -> None:
    from subscriptions.models import PlanType, PossessionStatus, ProductPossession

    product_ids = {
        int(payload["product"].id)
        for payload in line_payloads
        if payload.get("product") is not None and getattr(payload["product"], "id", None) is not None
    }
    if not product_ids:
        return

    blocked_rows = list(
        ProductPossession.objects.select_related("product", "subscription")
        .filter(
            product_id__in=product_ids,
            subscription__plan_type__in=[PlanType.RENT, PlanType.LEASE],
        )
        .exclude(status=PossessionStatus.CLOSED)
        .values_list(
            "product__product_code",
            "product__name",
            "subscription__id",
            "status",
        )
    )
    if not blocked_rows:
        return

    refs = []
    for product_code, product_name, subscription_id, status in blocked_rows:
        code = (product_code or "").strip() or f"PRODUCT#{subscription_id}"
        name = (product_name or "").strip()
        label = f"{code} ({name})" if name else code
        refs.append(f"{label} -> SUB-{subscription_id} [{status}]")
    refs = sorted(set(refs))

    raise ValueError(
        "Direct sale is blocked for assets under active rent/lease possession: "
        + "; ".join(refs)
    )


DIRECT_SALE_LINE_MODEL_FIELDS = {
    "product",
    "inventory_item",
    "description",
    "quantity",
    "unit_price",
    "discount_amount",
    "taxable_value",
    "gst_rate",
    "cgst_amount",
    "sgst_amount",
    "igst_amount",
    "line_total",
    "product_code_snapshot",
    "sku_snapshot",
    "unit_of_measure_snapshot",
    "hsn_sac_code",
}


def _serialize_direct_sale_line_payloads(lines: list[dict]) -> list[dict]:
    payloads: list[dict] = []
    for line in lines:
        product = line["product"]
        inventory_item = _resolve_line_inventory_item(
            product=product,
            inventory_item=line.get("inventory_item"),
        )
        product_code = (getattr(product, "product_code", None) or "").strip().upper()
        inventory_sku = (getattr(inventory_item, "sku", None) or "").strip().upper()
        unit_of_measure = (
            getattr(inventory_item, "unit_of_measure", None)
            or getattr(product, "unit_of_measure", None)
            or "PCS"
        )
        quantity = Decimal(str(line.get("quantity") or "0.000"))
        unit_price = _money(line.get("unit_price") if line.get("unit_price") is not None else product.base_price)
        discount_amount = _money(line.get("discount_amount"))
        taxable_value = _money(
            line.get("taxable_value")
            if line.get("taxable_value") is not None
            else ((quantity * unit_price).quantize(Decimal("0.01")) - discount_amount)
        )
        cgst_amount = _money(line.get("cgst_amount"))
        sgst_amount = _money(line.get("sgst_amount"))
        igst_amount = _money(line.get("igst_amount"))
        payloads.append(
            {
                "product": product,
                "inventory_item": inventory_item,
                "description": (line.get("description") or "").strip(),
                "quantity": quantity,
                "unit_price": unit_price,
                "discount_amount": discount_amount,
                "taxable_value": taxable_value,
                "gst_rate": line.get("gst_rate"),
                "cgst_amount": cgst_amount,
                "sgst_amount": sgst_amount,
                "igst_amount": igst_amount,
                "line_total": line.get("line_total") or taxable_value + cgst_amount + sgst_amount + igst_amount,
                "product_code_snapshot": product_code,
                "sku_snapshot": inventory_sku,
                "unit_of_measure_snapshot": str(unit_of_measure).strip().upper(),
                "hsn_sac_code": (line.get("hsn_sac_code") or "").strip().upper(),
                "_create_purchase_requirement": bool(line.get("create_purchase_requirement")),
                "_requirement_quantity": line.get("requirement_quantity"),
                "_requirement_note": (line.get("requirement_note") or "").strip(),
            }
        )
    return payloads


def _enforce_direct_sale_tax_policy(*, tax_mode: str, line_payloads: list[dict]) -> list[dict]:
    normalized_mode = (tax_mode or "NON_GST").strip().upper()
    if normalized_mode != "NON_GST":
        return line_payloads
    adjusted: list[dict] = []
    for payload in line_payloads:
        adjusted.append(normalize_non_gst_breakdown(line=payload))
    return adjusted


def _rollup_line_totals(line_payloads: list[dict]) -> dict:
    subtotal = Decimal("0.00")
    discount_total = Decimal("0.00")
    taxable_total = Decimal("0.00")
    tax_total = Decimal("0.00")
    grand_total = Decimal("0.00")
    for payload in line_payloads:
        quantity = Decimal(str(payload.get("quantity") or "0"))
        subtotal += _money(payload.get("unit_price")) * quantity
        discount_total += _money(payload.get("discount_amount"))
        taxable_total += _money(payload.get("taxable_value"))
        tax_total += (
            _money(payload.get("cgst_amount"))
            + _money(payload.get("sgst_amount"))
            + _money(payload.get("igst_amount"))
        )
        grand_total += _money(payload.get("line_total"))
    return {
        "subtotal": subtotal.quantize(Decimal("0.01")),
        "discount_total": discount_total.quantize(Decimal("0.01")),
        "taxable_total": taxable_total.quantize(Decimal("0.01")),
        "tax_total": tax_total.quantize(Decimal("0.01")),
        "grand_total": grand_total.quantize(Decimal("0.01")),
    }


def _replace_direct_sale_lines(*, sale: DirectSale, line_payloads: list[dict]):
    sale.lines.all().delete()
    if not line_payloads:
        return
    DirectSaleLine.objects.bulk_create(
        [
            DirectSaleLine(
                direct_sale=sale,
                **{key: payload[key] for key in DIRECT_SALE_LINE_MODEL_FIELDS if key in payload},
            )
            for payload in line_payloads
        ]
    )


def _sync_direct_sale_purchase_needs(*, sale: DirectSale, line_payloads: list[dict], actor):
    from subscriptions.services.operational_notification_service import (
        schedule_direct_sale_stock_requirement_notifications,
    )

    customer_id = sale.customer_id
    for payload in line_payloads:
        inventory_item = payload.get("inventory_item")
        explicit_requirement = bool(payload.get("_create_purchase_requirement"))
        if inventory_item is not None and not inventory_item.stock_tracking_enabled and not explicit_requirement:
            continue

        required_qty = Decimal(str(payload.get("quantity") or "0"))
        explicit_requirement_qty = payload.get("_requirement_quantity")
        if explicit_requirement and explicit_requirement_qty:
            required_qty = Decimal(str(explicit_requirement_qty))
        if required_qty <= Decimal("0"):
            continue
        available_qty = Decimal(str(inventory_item.available_qty())) if inventory_item is not None else Decimal("0.000")
        shortage_qty = required_qty - available_qty
        if shortage_qty <= Decimal("0") and not explicit_requirement:
            continue
        shortage_qty = max(Decimal("0.000"), shortage_qty)
        product = payload.get("product")
        if product is None:
            continue
        product_name = getattr(product, "name", "") if product is not None else ""
        note = payload.get("_requirement_note") or f"Auto-created from direct sale {sale.sale_no or sale.id} for {product_name}"
        source_object_id = direct_sale_purchase_need_source_key(sale_id=int(sale.id), product_id=int(product.id))
        need, created = upsert_direct_sale_purchase_need(
            signal=StockNeedSignal(
                product_id=product.id,
                required_quantity=required_qty,
                available_quantity=available_qty,
                shortage_quantity=shortage_qty,
                source_object_id=source_object_id,
                customer_id=customer_id,
                note=note,
                allow_zero_shortage=explicit_requirement,
            ),
            created_by=actor,
        )
        if need is not None:
            # Additive snapshot hints for future reconciliation (do not affect inventory ledgers).
            snapshot = need.demand_snapshot or {}
            snapshot.update(
                {
                    "inventory_item_id": getattr(inventory_item, "id", None),
                    "sku": (getattr(inventory_item, "sku", None) or "").strip().upper() or None,
                    "product_code": (getattr(product, "product_code", None) or "").strip().upper() or None,
                    "sale_id": int(sale.id),
                    "sale_no": (sale.sale_no or "").strip(),
                    "branch_id": sale.branch_id,
                }
            )
            updates = []
            if need.branch_id is None and sale.branch_id:
                need.branch_id = sale.branch_id
                updates.append("branch")
            need.demand_snapshot = snapshot
            updates.append("demand_snapshot")
            need.save(update_fields=[*updates, "updated_at"])
        if need is not None and created:
            schedule_direct_sale_stock_requirement_notifications(
                purchase_need_id=need.id,
                sale_no=sale.sale_no or "",
                product_name=product_name,
                shortage_quantity=str(shortage_qty),
            )


def _replace_invoice_lines_from_direct_sale(*, invoice: BillingInvoice, line_payloads: list[dict]):
    invoice.lines.all().delete()
    if not line_payloads:
        return
    BillingInvoiceLine.objects.bulk_create(
        [
            BillingInvoiceLine(
                invoice=invoice,
                product=payload["product"],
                inventory_item=payload["inventory_item"],
                description=payload["description"],
                quantity=payload["quantity"],
                unit_price=payload["unit_price"],
                discount_amount=payload["discount_amount"],
                taxable_value=payload["taxable_value"],
                gst_rate=payload["gst_rate"],
                cgst_amount=payload["cgst_amount"],
                sgst_amount=payload["sgst_amount"],
                igst_amount=payload["igst_amount"],
                line_total=payload["line_total"],
                hsn_sac_code=payload["hsn_sac_code"],
                tax_profile_snapshot={
                    "profile": build_tax_profile_snapshot(on_date=invoice.invoice_date),
                    "product": build_product_tax_snapshot(product_id=getattr(payload.get("product"), "id", None)),
                    "line_tax_total": "0.00" if invoice.tax_mode == "NON_GST" else None,
                },
            )
            for payload in line_payloads
        ]
    )


def _sync_direct_sale_invoice(*, sale: DirectSale, line_payloads: list[dict]) -> BillingInvoice:
    draft_invoice = (
        sale.billing_invoices.select_related("doc_series", "customer")
        .prefetch_related("lines")
        .order_by("-id")
        .first()
    )
    if draft_invoice and draft_invoice.status != BillingDocumentStatus.DRAFT:
        raise ValueError("Direct sales with approved or posted billing documents cannot be edited.")

    invoice_defaults = {
        "invoice_date": sale.sale_date,
        "financial_year": sale.financial_year,
        "document_type": BillingInvoiceType.INVOICE,
        "customer": sale.customer,
        "billing_channel": BillingChannel.RETAIL,
        "source_type": BillingSourceType.DIRECT_SALE,
        "source_reference": _direct_sale_source_reference(sale),
        "tax_mode": sale.tax_mode,
        "finance_account": sale.finance_account,
        "subtotal": sale.subtotal,
        "discount_total": sale.discount_total,
        "taxable_total": sale.taxable_total,
        "tax_total": sale.tax_total,
        "grand_total": sale.grand_total,
        "received_total": sale.received_total,
        "balance_total": sale.balance_total,
        "customer_name_snapshot": sale.customer_name_snapshot,
        "customer_phone_snapshot": sale.customer_phone_snapshot,
        "customer_gstin": sale.customer_gstin,
        "tax_profile_snapshot": sale.tax_profile_snapshot
        or build_non_gst_snapshot(
            document_type="COMMERCIAL_INVOICE",
            document_date=sale.sale_date,
            party_type="CUSTOMER",
            party_id=sale.customer_id,
        ),
        "notes": sale.notes,
        "terms": "",
    }
    if draft_invoice is None:
        draft_invoice = BillingInvoice.objects.create(
            direct_sale=sale,
            doc_series=_ensure_invoice_sequence(sale.sale_date),
            **invoice_defaults,
        )
    else:
        for key, value in invoice_defaults.items():
            setattr(draft_invoice, key, value)
        draft_invoice.direct_sale = sale
        draft_invoice.save()

    _replace_invoice_lines_from_direct_sale(
        invoice=draft_invoice,
        line_payloads=line_payloads,
    )
    return draft_invoice


def _build_direct_sale_snapshots(
    *,
    customer,
    customer_name_snapshot,
    customer_phone_snapshot,
    customer_snapshot_email="",
    customer_snapshot_billing_address_line1="",
    customer_snapshot_billing_address_line2="",
    customer_snapshot_city="",
    customer_snapshot_district="",
    customer_snapshot_state="",
    customer_snapshot_pincode="",
    customer_gstin=None,
    customer_snapshot_place_of_supply="",
    delivery_snapshot_address_line1="",
    delivery_snapshot_address_line2="",
    delivery_snapshot_city="",
    delivery_snapshot_district="",
    delivery_snapshot_state="",
    delivery_snapshot_pincode="",
):
    customer_address = (getattr(customer, "address", "") or "").strip() if customer is not None else ""
    customer_city = (getattr(customer, "city", "") or "").strip() if customer is not None else ""
    customer_email = (getattr(getattr(customer, "user", None), "email", "") or "").strip()
    return {
        "customer_name_snapshot": (
            (customer_name_snapshot or "").strip()
            or getattr(customer, "name", "")
        ),
        "customer_phone_snapshot": (
            (customer_phone_snapshot or "").strip()
            or getattr(customer, "phone", "")
        ),
        "customer_snapshot_email": (customer_snapshot_email or "").strip() or customer_email,
        "customer_snapshot_billing_address_line1": (
            (customer_snapshot_billing_address_line1 or "").strip() or customer_address
        ),
        "customer_snapshot_billing_address_line2": (customer_snapshot_billing_address_line2 or "").strip(),
        "customer_snapshot_city": (customer_snapshot_city or "").strip() or customer_city,
        "customer_snapshot_district": (customer_snapshot_district or "").strip(),
        "customer_snapshot_state": (customer_snapshot_state or "").strip(),
        "customer_snapshot_pincode": (customer_snapshot_pincode or "").strip(),
        "customer_gstin": (
            (customer_gstin or "").strip().upper()
            or (getattr(getattr(customer, "user", None), "gstin", "") or "").strip().upper()
            or None
        ),
        "customer_snapshot_place_of_supply": (customer_snapshot_place_of_supply or "").strip(),
        "delivery_snapshot_address_line1": (delivery_snapshot_address_line1 or "").strip(),
        "delivery_snapshot_address_line2": (delivery_snapshot_address_line2 or "").strip(),
        "delivery_snapshot_city": (delivery_snapshot_city or "").strip(),
        "delivery_snapshot_district": (delivery_snapshot_district or "").strip(),
        "delivery_snapshot_state": (delivery_snapshot_state or "").strip(),
        "delivery_snapshot_pincode": (delivery_snapshot_pincode or "").strip(),
    }


def _assert_invoice_delivery_gate(invoice: BillingInvoice):
    if invoice.billing_channel != "EMI" or not invoice.subscription_id:
        return

    fulfillment_status = (invoice.subscription.fulfillment_status or "").strip().upper()
    if fulfillment_status != FulfillmentStatus.DELIVERED:
        raise ValueError(
            "EMI billing documents can only be activated after delivery is marked delivered."
        )


def _assert_direct_sale_delivery_gate(invoice: BillingInvoice):
    """
    Retail direct-sale invoices may be posted before physical delivery.

    Delivery readiness (dispatch, service-desk promotion) is enforced in
    direct_sale_delivery_bridge_service / operational state, not at invoice post time.
    Open PurchaseNeed rows must not block AR posting or receivable creation.
    """
    return


@transaction.atomic
def create_direct_sale(*, payload: dict, created_by):
    lines = payload.pop("lines", [])
    requested_tax_mode = payload.get("tax_mode")
    resolved_tax_mode = resolve_operational_tax_mode(requested_tax_mode=requested_tax_mode)
    payload["tax_mode"] = resolved_tax_mode
    if resolved_tax_mode == "NON_GST":
        payload["tax_calculation_mode"] = "NON_GST"
    line_payloads = _enforce_direct_sale_tax_policy(
        tax_mode=resolved_tax_mode,
        line_payloads=_serialize_direct_sale_line_payloads(lines),
    )
    _assert_products_not_in_active_rent_lease_possession(line_payloads=line_payloads)
    totals = _rollup_line_totals(line_payloads)
    customer = payload.get("customer")
    payload.update(
        _build_direct_sale_snapshots(
            customer=customer,
            customer_name_snapshot=payload.get("customer_name_snapshot"),
            customer_phone_snapshot=payload.get("customer_phone_snapshot"),
            customer_snapshot_email=payload.get("customer_snapshot_email"),
            customer_snapshot_billing_address_line1=payload.get("customer_snapshot_billing_address_line1"),
            customer_snapshot_billing_address_line2=payload.get("customer_snapshot_billing_address_line2"),
            customer_snapshot_city=payload.get("customer_snapshot_city"),
            customer_snapshot_district=payload.get("customer_snapshot_district"),
            customer_snapshot_state=payload.get("customer_snapshot_state"),
            customer_snapshot_pincode=payload.get("customer_snapshot_pincode"),
            customer_gstin=payload.get("customer_gstin"),
            customer_snapshot_place_of_supply=payload.get("customer_snapshot_place_of_supply"),
            delivery_snapshot_address_line1=payload.get("delivery_snapshot_address_line1"),
            delivery_snapshot_address_line2=payload.get("delivery_snapshot_address_line2"),
            delivery_snapshot_city=payload.get("delivery_snapshot_city"),
            delivery_snapshot_district=payload.get("delivery_snapshot_district"),
            delivery_snapshot_state=payload.get("delivery_snapshot_state"),
            delivery_snapshot_pincode=payload.get("delivery_snapshot_pincode"),
        )
    )
    sale_date = payload["sale_date"]
    payload.setdefault("financial_year", financial_year_for(sale_date))
    payload["doc_series"] = payload.get("doc_series") or _ensure_direct_sale_sequence(sale_date)
    payload.setdefault(
        "tax_profile_snapshot",
        build_non_gst_snapshot(
            document_type="DIRECT_SALE",
            document_date=sale_date,
            party_type="CUSTOMER",
            party_id=getattr(customer, "id", None),
        )
        if resolved_tax_mode == "NON_GST"
        else build_tax_profile_snapshot(on_date=sale_date),
    )
    payload.update(totals)
    received_total = _money(payload.get("received_total"))
    payload["received_total"] = received_total
    payload["balance_total"] = totals["grand_total"] - received_total
    sale = DirectSale.objects.create(
        sale_no=_issue_series_number(payload["doc_series"], prefix_fallback="SALE"),
        **payload,
    )
    _replace_direct_sale_lines(sale=sale, line_payloads=line_payloads)
    _sync_direct_sale_purchase_needs(sale=sale, line_payloads=line_payloads, actor=created_by)
    _sync_direct_sale_invoice(sale=sale, line_payloads=line_payloads)
    from billing.services.direct_sale_delivery_bridge_service import sync_direct_sale_delivery_case

    sync_direct_sale_delivery_case(sale=sale, actor=created_by)
    from subscriptions.services.contract_reference_service import (
        ensure_contract_reference_for_direct_sale,
    )
    ensure_contract_reference_for_direct_sale(sale)
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=sale,
        performed_by=created_by,
        metadata={
            "event": "DIRECT_SALE_CREATED",
            "direct_sale_id": sale.id,
            "sale_no": sale.sale_no,
            "line_count": len(line_payloads),
            "delivery_required": sale.delivery_required,
        },
    )
    return sale


@transaction.atomic
def update_direct_sale(*, direct_sale_id: int, payload: dict, updated_by):
    DirectSale.objects.select_for_update(of=("self",)).get(pk=direct_sale_id)
    sale = (
        DirectSale.objects.select_related("customer", "doc_series", "finance_account")
        .prefetch_related("lines", "billing_invoices")
        .get(pk=direct_sale_id)
    )
    if sale.status in {
        DirectSaleStatus.INVOICED,
        DirectSaleStatus.CANCELLED,
        DirectSaleStatus.CANCELLED_PRE_INVOICE,
        DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
        DirectSaleStatus.REVERSED_POST_INVOICE,
        DirectSaleStatus.RETURNED,
        DirectSaleStatus.ARCHIVED,
        DirectSaleStatus.EXCHANGED_CLOSED,
    }:
        raise ValueError("Invoiced or archived direct sales cannot be edited.")

    lines = payload.pop("lines", None)
    requested_tax_mode = payload.get("tax_mode", sale.tax_mode)
    resolved_tax_mode = resolve_operational_tax_mode(requested_tax_mode=requested_tax_mode)
    payload["tax_mode"] = resolved_tax_mode
    if resolved_tax_mode == "NON_GST":
        payload["tax_calculation_mode"] = "NON_GST"
    if "sale_date" in payload and "financial_year" not in payload:
        payload["financial_year"] = financial_year_for(payload["sale_date"])
    customer = payload.get("customer", sale.customer)
    line_payloads: list[dict]
    if lines is None:
        line_payloads = _enforce_direct_sale_tax_policy(
            tax_mode=resolved_tax_mode,
            line_payloads=_serialize_direct_sale_line_payloads(
            [
                {
                    "product": line.product,
                    "inventory_item": line.inventory_item,
                    "description": line.description,
                    "quantity": line.quantity,
                    "unit_price": line.unit_price,
                    "discount_amount": line.discount_amount,
                    "taxable_value": line.taxable_value,
                    "gst_rate": line.gst_rate,
                    "cgst_amount": line.cgst_amount,
                    "sgst_amount": line.sgst_amount,
                    "igst_amount": line.igst_amount,
                    "line_total": line.line_total,
                    "hsn_sac_code": line.hsn_sac_code,
                }
                for line in sale.lines.select_related("product", "inventory_item").all()
            ]
        ))
    else:
        line_payloads = _enforce_direct_sale_tax_policy(
            tax_mode=resolved_tax_mode,
            line_payloads=_serialize_direct_sale_line_payloads(lines),
        )
        _assert_products_not_in_active_rent_lease_possession(line_payloads=line_payloads)
    totals = _rollup_line_totals(line_payloads)
    if "customer_name_snapshot" in payload or "customer_phone_snapshot" in payload or "customer" in payload:
        payload.update(
            _build_direct_sale_snapshots(
                customer=customer,
                customer_name_snapshot=payload.get("customer_name_snapshot", sale.customer_name_snapshot),
                customer_phone_snapshot=payload.get("customer_phone_snapshot", sale.customer_phone_snapshot),
                customer_snapshot_email=payload.get("customer_snapshot_email", sale.customer_snapshot_email),
                customer_snapshot_billing_address_line1=payload.get("customer_snapshot_billing_address_line1", sale.customer_snapshot_billing_address_line1),
                customer_snapshot_billing_address_line2=payload.get("customer_snapshot_billing_address_line2", sale.customer_snapshot_billing_address_line2),
                customer_snapshot_city=payload.get("customer_snapshot_city", sale.customer_snapshot_city),
                customer_snapshot_district=payload.get("customer_snapshot_district", sale.customer_snapshot_district),
                customer_snapshot_state=payload.get("customer_snapshot_state", sale.customer_snapshot_state),
                customer_snapshot_pincode=payload.get("customer_snapshot_pincode", sale.customer_snapshot_pincode),
                customer_gstin=payload.get("customer_gstin", sale.customer_gstin),
                customer_snapshot_place_of_supply=payload.get("customer_snapshot_place_of_supply", sale.customer_snapshot_place_of_supply),
                delivery_snapshot_address_line1=payload.get("delivery_snapshot_address_line1", sale.delivery_snapshot_address_line1),
                delivery_snapshot_address_line2=payload.get("delivery_snapshot_address_line2", sale.delivery_snapshot_address_line2),
                delivery_snapshot_city=payload.get("delivery_snapshot_city", sale.delivery_snapshot_city),
                delivery_snapshot_district=payload.get("delivery_snapshot_district", sale.delivery_snapshot_district),
                delivery_snapshot_state=payload.get("delivery_snapshot_state", sale.delivery_snapshot_state),
                delivery_snapshot_pincode=payload.get("delivery_snapshot_pincode", sale.delivery_snapshot_pincode),
            )
        )
    payload.update(totals)
    if "tax_profile_snapshot" not in payload:
        payload["tax_profile_snapshot"] = (
            build_non_gst_snapshot(
                document_type="DIRECT_SALE",
                document_date=payload.get("sale_date", sale.sale_date),
                party_type="CUSTOMER",
                party_id=getattr(customer, "id", None),
            )
            if resolved_tax_mode == "NON_GST"
            else build_tax_profile_snapshot(on_date=payload.get("sale_date", sale.sale_date))
        )
    received_total = _money(payload.get("received_total", sale.received_total))
    payload["received_total"] = received_total
    payload["balance_total"] = totals["grand_total"] - received_total
    for key, value in payload.items():
        setattr(sale, key, value)
    sale.save()

    if lines is not None:
        _replace_direct_sale_lines(sale=sale, line_payloads=line_payloads)
    _sync_direct_sale_purchase_needs(sale=sale, line_payloads=line_payloads, actor=updated_by)
    _sync_direct_sale_invoice(sale=sale, line_payloads=line_payloads)
    from billing.services.direct_sale_delivery_bridge_service import sync_direct_sale_delivery_case

    sync_direct_sale_delivery_case(sale=sale, actor=updated_by)
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=sale,
        performed_by=updated_by,
        metadata={
            "event": "DIRECT_SALE_UPDATED",
            "direct_sale_id": sale.id,
            "sale_no": sale.sale_no,
            "line_count": len(line_payloads),
        },
    )
    return sale


@transaction.atomic
def confirm_direct_sale(*, direct_sale_id: int, confirmed_by):
    DirectSale.objects.select_for_update(of=("self",)).get(pk=direct_sale_id)
    sale = DirectSale.objects.prefetch_related("lines").get(pk=direct_sale_id)
    if sale.status in {DirectSaleStatus.CONFIRMED, DirectSaleStatus.DELIVERED, DirectSaleStatus.INVOICED}:
        return sale, False
    if sale.status in {
        DirectSaleStatus.CANCELLED,
        DirectSaleStatus.CANCELLED_PRE_INVOICE,
        DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
        DirectSaleStatus.REVERSED_POST_INVOICE,
        DirectSaleStatus.RETURNED,
        DirectSaleStatus.ARCHIVED,
        DirectSaleStatus.EXCHANGED_CLOSED,
    }:
        raise ValueError("Cancelled direct sales cannot be confirmed.")
    if not sale.lines.exists():
        raise ValueError("Direct sales require at least one line before confirmation.")

    sale.status = DirectSaleStatus.CONFIRMED
    sale.confirmed_by = confirmed_by
    sale.confirmed_at = timezone.now()
    sale.save(update_fields=["status", "confirmed_by", "confirmed_at", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=sale,
        performed_by=confirmed_by,
        metadata={
            "event": "DIRECT_SALE_CONFIRMED",
            "direct_sale_id": sale.id,
            "sale_no": sale.sale_no,
        },
    )
    from billing.services.direct_sale_delivery_bridge_service import sync_direct_sale_delivery_case

    sync_direct_sale_delivery_case(sale=sale, actor=confirmed_by)
    return sale, True


@transaction.atomic
def finalize_direct_sale_invoice(*, direct_sale_id: int, finalized_by):
    """Finalize a draft direct sale by approving and posting its linked invoice."""
    DirectSale.objects.select_for_update(of=("self",)).get(pk=direct_sale_id)
    sale = (
        DirectSale.objects.prefetch_related("lines", "billing_invoices")
        .select_related("customer", "doc_series", "finance_account")
        .get(pk=direct_sale_id)
    )
    if sale.status in {
        DirectSaleStatus.CANCELLED,
        DirectSaleStatus.CANCELLED_PRE_INVOICE,
        DirectSaleStatus.CANCELLED_AFTER_DELIVERY,
        DirectSaleStatus.REVERSED_POST_INVOICE,
        DirectSaleStatus.RETURNED,
        DirectSaleStatus.ARCHIVED,
        DirectSaleStatus.EXCHANGED_CLOSED,
    }:
        raise ValueError("Cancelled direct sales cannot be finalized.")
    if sale.status == DirectSaleStatus.INVOICED:
        return sale, False
    if sale.status not in {DirectSaleStatus.DRAFT, DirectSaleStatus.CONFIRMED}:
        raise ValueError("Only draft or confirmed direct sales can be finalized.")
    if not sale.lines.exists():
        raise ValueError("Direct sales require at least one line before invoice finalization.")

    invoice = _sync_direct_sale_invoice(
        sale=sale,
        line_payloads=_serialize_direct_sale_line_payloads(
            [
                {
                    "product": line.product,
                    "inventory_item": line.inventory_item,
                    "description": line.description,
                    "quantity": line.quantity,
                    "unit_price": line.unit_price,
                    "discount_amount": line.discount_amount,
                    "taxable_value": line.taxable_value,
                    "gst_rate": line.gst_rate,
                    "cgst_amount": line.cgst_amount,
                    "sgst_amount": line.sgst_amount,
                    "igst_amount": line.igst_amount,
                    "line_total": line.line_total,
                    "hsn_sac_code": line.hsn_sac_code,
                }
                for line in sale.lines.select_related("product", "inventory_item")
            ]
        ),
    )
    approved_invoice, _ = approve_billing_invoice(invoice_id=invoice.id, approved_by=finalized_by)
    posted_invoice, _ = post_billing_invoice(invoice_id=approved_invoice.id, posted_by=finalized_by)

    from inventory.services.purchase_need_reconciliation_service import (
        reconcile_direct_sale_stock_requirements,
    )
    from billing.services.direct_sale_delivery_bridge_service import sync_direct_sale_delivery_case

    reconcile_direct_sale_stock_requirements(direct_sale_id=sale.id, actor=finalized_by)
    refreshed = DirectSale.objects.get(pk=sale.id)
    sync_direct_sale_delivery_case(sale=refreshed, actor=finalized_by)
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=refreshed,
        performed_by=finalized_by,
        metadata={
            "event": "DIRECT_SALE_INVOICE_FINALIZED",
            "direct_sale_id": refreshed.id,
            "sale_no": refreshed.sale_no,
            "invoice_id": posted_invoice.id,
            "invoice_no": posted_invoice.document_no,
        },
    )
    return refreshed, True


@transaction.atomic
def mark_direct_sale_delivered(*, direct_sale_id: int, delivered_by, delivery_reference: str = ""):
    DirectSale.objects.select_for_update(of=("self",)).get(pk=direct_sale_id)
    sale = DirectSale.objects.get(pk=direct_sale_id)
    if sale.status == DirectSaleStatus.DELIVERED:
        return sale, False
    if sale.status == DirectSaleStatus.INVOICED:
        raise ValueError("Invoiced direct sales cannot be moved back to delivered state.")
    if sale.status == DirectSaleStatus.CANCELLED:
        raise ValueError("Cancelled direct sales cannot be marked delivered.")

    sale.status = DirectSaleStatus.DELIVERED
    sale.delivered_at = timezone.now()
    if delivery_reference.strip():
        sale.delivery_reference = delivery_reference
    sale.save(update_fields=["status", "delivered_at", "delivery_reference", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=sale,
        performed_by=delivered_by,
        metadata={
            "event": "DIRECT_SALE_DELIVERED",
            "direct_sale_id": sale.id,
            "sale_no": sale.sale_no,
            "delivery_reference": sale.delivery_reference,
        },
    )
    from billing.services.direct_sale_delivery_bridge_service import sync_direct_sale_delivery_case

    sync_direct_sale_delivery_case(sale=sale, actor=delivered_by)
    return sale, True


@transaction.atomic
def approve_billing_invoice(*, invoice_id: int, approved_by):
    BillingInvoice.objects.select_for_update(of=("self",)).get(pk=invoice_id)
    invoice = (
        BillingInvoice.objects.select_related("doc_series", "subscription")
        .prefetch_related("lines")
        .get(pk=invoice_id)
    )
    if invoice.status in {BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED}:
        return invoice, False
    if invoice.status in {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
        raise ValueError("Cancelled or void invoices cannot be approved.")
    if not invoice.lines.exists():
        raise ValueError("Invoices require at least one line before approval.")
    if current_tax_mode() == "GST_UNREGISTERED" and ((invoice.tax_mode or "").upper() == "GST" or _money(invoice.tax_total) > Decimal("0.00")):
        raise ValueError("GST invoice approval is blocked while business tax mode is GST_UNREGISTERED.")
    _assert_invoice_delivery_gate(invoice)

    if not invoice.document_no:
        invoice.document_no = _issue_series_number(
            invoice.doc_series or _ensure_invoice_sequence(invoice.invoice_date),
            prefix_fallback=f"INV-{invoice.id}",
        )
    invoice.status = BillingDocumentStatus.APPROVED
    invoice.approved_by = approved_by
    invoice.approved_at = timezone.now()
    invoice.save(update_fields=["document_no", "status", "approved_by", "approved_at", "updated_at"])
    _log_accounting_event(
        event="BILLING_INVOICE_APPROVED",
        instance=invoice,
        performed_by=approved_by,
        metadata={"invoice_id": invoice.id, "document_no": invoice.document_no},
    )
    if invoice.direct_sale_id:
        from billing.services.direct_sale_delivery_bridge_service import sync_direct_sale_delivery_case

        sync_direct_sale_delivery_case(sale=invoice.direct_sale, actor=approved_by)
    return invoice, True


@transaction.atomic
def post_billing_invoice(*, invoice_id: int, posted_by):
    BillingInvoice.objects.select_for_update(of=("self",)).get(pk=invoice_id)
    invoice = (
        BillingInvoice.objects.select_related(
            "direct_sale",
            "finance_account",
            "finance_account__chart_account",
            "posted_journal_entry",
            "subscription",
        )
        .prefetch_related("lines", "lines__inventory_item", "receipts")
        .get(pk=invoice_id)
    )
    if invoice.status == BillingDocumentStatus.POSTED and invoice.posted_journal_entry_id:
        return invoice, False
    if invoice.status != BillingDocumentStatus.APPROVED:
        raise ValueError("Only approved invoices can be posted.")
    if current_tax_mode() == "GST_UNREGISTERED" and ((invoice.tax_mode or "").upper() == "GST" or _money(invoice.tax_total) > Decimal("0.00")):
        raise ValueError("GST invoice posting is blocked while business tax mode is GST_UNREGISTERED.")
    _assert_invoice_delivery_gate(invoice)
    _assert_direct_sale_delivery_gate(invoice)

    accounts = ensure_phase3_system_accounts()
    tax_total = _money(invoice.tax_total)
    journal_lines = [
        {
            "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
            "description": invoice.document_no or f"Invoice {invoice.id}",
            "debit_amount": invoice.grand_total,
            "credit_amount": Decimal("0.00"),
        },
        {
            "chart_account": accounts["SALES_REVENUE"],
            "description": invoice.document_no or f"Invoice {invoice.id}",
            "debit_amount": Decimal("0.00"),
            "credit_amount": invoice.taxable_total,
        },
    ]
    if tax_total > 0:
        journal_lines.append(
            {
                "chart_account": accounts["OUTPUT_GST"],
                "description": f"GST {invoice.document_no or invoice.id}",
                "debit_amount": Decimal("0.00"),
                "credit_amount": tax_total,
            }
        )

    posted_journal, _ = post_bridge_entry(
        source_instance=invoice,
        purpose="RETAIL_SALE",
        entry_date=invoice.invoice_date,
        memo=f"Retail invoice {invoice.document_no or invoice.id}",
        lines=journal_lines,
        voucher_type="SALES_INVOICE",
        source_type=invoice.source_type or "BILLING_INVOICE",
        source_reference=invoice.source_reference or invoice.document_no or f"INV-{invoice.id}",
        source_document_no=invoice.document_no or "",
        source_event_date=invoice.invoice_date,
        trace_metadata={
            "billing_invoice_id": invoice.id,
            "subscription_id": invoice.subscription_id,
            "direct_sale_id": invoice.direct_sale_id,
            "customer_id": invoice.customer_id,
        },
        posted_by=posted_by,
    )
    invoice.posted_journal_entry = posted_journal
    invoice.status = BillingDocumentStatus.POSTED
    invoice.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    stock_result = post_invoice_stock_movements(invoice=invoice, posted_by=posted_by)
    auto_receipt_created = False
    if (
        _money(invoice.received_total) > Decimal("0.00")
        and invoice.finance_account_id
        and not invoice.receipts.exists()
    ):
        create_manual_receipt(
            receipt_date=invoice.invoice_date,
            finance_account_id=invoice.finance_account_id,
            amount=invoice.received_total,
            receipt_type=ReceiptType.RETAIL_RECEIPT,
            billing_invoice_id=invoice.id,
            direct_sale_id=invoice.direct_sale_id,
            customer_id=invoice.customer_id,
            subscription_id=invoice.subscription_id,
            branch_id=invoice.branch_id,
            cash_counter_id=getattr(invoice.direct_sale, "cash_counter_id", None),
            notes=f"Auto-generated from posted invoice {invoice.document_no or invoice.id}",
            source_type=invoice.source_type,
            source_reference=invoice.source_reference or invoice.document_no or str(invoice.id),
            created_by=posted_by,
        )
        auto_receipt_created = True
    if invoice.direct_sale_id:
        direct_sale = invoice.direct_sale
        direct_sale.status = DirectSaleStatus.INVOICED
        direct_sale.invoiced_at = timezone.now()
        if not direct_sale.delivery_required and direct_sale.delivered_at is None:
            direct_sale.delivered_at = direct_sale.invoiced_at
        direct_sale.save(update_fields=["status", "invoiced_at", "delivered_at", "updated_at"])
        from billing.services.direct_sale_delivery_bridge_service import sync_direct_sale_delivery_case

        sync_direct_sale_delivery_case(sale=direct_sale, actor=posted_by)
    _log_accounting_event(
        event="BILLING_INVOICE_POSTED",
        instance=invoice,
        performed_by=posted_by,
        metadata={
            "invoice_id": invoice.id,
            "document_no": invoice.document_no,
            "journal_entry_id": posted_journal.id,
            "stock_created_count": stock_result["created_count"],
            "stock_existing_count": stock_result["existing_count"],
            "auto_receipt_created": auto_receipt_created,
            "direct_sale_id": invoice.direct_sale_id,
        },
    )
    return invoice, True


def _create_receipt_journal(*, receipt, offset_account, posted_by):
    return post_bridge_entry(
        source_instance=receipt,
        purpose=receipt.receipt_type,
        entry_date=receipt.receipt_date,
        memo=f"Receipt {receipt.receipt_no or receipt.id}",
        lines=[
            {
                "chart_account": receipt.finance_account.chart_account,
                "description": receipt.receipt_no or str(receipt.id),
                "debit_amount": receipt.amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": offset_account,
                "description": receipt.receipt_no or str(receipt.id),
                "debit_amount": Decimal("0.00"),
                "credit_amount": receipt.amount,
            },
        ],
        voucher_type="RECEIPT",
        source_type=receipt.source_type or "RECEIPT_DOCUMENT",
        source_reference=receipt.source_reference or receipt.receipt_no or f"RCT-{receipt.id}",
        source_document_no=receipt.receipt_no or "",
        source_event_date=receipt.receipt_date,
        trace_metadata={
            "receipt_id": receipt.id,
            "receipt_type": receipt.receipt_type,
            "branch_id": receipt.branch_id,
            "cash_counter_id": receipt.cash_counter_id,
            "billing_invoice_id": receipt.billing_invoice_id,
            "direct_sale_id": receipt.direct_sale_id,
            "payment_id": receipt.payment_id,
            "subscription_id": receipt.subscription_id,
            "customer_id": receipt.customer_id,
        },
        posted_by=posted_by,
    )


@transaction.atomic
def create_manual_receipt(
    *,
    receipt_date,
    finance_account_id: int,
    amount,
    receipt_type: str,
    billing_invoice_id: int | None = None,
    direct_sale_id: int | None = None,
    customer_id: int | None = None,
    subscription_id: int | None = None,
    payment_id: int | None = None,
    notes: str = "",
    source_type: str | None = None,
    source_reference: str = "",
    branch_id: int | None = None,
    cash_counter_id: int | None = None,
    created_by=None,
):
    from accounting.models import FinanceAccount

    accounts = ensure_phase3_system_accounts()
    FinanceAccount.objects.select_for_update(of=("self",)).get(pk=finance_account_id)
    finance_account = FinanceAccount.objects.select_related("chart_account").get(pk=finance_account_id)
    if receipt_type in {ReceiptType.RETAIL_RECEIPT, ReceiptType.EMI_PAYMENT_RECEIPT}:
        assert_finance_account_allowed_for_payment_collection(finance_account)
    sequence = _ensure_receipt_sequence(receipt_date)
    billing_invoice = BillingInvoice.objects.select_related("customer").filter(pk=billing_invoice_id).first() if billing_invoice_id else None
    direct_sale = DirectSale.objects.select_related("customer").filter(pk=direct_sale_id).first() if direct_sale_id else None
    payment = Payment.objects.select_related("customer").filter(pk=payment_id).first() if payment_id else None
    resolved_source_type = source_type or BillingSourceType.MANUAL
    resolved_source_reference = (source_reference or "").strip()
    if billing_invoice is not None and billing_invoice.direct_sale_id and direct_sale is None:
        direct_sale = billing_invoice.direct_sale
    if payment is not None:
        resolved_source_type = BillingSourceType.PAYMENT
        resolved_source_reference = payment.reference_no or f"PAY-{payment.id}"
    elif billing_invoice is not None:
        resolved_source_type = billing_invoice.source_type or BillingSourceType.MANUAL
        resolved_source_reference = (
            resolved_source_reference
            or billing_invoice.source_reference
            or billing_invoice.document_no
            or f"INV-{billing_invoice.id}"
        )
    elif direct_sale is not None:
        resolved_source_type = BillingSourceType.DIRECT_SALE
        resolved_source_reference = (
            resolved_source_reference
            or direct_sale.sale_no
            or f"SALE-{direct_sale.id}"
        )
    receipt = ReceiptDocument.objects.create(
        receipt_no=_issue_series_number(sequence, prefix_fallback="RCT"),
        receipt_type=receipt_type,
        status=BillingDocumentStatus.DRAFT,
        receipt_date=receipt_date,
        branch_id=branch_id
        or getattr(payment, "branch_id", None)
        or getattr(direct_sale, "branch_id", None)
        or getattr(billing_invoice, "branch_id", None),
        cash_counter_id=cash_counter_id
        or getattr(payment, "cash_counter_id", None)
        or getattr(direct_sale, "cash_counter_id", None),
        finance_account=finance_account,
        billing_invoice_id=billing_invoice_id,
        direct_sale=direct_sale,
        customer_id=customer_id,
        subscription_id=subscription_id,
        payment_id=payment_id,
        source_type=resolved_source_type,
        source_reference=resolved_source_reference,
        amount=amount,
        tax_profile_snapshot=build_non_gst_snapshot(
            document_type=(
                "ADVANCE_EMI_RECEIPT"
                if receipt_type == ReceiptType.EMI_PAYMENT_RECEIPT
                else "NON_GST_RECEIPT"
            ),
            document_date=receipt_date,
            party_type="CUSTOMER",
            party_id=customer_id or getattr(payment, "customer_id", None),
        ),
        customer_name_snapshot=(
            payment.customer.name
            if payment is not None
            else billing_invoice.customer_name_snapshot
            if billing_invoice is not None
            else direct_sale.customer_name_snapshot if direct_sale is not None else ""
        ),
        customer_phone_snapshot=(
            payment.customer.phone
            if payment is not None
            else billing_invoice.customer_phone_snapshot
            if billing_invoice is not None
            else direct_sale.customer_phone_snapshot if direct_sale is not None else ""
        ),
        notes=notes,
    )
    offset_account = (
        accounts["EMI_COLLECTION_CLEARING"]
        if receipt_type == ReceiptType.EMI_PAYMENT_RECEIPT
        else accounts["ACCOUNTS_RECEIVABLE"]
    )
    posted_journal, _ = _create_receipt_journal(
        receipt=receipt,
        offset_account=offset_account,
        posted_by=created_by,
    )
    receipt.posted_journal_entry = posted_journal
    receipt.status = BillingDocumentStatus.POSTED
    receipt.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    _log_accounting_event(
        event="BILLING_RECEIPT_POSTED",
        instance=receipt,
        performed_by=created_by,
        metadata={
            "receipt_id": receipt.id,
            "receipt_no": receipt.receipt_no,
            "journal_entry_id": posted_journal.id,
        },
    )
    return receipt


@transaction.atomic
def generate_emi_payment_receipt(*, payment_id: int, finance_account_id: int, performed_by):
    Payment.objects.select_for_update(of=("self",)).get(pk=payment_id)
    payment = Payment.objects.select_related("customer", "subscription").get(pk=payment_id)
    if ReceiptDocument.objects.filter(payment_id=payment.id).exists():
        receipt = ReceiptDocument.objects.get(payment_id=payment.id)
        return receipt, False

    receipt = create_manual_receipt(
        receipt_date=payment.payment_date,
        finance_account_id=finance_account_id,
        amount=payment.amount,
        receipt_type=ReceiptType.EMI_PAYMENT_RECEIPT,
        customer_id=payment.customer_id,
        subscription_id=payment.subscription_id,
        payment_id=payment.id,
        notes=f"Generated from operational payment {payment.id}",
        created_by=performed_by,
    )
    return receipt, True


@transaction.atomic
def void_receipt_document(*, receipt_id: int, performed_by, reason: str):
    ReceiptDocument.objects.select_for_update(of=("self",)).get(pk=receipt_id)
    receipt = (
        ReceiptDocument.objects.select_related(
            "billing_invoice",
            "direct_sale",
            "finance_account",
            "finance_account__chart_account",
            "posted_journal_entry",
        ).get(pk=receipt_id)
    )
    if receipt.status == BillingDocumentStatus.VOID:
        return receipt, False
    if receipt.status != BillingDocumentStatus.POSTED:
        raise ValueError("Only posted receipts can be voided.")

    reason = (reason or "").strip()
    if not reason:
        raise ValueError("Void reason is required.")

    accounts = ensure_phase3_system_accounts()
    offset_account = (
        accounts["EMI_COLLECTION_CLEARING"]
        if receipt.receipt_type == ReceiptType.EMI_PAYMENT_RECEIPT
        else accounts["ACCOUNTS_RECEIVABLE"]
    )
    reversal_journal, _ = post_bridge_entry(
        source_instance=receipt,
        purpose=f"{receipt.receipt_type}_VOID",
        entry_date=timezone.localdate(),
        memo=f"Void receipt {receipt.receipt_no or receipt.id}",
        lines=[
            {
                "chart_account": offset_account,
                "description": receipt.receipt_no or str(receipt.id),
                "debit_amount": receipt.amount,
                "credit_amount": Decimal("0.00"),
            },
            {
                "chart_account": receipt.finance_account.chart_account,
                "description": receipt.receipt_no or str(receipt.id),
                "debit_amount": Decimal("0.00"),
                "credit_amount": receipt.amount,
            },
        ],
        voucher_type="RECEIPT_VOID",
        source_type=receipt.source_type or "RECEIPT_DOCUMENT",
        source_reference=receipt.source_reference or receipt.receipt_no or f"RCT-{receipt.id}",
        source_document_no=receipt.receipt_no or "",
        source_event_date=timezone.localdate(),
        trace_metadata={
            "receipt_id": receipt.id,
            "receipt_type": receipt.receipt_type,
            "payment_id": receipt.payment_id,
            "reason": reason,
        },
        posted_by=performed_by,
    )
    receipt.status = BillingDocumentStatus.VOID
    receipt.notes = f"{(receipt.notes or '').strip()}\nVoid reason: {reason}".strip()
    receipt.save(update_fields=["status", "notes", "updated_at"])
    create_lifecycle_event_for_receipt_invalidation(
        receipt=receipt,
        event_type=FinancialSourceLifecycleEvent.EventType.VOIDED,
        reason=reason,
        performed_by=performed_by,
        related_journal=reversal_journal,
        metadata={"void_reason": reason},
    )
    if receipt.billing_invoice_id:
        recalculate_invoice_settlement(receipt.billing_invoice)
    if receipt.direct_sale_id:
        recalculate_direct_sale_settlement(receipt.direct_sale)
    _log_accounting_event(
        event="BILLING_RECEIPT_VOIDED",
        instance=receipt,
        performed_by=performed_by,
        metadata={
            "receipt_id": receipt.id,
            "receipt_no": receipt.receipt_no,
            "reason": reason,
            "reversal_journal_entry_id": reversal_journal.id,
        },
    )
    return receipt, True


def _approve_note(note, *, approved_by, sequence_factory, event_name: str):
    if note.status in {BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED}:
        return note, False
    if note.status in {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
        raise ValueError("Cancelled or void notes cannot be approved.")
    if not note.note_no:
        note.note_no = _issue_series_number(sequence_factory(note.note_date), prefix_fallback=f"NOTE-{note.id}")
    note.status = BillingDocumentStatus.APPROVED
    note.save(update_fields=["note_no", "status", "updated_at"])
    _log_accounting_event(
        event=event_name,
        instance=note,
        performed_by=approved_by,
        metadata={"note_id": note.id, "note_no": note.note_no},
    )
    return note, True


def _compact_journal_lines(lines: list[dict]) -> list[dict]:
    compacted: list[dict] = []
    for line in lines:
        debit_amount = _money(line.get("debit_amount"))
        credit_amount = _money(line.get("credit_amount"))
        if debit_amount <= Decimal("0.00") and credit_amount <= Decimal("0.00"):
            continue
        compacted.append(
            {
                **line,
                "debit_amount": debit_amount,
                "credit_amount": credit_amount,
            }
        )
    return compacted


@transaction.atomic
def approve_billing_credit_note(*, credit_note_id: int, approved_by):
    note = BillingCreditNote.objects.select_for_update().get(pk=credit_note_id)
    return _approve_note(
        note,
        approved_by=approved_by,
        sequence_factory=_ensure_credit_sequence,
        event_name="BILLING_CREDIT_NOTE_APPROVED",
    )


@transaction.atomic
def approve_billing_debit_note(*, debit_note_id: int, approved_by):
    note = BillingDebitNote.objects.select_for_update().get(pk=debit_note_id)
    return _approve_note(
        note,
        approved_by=approved_by,
        sequence_factory=_ensure_debit_sequence,
        event_name="BILLING_DEBIT_NOTE_APPROVED",
    )


@transaction.atomic
def post_billing_credit_note(*, credit_note_id: int, posted_by):
    note = BillingCreditNote.objects.select_for_update().prefetch_related("lines").get(pk=credit_note_id)
    if note.status == BillingDocumentStatus.POSTED and note.posted_journal_entry_id:
        return note, False
    if note.status != BillingDocumentStatus.APPROVED:
        raise ValueError("Only approved credit notes can be posted.")

    accounts = ensure_phase3_system_accounts()
    posted_journal, _ = post_bridge_entry(
        source_instance=note,
        purpose="RETAIL_CREDIT_NOTE",
        entry_date=note.note_date,
        memo=f"Billing credit note {note.note_no or note.id}",
        lines=_compact_journal_lines(
            [
                {
                    "chart_account": accounts["SALES_RETURNS"],
                    "description": note.note_no or str(note.id),
                    "debit_amount": note.taxable_adjustment,
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": accounts["OUTPUT_GST"],
                    "description": f"GST reversal {note.note_no or note.id}",
                    "debit_amount": note.tax_adjustment,
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                    "description": note.note_no or str(note.id),
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": note.total_adjustment,
                },
            ]
        ),
        posted_by=posted_by,
    )
    note.posted_journal_entry = posted_journal
    note.status = BillingDocumentStatus.POSTED
    note.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    stock_result = post_credit_note_stock_movements(note=note, posted_by=posted_by) if note.stock_effect else {"created_count": 0, "existing_count": 0}
    _log_accounting_event(
        event="BILLING_CREDIT_NOTE_POSTED",
        instance=note,
        performed_by=posted_by,
        metadata={
            "note_id": note.id,
            "journal_entry_id": posted_journal.id,
            "stock_created_count": stock_result["created_count"],
            "stock_existing_count": stock_result["existing_count"],
        },
    )
    return note, True


@transaction.atomic
def post_billing_debit_note(*, debit_note_id: int, posted_by):
    note = BillingDebitNote.objects.select_for_update().prefetch_related("lines").get(pk=debit_note_id)
    if note.status == BillingDocumentStatus.POSTED and note.posted_journal_entry_id:
        return note, False
    if note.status != BillingDocumentStatus.APPROVED:
        raise ValueError("Only approved debit notes can be posted.")

    accounts = ensure_phase3_system_accounts()
    posted_journal, _ = post_bridge_entry(
        source_instance=note,
        purpose="RETAIL_DEBIT_NOTE",
        entry_date=note.note_date,
        memo=f"Billing debit note {note.note_no or note.id}",
        lines=_compact_journal_lines(
            [
                {
                    "chart_account": accounts["ACCOUNTS_RECEIVABLE"],
                    "description": note.note_no or str(note.id),
                    "debit_amount": note.total_adjustment,
                    "credit_amount": Decimal("0.00"),
                },
                {
                    "chart_account": accounts["SALES_REVENUE"],
                    "description": note.note_no or str(note.id),
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": note.taxable_adjustment,
                },
                {
                    "chart_account": accounts["OUTPUT_GST"],
                    "description": f"GST increase {note.note_no or note.id}",
                    "debit_amount": Decimal("0.00"),
                    "credit_amount": note.tax_adjustment,
                },
            ]
        ),
        posted_by=posted_by,
    )
    note.posted_journal_entry = posted_journal
    note.status = BillingDocumentStatus.POSTED
    note.save(update_fields=["posted_journal_entry", "status", "updated_at"])
    stock_result = post_debit_note_stock_movements(note=note, posted_by=posted_by) if note.stock_effect else {"created_count": 0, "existing_count": 0}
    _log_accounting_event(
        event="BILLING_DEBIT_NOTE_POSTED",
        instance=note,
        performed_by=posted_by,
        metadata={
            "note_id": note.id,
            "journal_entry_id": posted_journal.id,
            "stock_created_count": stock_result["created_count"],
            "stock_existing_count": stock_result["existing_count"],
        },
    )
    return note, True


def mark_document_printed(*, instance, performed_by=None):
    instance.printed_count = (instance.printed_count or 0) + 1
    instance.printed_at = timezone.now()
    instance.save(update_fields=["printed_count", "printed_at", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=instance,
        performed_by=performed_by,
        metadata={
            "event": "BILLING_DOCUMENT_PRINTED",
            "printed_count": instance.printed_count,
        },
    )
    return instance
