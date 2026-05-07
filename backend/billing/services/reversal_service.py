from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounting.services.bridge_posting_service import post_bridge_entry
from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from billing.models import (
    BillingChannel,
    BillingCreditNote,
    BillingCreditNoteLine,
    BillingDocumentStatus,
    BillingInvoice,
    CustomerCreditLedger,
    CustomerRefund,
    CustomerRefundStatus,
    DirectSale,
    DirectSaleReturn,
    DirectSaleReturnLine,
    DirectSaleReturnStatus,
    DirectSaleStatus,
    PurchaseReturn,
    PurchaseReturnLine,
    PurchaseReturnStatus,
    RefundMethod,
)
from billing.services.billing_service import (
    _ensure_credit_sequence,
    _issue_series_number,
    post_billing_credit_note,
    void_receipt_document,
)
from inventory.models import PurchaseBill, PurchaseBillStatus, StockMovementType
from inventory.services.stock_movement_service import post_movement
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


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
        action_type=AuditLog.ActionType.SUBSCRIPTION_CANCELLED,
        instance=sale,
        performed_by=performed_by,
        metadata={"event": "DIRECT_SALE_CANCELLED_BEFORE_INVOICE", "direct_sale_id": sale.id, "reason": reason},
    )
    return sale, True


@transaction.atomic
def create_direct_sale_return(*, direct_sale_id: int, lines: list[dict], reason: str, performed_by):
    reason = _require_reason(reason)
    if not lines:
        raise ValueError("At least one return line is required.")

    sale = DirectSale.objects.select_for_update(of=("self",)).prefetch_related("lines", "billing_invoices").get(pk=direct_sale_id)
    invoice = sale.billing_invoices.filter(status=BillingDocumentStatus.POSTED).order_by("-invoice_date", "-id").first()
    if invoice is None:
        raise ValueError("Posted original invoice is required for direct sale return.")

    if sale.status not in {DirectSaleStatus.INVOICED, DirectSaleStatus.DELIVERED}:
        raise ValueError("Return is allowed only for delivered/invoiced direct sales.")

    by_line = {line.id: line for line in sale.lines.all()}
    returned_by_sale_line: dict[int, Decimal] = defaultdict(lambda: Decimal("0.000"))
    existing_returns = DirectSaleReturnLine.objects.filter(
        direct_sale_line_id__in=list(by_line.keys()),
        direct_sale_return__status__in=[DirectSaleReturnStatus.APPROVED, DirectSaleReturnStatus.POSTED],
    ).values("direct_sale_line_id").annotate(total=Sum("quantity"))
    for row in existing_returns:
        returned_by_sale_line[int(row["direct_sale_line_id"])] = _qty(row["total"])

    seq = _fy_sequence("BILL_RET", "RET", timezone.localdate())
    ds_return = DirectSaleReturn.objects.create(
        return_no=_issue_series_number(seq, prefix_fallback=f"RET-{sale.id}"),
        direct_sale=sale,
        original_invoice=invoice,
        customer=sale.customer,
        reason=reason,
        stock_effect=True,
    )

    subtotal = Decimal("0.00")
    tax_total = Decimal("0.00")
    grand_total = Decimal("0.00")

    for row in lines:
        sale_line_id = int(row.get("direct_sale_line_id") or 0)
        quantity = _qty(row.get("quantity"))
        if sale_line_id <= 0 or quantity <= Decimal("0.000"):
            raise ValueError("Each return line needs valid direct_sale_line_id and quantity.")
        sale_line = by_line.get(sale_line_id)
        if sale_line is None:
            raise ValueError(f"Direct sale line {sale_line_id} not found.")

        sold_qty = _qty(sale_line.quantity)
        already_returned = returned_by_sale_line[sale_line.id]
        allowed_qty = sold_qty - already_returned
        if quantity > allowed_qty:
            raise ValueError(
                f"Return quantity exceeds remaining sold quantity for line {sale_line.id}. Remaining: {allowed_qty}."
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
    ds_return.save(update_fields=["subtotal", "tax_total", "grand_total", "updated_at"])

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
        stock_effect=ret.stock_effect,
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
    ret.credit_note = note
    ret.status = DirectSaleReturnStatus.POSTED
    ret.posted_by = posted_by
    ret.posted_at = timezone.now()
    ret.save(update_fields=["credit_note", "status", "posted_by", "posted_at", "updated_at"])

    create_customer_credit_from_credit_note(
        customer_id=ret.customer_id,
        credit_note_id=note.id,
        direct_sale_return_id=ret.id,
        amount=ret.grand_total,
        performed_by=posted_by,
    )

    return ret, True


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
def create_purchase_return(*, purchase_bill_id: int, lines: list[dict], reason: str, performed_by):
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

    for line in purchase_return.lines.all():
        post_movement(
            inventory_item=line.inventory_item,
            movement_type=StockMovementType.PURCHASE_RETURN_OUT,
            quantity=line.quantity,
            movement_date=purchase_return.return_date,
            stock_location=purchase_return.purchase_bill.stock_location,
            reference_model="PurchaseReturn",
            reference_id=purchase_return.id,
            posted_by=posted_by,
            notes=f"Purchase return {purchase_return.return_no}",
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
