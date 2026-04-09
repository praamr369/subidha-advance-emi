from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.gst_document_posting_service import ensure_document_sequence, financial_year_for
from accounting.services.journal_posting_service import _log_accounting_event
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
from inventory.services.stock_service import (
    post_credit_note_stock_movements,
    post_debit_note_stock_movements,
    post_invoice_stock_movements,
)
from subscriptions.models import AuditLog, FulfillmentStatus, Payment
from subscriptions.services.audit_service import log_audit


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


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
        payloads.append(
            {
                "product": product,
                "inventory_item": inventory_item,
                "description": (line.get("description") or "").strip(),
                "quantity": line.get("quantity"),
                "unit_price": line.get("unit_price"),
                "discount_amount": line.get("discount_amount") or Decimal("0.00"),
                "taxable_value": line.get("taxable_value") or Decimal("0.00"),
                "gst_rate": line.get("gst_rate"),
                "cgst_amount": line.get("cgst_amount") or Decimal("0.00"),
                "sgst_amount": line.get("sgst_amount") or Decimal("0.00"),
                "igst_amount": line.get("igst_amount") or Decimal("0.00"),
                "line_total": line.get("line_total") or Decimal("0.00"),
                "product_code_snapshot": product_code,
                "sku_snapshot": inventory_sku,
                "unit_of_measure_snapshot": str(unit_of_measure).strip().upper(),
                "hsn_sac_code": (line.get("hsn_sac_code") or "").strip().upper(),
            }
        )
    return payloads


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
        [DirectSaleLine(direct_sale=sale, **payload) for payload in line_payloads]
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


def _build_direct_sale_snapshots(*, customer, customer_name_snapshot, customer_phone_snapshot):
    return {
        "customer_name_snapshot": (
            (customer_name_snapshot or "").strip()
            or getattr(customer, "name", "")
        ),
        "customer_phone_snapshot": (
            (customer_phone_snapshot or "").strip()
            or getattr(customer, "phone", "")
        ),
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
    if not invoice.direct_sale_id:
        return
    if invoice.document_type != BillingInvoiceType.INVOICE:
        return
    sale = invoice.direct_sale
    if not sale.delivery_required:
        return
    if sale.delivered_at is None or sale.status not in {
        DirectSaleStatus.DELIVERED,
        DirectSaleStatus.INVOICED,
    }:
        raise ValueError(
            "Direct-sale final invoices can only be posted after the sale is marked delivered."
        )


@transaction.atomic
def create_direct_sale(*, payload: dict, created_by):
    lines = payload.pop("lines", [])
    line_payloads = _serialize_direct_sale_line_payloads(lines)
    totals = _rollup_line_totals(line_payloads)
    customer = payload.get("customer")
    payload.update(
        _build_direct_sale_snapshots(
            customer=customer,
            customer_name_snapshot=payload.get("customer_name_snapshot"),
            customer_phone_snapshot=payload.get("customer_phone_snapshot"),
        )
    )
    sale_date = payload["sale_date"]
    payload.setdefault("financial_year", financial_year_for(sale_date))
    payload.setdefault("tax_mode", "NON_GST")
    payload["doc_series"] = payload.get("doc_series") or _ensure_direct_sale_sequence(sale_date)
    payload.update(totals)
    received_total = _money(payload.get("received_total"))
    payload["received_total"] = received_total
    payload["balance_total"] = totals["grand_total"] - received_total
    sale = DirectSale.objects.create(
        sale_no=_issue_series_number(payload["doc_series"], prefix_fallback="SALE"),
        **payload,
    )
    _replace_direct_sale_lines(sale=sale, line_payloads=line_payloads)
    _sync_direct_sale_invoice(sale=sale, line_payloads=line_payloads)
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
    sale = (
        DirectSale.objects.select_for_update()
        .select_related("customer", "doc_series", "finance_account")
        .prefetch_related("lines", "billing_invoices")
        .get(pk=direct_sale_id)
    )
    if sale.status in {DirectSaleStatus.INVOICED, DirectSaleStatus.CANCELLED}:
        raise ValueError("Invoiced or cancelled direct sales cannot be edited.")

    lines = payload.pop("lines", None)
    if "sale_date" in payload and "financial_year" not in payload:
        payload["financial_year"] = financial_year_for(payload["sale_date"])
    customer = payload.get("customer", sale.customer)
    line_payloads: list[dict]
    if lines is None:
        line_payloads = _serialize_direct_sale_line_payloads(
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
        )
    else:
        line_payloads = _serialize_direct_sale_line_payloads(lines)
    totals = _rollup_line_totals(line_payloads)
    if "customer_name_snapshot" in payload or "customer_phone_snapshot" in payload or "customer" in payload:
        payload.update(
            _build_direct_sale_snapshots(
                customer=customer,
                customer_name_snapshot=payload.get("customer_name_snapshot", sale.customer_name_snapshot),
                customer_phone_snapshot=payload.get("customer_phone_snapshot", sale.customer_phone_snapshot),
            )
        )
    payload.update(totals)
    received_total = _money(payload.get("received_total", sale.received_total))
    payload["received_total"] = received_total
    payload["balance_total"] = totals["grand_total"] - received_total
    for key, value in payload.items():
        setattr(sale, key, value)
    sale.save()

    if lines is not None:
        _replace_direct_sale_lines(sale=sale, line_payloads=line_payloads)
    _sync_direct_sale_invoice(sale=sale, line_payloads=line_payloads)
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
    sale = DirectSale.objects.select_for_update().prefetch_related("lines").get(pk=direct_sale_id)
    if sale.status in {DirectSaleStatus.CONFIRMED, DirectSaleStatus.DELIVERED, DirectSaleStatus.INVOICED}:
        return sale, False
    if sale.status == DirectSaleStatus.CANCELLED:
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
    return sale, True


@transaction.atomic
def mark_direct_sale_delivered(*, direct_sale_id: int, delivered_by, delivery_reference: str = ""):
    sale = DirectSale.objects.select_for_update().get(pk=direct_sale_id)
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
    return sale, True


@transaction.atomic
def approve_billing_invoice(*, invoice_id: int, approved_by):
    invoice = (
        BillingInvoice.objects.select_for_update()
        .select_related("doc_series", "subscription")
        .get(pk=invoice_id)
    )
    if invoice.status in {BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED}:
        return invoice, False
    if invoice.status in {BillingDocumentStatus.CANCELLED, BillingDocumentStatus.VOID}:
        raise ValueError("Cancelled or void invoices cannot be approved.")
    if not invoice.lines.exists():
        raise ValueError("Invoices require at least one line before approval.")
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
    return invoice, True


@transaction.atomic
def post_billing_invoice(*, invoice_id: int, posted_by):
    invoice = (
        BillingInvoice.objects.select_for_update()
        .select_related(
            "direct_sale",
            "finance_account",
            "finance_account__chart_account",
            "posted_journal_entry",
            "subscription",
        )
        .prefetch_related("lines", "lines__inventory_item")
        .get(pk=invoice_id)
    )
    if invoice.status == BillingDocumentStatus.POSTED and invoice.posted_journal_entry_id:
        return invoice, False
    if invoice.status != BillingDocumentStatus.APPROVED:
        raise ValueError("Only approved invoices can be posted.")
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
    created_by=None,
):
    from accounting.models import FinanceAccount

    accounts = ensure_phase3_system_accounts()
    finance_account = FinanceAccount.objects.select_for_update().select_related("chart_account").get(pk=finance_account_id)
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
        finance_account=finance_account,
        billing_invoice_id=billing_invoice_id,
        direct_sale=direct_sale,
        customer_id=customer_id,
        subscription_id=subscription_id,
        payment_id=payment_id,
        source_type=resolved_source_type,
        source_reference=resolved_source_reference,
        amount=amount,
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
    payment = Payment.objects.select_for_update().select_related(
        "customer",
        "subscription",
    ).get(pk=payment_id)
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
    receipt = (
        ReceiptDocument.objects.select_for_update()
        .select_related("finance_account", "finance_account__chart_account", "posted_journal_entry")
        .get(pk=receipt_id)
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
        lines=[
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
        ],
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
        lines=[
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
        ],
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
