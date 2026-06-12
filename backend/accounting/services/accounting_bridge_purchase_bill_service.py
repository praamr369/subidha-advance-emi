from __future__ import annotations

from collections import Counter
from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction

from accounting.models import AccountingBridgePosting, ChartOfAccount, FinanceAccount, JournalEntry
from accounting.services import accounting_bridge_candidate_service as base
from accounting.services.document_sequence_service import DocumentNumberingSetupError, DocumentType, preview_document_number, validate_document_numbering_ready
from accounting.services.bridge_posting_service import post_bridge_entry
from inventory.models import GoodsReceiptLine, InventoryItem, OpeningStockEntry, PurchaseBill, PurchaseBillLine, PurchaseBillStatus, PurchaseTaxMode, StockAdjustmentLine, StockLedger, StockMovementType, VendorBillLine, VendorPayment, VendorPaymentStatus
from reconciliation.models import ReconciliationItemStatus

PURCHASE_BILL_SOURCE_MODEL = "PurchaseBill"
PURCHASE_BILL_EVENT_KEYS = {"purchase_bill_accrual", "vendor_payable_invoice", "input_tax_credit", "purchase_expense_accrual"}
PURCHASE_BILL_PURPOSE_BY_EVENT = {
    "purchase_bill_accrual": "PURCHASE_BILL_ACCRUAL",
    "vendor_payable_invoice": "VENDOR_PAYABLE_INVOICE",
    "input_tax_credit": "INPUT_TAX_CREDIT",
    "purchase_expense_accrual": "PURCHASE_EXPENSE_ACCRUAL",
}
PURCHASE_BILL_LABEL_BY_EVENT = {
    "purchase_bill_accrual": "Purchase bill accrual",
    "vendor_payable_invoice": "Vendor payable invoice",
    "input_tax_credit": "Input tax credit",
    "purchase_expense_accrual": "Purchase expense accrual",
}
SKIPPED_PURCHASE_BILL_EVENT_KEY = "purchase_bill_skipped_not_applicable"
UNSUPPORTED_PURCHASE_BILL_EVENT_KEY = "unsupported_purchase_bill"
PURCHASE_BILL_SAFETY_TEXT = "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. It does not edit purchase or inventory records."
VENDOR_PAYMENT_SOURCE_MODEL = "VendorPayment"
VENDOR_PAYMENT_EVENT_KEYS = {"vendor_payment", "vendor_payable_settlement", "purchase_bill_payment", "accounts_payable_payment", "supplier_payment"}
VENDOR_PAYMENT_PURPOSE_BY_EVENT = {
    "vendor_payment": "VENDOR_PAYMENT",
    "vendor_payable_settlement": "VENDOR_PAYABLE_SETTLEMENT",
    "purchase_bill_payment": "PURCHASE_BILL_PAYMENT",
    "accounts_payable_payment": "ACCOUNTS_PAYABLE_PAYMENT",
    "supplier_payment": "SUPPLIER_PAYMENT",
}
VENDOR_PAYMENT_LABEL_BY_EVENT = {
    "vendor_payment": "Vendor payment",
    "vendor_payable_settlement": "Vendor payable settlement",
    "purchase_bill_payment": "Purchase bill payment",
    "accounts_payable_payment": "Accounts payable payment",
    "supplier_payment": "Supplier payment",
}
SKIPPED_VENDOR_PAYMENT_EVENT_KEY = "vendor_payment_skipped_not_applicable"
UNSUPPORTED_VENDOR_PAYMENT_EVENT_KEY = "unsupported_vendor_payment"
VENDOR_PAYMENT_SAFETY_TEXT = "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. It does not edit vendor payment, purchase bill, or inventory records."
STOCK_LEDGER_SOURCE_MODEL = "StockLedger"
STOCK_LEDGER_EVENT_KEYS = {
    "inventory_purchase_receive",
    "inventory_adjustment_increase",
    "inventory_adjustment_decrease",
    "inventory_transfer_in",
    "inventory_transfer_out",
    "inventory_writeoff",
    "inventory_return_in",
    "inventory_return_out",
}
STOCK_LEDGER_PURPOSE_BY_EVENT = {key: key.upper() for key in STOCK_LEDGER_EVENT_KEYS}
STOCK_LEDGER_LABEL_BY_EVENT = {
    "inventory_purchase_receive": "Inventory purchase receive",
    "inventory_adjustment_increase": "Inventory adjustment increase",
    "inventory_adjustment_decrease": "Inventory adjustment decrease",
    "inventory_transfer_in": "Inventory transfer in",
    "inventory_transfer_out": "Inventory transfer out",
    "inventory_writeoff": "Inventory writeoff",
    "inventory_return_in": "Inventory return in",
    "inventory_return_out": "Inventory return out",
}
SKIPPED_STOCK_LEDGER_EVENT_KEY = "inventory_skipped_not_applicable"
UNSUPPORTED_STOCK_LEDGER_EVENT_KEY = "unsupported_stockledger"
DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY = "deferred_cogs"
STOCK_LEDGER_SAFETY_TEXT = "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. It does not edit stock ledger, inventory quantity, valuation, purchase bill, or vendor payment records."

BridgeCandidateFilters = base.BridgeCandidateFilters
verify_bridge_reconciliation_item = base.verify_bridge_reconciliation_item


def _purchase_bill_reference(row: PurchaseBill) -> str:
    return row.bill_no or f"PB-{row.id}"


def _vendor_name(row: PurchaseBill) -> str:
    return getattr(row.vendor, "name", None) or getattr(row.vendor, "display_name", None) or getattr(row.vendor, "vendor_name", None) or str(row.vendor)


def _purchase_expense_account() -> ChartOfAccount | None:
    return base._posting_profile_account("PURCHASE_EXPENSE") or base._posting_profile_account("PURCHASE_CLEARING") or base._posting_profile_account("INVENTORY_CLEARING")


def _vendor_payable_account() -> ChartOfAccount | None:
    return base._posting_profile_account("VENDOR_PAYABLE") or base._posting_profile_account("ACCOUNTS_PAYABLE")


def _input_gst_account() -> ChartOfAccount | None:
    return base._posting_profile_account("INPUT_GST")


def _vendor_payment_reference(row: VendorPayment) -> str:
    return row.payment_no or row.reference_no or f"VP-{row.id}"


def _stock_ledger_reference(row: StockLedger) -> str:
    return f"SL-{row.id}"


def _stock_ledger_snapshot(row: StockLedger) -> dict[str, Any]:
    return {
        "inventory_item_id": row.inventory_item_id,
        "movement_type": row.movement_type,
        "quantity_in": row.quantity_in,
        "quantity_out": row.quantity_out,
        "movement_date": row.movement_date,
        "stock_location_id": row.stock_location_id,
        "reference_model": row.reference_model,
        "reference_id": row.reference_id,
        "warehouse_name": row.warehouse_name,
        "notes": row.notes,
        "posted_journal_entry_id": row.posted_journal_entry_id,
    }


def _inventory_item_snapshot(row: InventoryItem) -> dict[str, Any]:
    return {
        "opening_stock_qty": row.opening_stock_qty,
        "standard_unit_cost": row.standard_unit_cost,
        "purchase_unit_cost": row.purchase_unit_cost,
        "stock_tracking_status": row.stock_tracking_status,
        "valuation_method": row.valuation_method,
        "costing_method": row.costing_method,
    }


def _stock_ledger_ref_pk(row: StockLedger) -> int | None:
    raw = str(row.reference_id or "").split(":", 1)[-1]
    return int(raw) if raw.isdigit() else None


def _stock_ledger_source_cost(row: StockLedger) -> tuple[Decimal | None, Decimal | None, str | None]:
    ref_pk = _stock_ledger_ref_pk(row)
    if ref_pk is None:
        return None, None, "StockLedger reference_id is not a resolvable concrete source id."
    if row.reference_model == "StockAdjustmentLine":
        line = StockAdjustmentLine.objects.filter(pk=ref_pk).only("unit_cost_snapshot", "valuation_amount_snapshot").first()
        if line and line.unit_cost_snapshot is not None and line.valuation_amount_snapshot is not None:
            return base._money(line.unit_cost_snapshot), base._money(line.valuation_amount_snapshot), None
        return None, None, "StockAdjustmentLine cost snapshots are missing; valuation cannot be guessed."
    if row.reference_model == "OpeningStockEntry":
        entry = OpeningStockEntry.objects.filter(pk=ref_pk).only("unit_cost_snapshot", "valuation_amount_snapshot").first()
        if entry and entry.unit_cost_snapshot is not None and entry.valuation_amount_snapshot is not None:
            return base._money(entry.unit_cost_snapshot), base._money(entry.valuation_amount_snapshot), None
        return None, None, "OpeningStockEntry cost snapshots are missing; valuation cannot be guessed."
    if row.reference_model == "GoodsReceiptLine":
        line = GoodsReceiptLine.objects.filter(pk=ref_pk).only("unit_cost", "quantity_received").first()
        if line:
            return base._money(line.unit_cost), base._money(line.unit_cost * line.quantity_received), None
    if row.reference_model == "PurchaseBillLine":
        line = PurchaseBillLine.objects.filter(pk=ref_pk).only("unit_cost", "quantity").first()
        if line:
            return base._money(line.unit_cost), base._money(line.unit_cost * line.quantity), None
    if row.reference_model == "VendorBillLine":
        line = VendorBillLine.objects.filter(pk=ref_pk).only("unit_cost", "quantity").first()
        if line:
            return base._money(line.unit_cost), base._money(line.unit_cost * line.quantity), None
    return None, None, "StockLedger row has no reliable source valuation fields for accounting bridge posting."


def _inventory_asset_account() -> ChartOfAccount | None:
    return base._posting_profile_account("INVENTORY_ASSET")


def _inventory_clearing_account() -> ChartOfAccount | None:
    return base._posting_profile_account("PURCHASE_CLEARING") or base._posting_profile_account("INVENTORY_CLEARING")


def _inventory_adjustment_gain_account() -> ChartOfAccount | None:
    return base._posting_profile_account("INVENTORY_ADJUSTMENT_GAIN") or base._posting_profile_account("STOCK_ADJUSTMENT_INCOME") or base._posting_profile_account("INVENTORY_ADJUSTMENT")


def _inventory_adjustment_loss_account() -> ChartOfAccount | None:
    return base._posting_profile_account("INVENTORY_ADJUSTMENT_LOSS") or base._posting_profile_account("STOCK_ADJUSTMENT_EXPENSE") or base._posting_profile_account("INVENTORY_ADJUSTMENT")


def _inventory_writeoff_account() -> ChartOfAccount | None:
    return base._posting_profile_account("INVENTORY_WRITEOFF_EXPENSE") or base._posting_profile_account("STOCK_LOSS") or _inventory_adjustment_loss_account()


def _classify_stock_ledger_event(row: StockLedger) -> tuple[str, str, str | None]:
    movement = row.movement_type
    if movement in {StockMovementType.PURCHASE_IN, StockMovementType.PURCHASE_RECEIVE}:
        return "inventory_purchase_receive", STOCK_LEDGER_LABEL_BY_EVENT["inventory_purchase_receive"], None
    if movement == StockMovementType.ADJUSTMENT_IN:
        return "inventory_adjustment_increase", STOCK_LEDGER_LABEL_BY_EVENT["inventory_adjustment_increase"], None
    if movement == StockMovementType.ADJUSTMENT_OUT:
        return "inventory_adjustment_decrease", STOCK_LEDGER_LABEL_BY_EVENT["inventory_adjustment_decrease"], None
    if movement == StockMovementType.DAMAGE:
        return "inventory_writeoff", STOCK_LEDGER_LABEL_BY_EVENT["inventory_writeoff"], None
    if movement == StockMovementType.TRANSFER_IN:
        return SKIPPED_STOCK_LEDGER_EVENT_KEY, "Stock transfer skipped", "Same-entity stock transfers have no accounting impact in this phase."
    if movement == StockMovementType.TRANSFER_OUT:
        return SKIPPED_STOCK_LEDGER_EVENT_KEY, "Stock transfer skipped", "Same-entity stock transfers have no accounting impact in this phase."
    if movement in {StockMovementType.SALE_OUT, StockMovementType.EMI_DELIVERY_OUT, StockMovementType.DELIVERY_OUT}:
        return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", "COGS posting is deferred because this StockLedger movement does not safely expose finalized sale/delivery cost metadata."
    if movement in {StockMovementType.EMI_RETURN_IN, StockMovementType.CUSTOMER_RETURN, StockMovementType.SALE_RETURN_IN}:
        return "inventory_return_in", STOCK_LEDGER_LABEL_BY_EVENT["inventory_return_in"], None
    if movement in {StockMovementType.PURCHASE_RETURN_OUT, StockMovementType.VENDOR_RETURN}:
        return "inventory_return_out", STOCK_LEDGER_LABEL_BY_EVENT["inventory_return_out"], None
    return UNSUPPORTED_STOCK_LEDGER_EVENT_KEY, "Unsupported StockLedger movement", "StockLedger movement type cannot be safely classified for Phase F8 bridge posting."


def _stock_ledger_lines(row: StockLedger, event_key: str) -> tuple[list[dict[str, Any]], list[str], FinanceAccount | None]:
    warnings: list[str] = []
    if event_key not in STOCK_LEDGER_EVENT_KEYS:
        return [], ["Unsupported StockLedger event for Phase F8."], None
    unit_cost, amount, value_reason = _stock_ledger_source_cost(row)
    if amount is None or amount <= Decimal("0.00"):
        return [], [value_reason or "StockLedger amount/value must be greater than zero."], None
    asset = _inventory_asset_account()
    if asset is None:
        warnings.append("INVENTORY_ASSET posting profile/chart account is missing or inactive.")
    reference = _stock_ledger_reference(row)
    if event_key == "inventory_purchase_receive":
        clearing = _inventory_clearing_account()
        if clearing is None:
            warnings.append("PURCHASE_CLEARING / INVENTORY_CLEARING posting profile/chart account is missing or inactive.")
        if warnings:
            return [], warnings, None
        return [
            {"chart_account": asset, "description": f"Inventory receive {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
            {"chart_account": clearing, "description": f"Inventory clearing {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
        ], warnings, None
    if event_key == "inventory_adjustment_increase":
        gain = _inventory_adjustment_gain_account()
        if gain is None:
            warnings.append("Inventory adjustment gain/income account is missing or inactive.")
        if warnings:
            return [], warnings, None
        return [
            {"chart_account": asset, "description": f"Inventory adjustment increase {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
            {"chart_account": gain, "description": f"Stock adjustment income {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
        ], warnings, None
    if event_key in {"inventory_adjustment_decrease", "inventory_return_out"}:
        loss = _inventory_adjustment_loss_account()
        if loss is None:
            warnings.append("Inventory adjustment loss/expense account is missing or inactive.")
        if warnings:
            return [], warnings, None
        return [
            {"chart_account": loss, "description": f"Inventory decrease {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
            {"chart_account": asset, "description": f"Inventory asset reduction {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
        ], warnings, None
    if event_key == "inventory_writeoff":
        writeoff = _inventory_writeoff_account()
        if writeoff is None:
            warnings.append("Inventory writeoff/stock loss account is missing or inactive.")
        if warnings:
            return [], warnings, None
        return [
            {"chart_account": writeoff, "description": f"Inventory writeoff {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
            {"chart_account": asset, "description": f"Inventory asset writeoff {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
        ], warnings, None
    if event_key == "inventory_return_in":
        gain = _inventory_adjustment_gain_account()
        if gain is None:
            warnings.append("Inventory return clearing/gain account is missing or inactive.")
        if warnings:
            return [], warnings, None
        return [
            {"chart_account": asset, "description": f"Inventory return in {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
            {"chart_account": gain, "description": f"Inventory return clearing {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
        ], warnings, None
    return [], ["Transfer movements are not postable in this phase."], None


def _vendor_payment_snapshot(row: VendorPayment) -> dict[str, Any]:
    return {
        "payment_no": row.payment_no,
        "payment_date": row.payment_date,
        "vendor_id": row.vendor_id,
        "vendor_bill_id": row.vendor_bill_id,
        "amount": row.amount,
        "finance_account_id": row.finance_account_id,
        "status": row.status,
        "posted_journal_entry_id": row.posted_journal_entry_id,
        "reference_no": row.reference_no,
        "notes": row.notes,
    }


def _classify_purchase_bill_event(row: PurchaseBill) -> tuple[str, str, str | None]:
    if row.status in {PurchaseBillStatus.DRAFT, PurchaseBillStatus.CANCELLED}:
        return SKIPPED_PURCHASE_BILL_EVENT_KEY, "Purchase bill skipped", "Draft/cancelled purchase bills are skipped from controlled bridge posting."
    if row.status == PurchaseBillStatus.POSTED and not AccountingBridgePosting.objects.filter(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=str(row.id)).exists():
        return SKIPPED_PURCHASE_BILL_EVENT_KEY, "Purchase bill skipped", "Legacy posted purchase bills are not F6 bridge-postable because the legacy path may already have updated stock/status/journal state."
    if row.status not in {PurchaseBillStatus.APPROVED, PurchaseBillStatus.POSTED}:
        return UNSUPPORTED_PURCHASE_BILL_EVENT_KEY, "Unsupported purchase bill", "PurchaseBill status cannot be safely classified for bridge posting."
    # The model has inventory-linked lines but no expense-type discriminator. F6 posts only payable/accrual side.
    return "purchase_bill_accrual", PURCHASE_BILL_LABEL_BY_EVENT["purchase_bill_accrual"], None


def _purchase_bill_lines(row: PurchaseBill, event_key: str) -> tuple[list[dict[str, Any]], list[str], FinanceAccount | None]:
    warnings: list[str] = []
    if event_key not in PURCHASE_BILL_EVENT_KEYS:
        return [], ["Unsupported PurchaseBill event for Phase F6."], None
    amount = base._money(row.grand_total)
    taxable = base._money(row.subtotal)
    tax = base._money(row.tax_total)
    if amount <= Decimal("0.00"):
        warnings.append("PurchaseBill grand_total must be greater than zero.")
    if taxable <= Decimal("0.00"):
        warnings.append("PurchaseBill subtotal/taxable amount cannot be resolved safely.")
    debit_account = _purchase_expense_account()
    payable_account = _vendor_payable_account()
    input_gst_account = _input_gst_account() if tax > Decimal("0.00") else None
    if debit_account is None:
        warnings.append("PURCHASE_EXPENSE / PURCHASE_CLEARING / INVENTORY_CLEARING posting profile/chart account is missing or inactive.")
    if payable_account is None:
        warnings.append("VENDOR_PAYABLE / ACCOUNTS_PAYABLE posting profile/chart account is missing or inactive.")
    if tax > Decimal("0.00") and input_gst_account is None:
        warnings.append("INPUT_GST posting profile/chart account is missing or inactive for taxable purchase bill.")
    if warnings:
        return [], warnings, None
    lines = [
        {"chart_account": debit_account, "description": f"Purchase accrual {_purchase_bill_reference(row)}", "debit_amount": taxable, "credit_amount": Decimal("0.00")},
    ]
    if tax > Decimal("0.00"):
        lines.append({"chart_account": input_gst_account, "description": f"Input GST {_purchase_bill_reference(row)}", "debit_amount": tax, "credit_amount": Decimal("0.00")})
    lines.append({"chart_account": payable_account, "description": f"Vendor payable {_purchase_bill_reference(row)}", "debit_amount": Decimal("0.00"), "credit_amount": amount})
    return lines, warnings, None


def _classify_vendor_payment_event(row: VendorPayment) -> tuple[str, str, str | None]:
    if row.status == VendorPaymentStatus.CANCELLED:
        return SKIPPED_VENDOR_PAYMENT_EVENT_KEY, "Vendor payment skipped", "Cancelled vendor payments are skipped from controlled bridge posting."
    if row.status == VendorPaymentStatus.POSTED and not AccountingBridgePosting.objects.filter(source_model=VENDOR_PAYMENT_SOURCE_MODEL, source_id=str(row.id)).exists():
        return SKIPPED_VENDOR_PAYMENT_EVENT_KEY, "Vendor payment skipped", "Legacy posted vendor payments are not F7 bridge-postable because the legacy path may already have updated source status/journal/vendor ledger."
    if row.status not in {VendorPaymentStatus.DRAFT, VendorPaymentStatus.POSTED}:
        return UNSUPPORTED_VENDOR_PAYMENT_EVENT_KEY, "Unsupported vendor payment", "VendorPayment status cannot be safely classified for bridge posting."
    if row.vendor_bill_id:
        return "purchase_bill_payment", VENDOR_PAYMENT_LABEL_BY_EVENT["purchase_bill_payment"], None
    return "vendor_payment", VENDOR_PAYMENT_LABEL_BY_EVENT["vendor_payment"], None


def _vendor_payment_lines(row: VendorPayment, event_key: str) -> tuple[list[dict[str, Any]], list[str], FinanceAccount | None]:
    warnings: list[str] = []
    if event_key not in VENDOR_PAYMENT_EVENT_KEYS:
        return [], ["Unsupported VendorPayment event for Phase F7."], None
    amount = base._money(row.amount)
    if amount <= Decimal("0.00"):
        warnings.append("VendorPayment amount must be greater than zero.")
    payable_account = _vendor_payable_account()
    finance_account = row.finance_account
    if payable_account is None:
        warnings.append("VENDOR_PAYABLE / ACCOUNTS_PAYABLE posting profile/chart account is missing or inactive.")
    if finance_account is None:
        warnings.append("VendorPayment finance account is missing.")
    elif not finance_account.is_active:
        warnings.append("VendorPayment finance account is inactive.")
    elif not finance_account.chart_account_id or not finance_account.chart_account.is_active:
        warnings.append("VendorPayment finance account chart account is missing or inactive.")
    if warnings:
        return [], warnings, finance_account
    reference = _vendor_payment_reference(row)
    return [
        {"chart_account": payable_account, "description": f"Vendor payable settlement {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
        {"chart_account": finance_account.chart_account, "description": f"Vendor payment {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
    ], warnings, finance_account


def _purchase_bridge_for(row: PurchaseBill, event_key: str):
    return base._existing_bridge_for(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=str(row.id), purpose=PURCHASE_BILL_PURPOSE_BY_EVENT.get(event_key, event_key.upper()))


def purchase_bill_candidate(row: PurchaseBill) -> dict[str, Any]:
    event_key, event_label, reason = _classify_purchase_bill_event(row)
    purpose = PURCHASE_BILL_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    bridge = _purchase_bridge_for(row, event_key)
    journal = bridge.journal_entry if bridge else None
    item = base._latest_posting_reconciliation_item(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=str(row.id)) if journal else base._latest_reconciliation_item(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=str(row.id))
    period = getattr(journal, "accounting_period", None) or base._source_period(row.bill_date)
    lines, warnings, finance_account = _purchase_bill_lines(row, event_key) if event_key in PURCHASE_BILL_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_PURCHASE_BILL_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_PURCHASE_BILL_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = base._candidate_status_payload(event_key=event_key, event_label=event_label, module="inventory", source_model=PURCHASE_BILL_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=row.bill_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in PURCHASE_BILL_EVENT_KEYS, classification_reason=reason)
    payload = base._candidate_payload(candidate_id=base._candidate_id(source_model=PURCHASE_BILL_SOURCE_MODEL, source_pk=row.id, event_key=event_key), event_key=event_key, event_label=event_label, module="inventory", source_model=PURCHASE_BILL_SOURCE_MODEL, source_pk=row.id, source_display=f"Purchase bill {_purchase_bill_reference(row)}", source_reference=_purchase_bill_reference(row), source_date=row.bill_date, amount=row.grand_total, taxable_amount=row.subtotal, tax_amount=row.tax_total, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:PurchaseBill:{row.id}:{row.bill_date.isoformat()}:{base._money(row.grand_total):.2f}", source_status=row.status, source_type=row.tax_mode)
    payload.update({"purchase_bill_number": row.bill_no, "purchase_bill_status": row.status, "vendor_name": _vendor_name(row), "vendor_id": row.vendor_id, "source_module": "inventory"})
    return payload


def _vendor_payment_bridge_for(row: VendorPayment, event_key: str):
    return base._existing_bridge_for(source_model=VENDOR_PAYMENT_SOURCE_MODEL, source_id=str(row.id), purpose=VENDOR_PAYMENT_PURPOSE_BY_EVENT.get(event_key, event_key.upper()))


def vendor_payment_candidate(row: VendorPayment) -> dict[str, Any]:
    event_key, event_label, reason = _classify_vendor_payment_event(row)
    purpose = VENDOR_PAYMENT_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    bridge = _vendor_payment_bridge_for(row, event_key)
    journal = bridge.journal_entry if bridge else None
    item = base._latest_posting_reconciliation_item(source_model=VENDOR_PAYMENT_SOURCE_MODEL, source_id=str(row.id)) if journal else base._latest_reconciliation_item(source_model=VENDOR_PAYMENT_SOURCE_MODEL, source_id=str(row.id))
    period = getattr(journal, "accounting_period", None) or base._source_period(row.payment_date)
    lines, warnings, finance_account = _vendor_payment_lines(row, event_key) if event_key in VENDOR_PAYMENT_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_VENDOR_PAYMENT_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_VENDOR_PAYMENT_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = base._candidate_status_payload(event_key=event_key, event_label=event_label, module="inventory", source_model=VENDOR_PAYMENT_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=row.payment_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in VENDOR_PAYMENT_EVENT_KEYS, classification_reason=reason)
    reference = _vendor_payment_reference(row)
    payload = base._candidate_payload(candidate_id=base._candidate_id(source_model=VENDOR_PAYMENT_SOURCE_MODEL, source_pk=row.id, event_key=event_key), event_key=event_key, event_label=event_label, module="inventory", source_model=VENDOR_PAYMENT_SOURCE_MODEL, source_pk=row.id, source_display=f"Vendor payment {reference}", source_reference=reference, source_date=row.payment_date, amount=row.amount, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:VendorPayment:{row.id}:{row.payment_date.isoformat()}:{base._money(row.amount):.2f}", source_status=row.status, source_type="VENDOR_PAYMENT")
    payload.update({
        "vendor_payment_number": row.payment_no,
        "vendor_payment_status": row.status,
        "vendor_payment_reference": row.reference_no,
        "vendor_name": _vendor_name(row),
        "vendor_id": row.vendor_id,
        "purchase_bill_number": getattr(row.vendor_bill, "bill_no", None),
        "payment_method": getattr(row.finance_account, "kind", None),
        "finance_account_name": getattr(row.finance_account, "name", None),
        "source_module": "inventory",
    })
    return payload


def _stock_ledger_bridge_for(row: StockLedger, event_key: str):
    return base._existing_bridge_for(source_model=STOCK_LEDGER_SOURCE_MODEL, source_id=str(row.id), purpose=STOCK_LEDGER_PURPOSE_BY_EVENT.get(event_key, event_key.upper()))


def stock_ledger_candidate(row: StockLedger) -> dict[str, Any]:
    event_key, event_label, reason = _classify_stock_ledger_event(row)
    purpose = STOCK_LEDGER_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    bridge = _stock_ledger_bridge_for(row, event_key)
    journal = bridge.journal_entry if bridge else None
    item = base._latest_posting_reconciliation_item(source_model=STOCK_LEDGER_SOURCE_MODEL, source_id=str(row.id)) if journal else base._latest_reconciliation_item(source_model=STOCK_LEDGER_SOURCE_MODEL, source_id=str(row.id))
    period = getattr(journal, "accounting_period", None) or base._source_period(row.movement_date)
    lines, warnings, finance_account = _stock_ledger_lines(row, event_key) if event_key in STOCK_LEDGER_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_STOCK_LEDGER_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key in {UNSUPPORTED_STOCK_LEDGER_EVENT_KEY, DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY} else "READY" if lines else "NOT_CONFIGURED"
    postability = base._candidate_status_payload(event_key=event_key, event_label=event_label, module="inventory", source_model=STOCK_LEDGER_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=row.movement_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in STOCK_LEDGER_EVENT_KEYS, classification_reason=reason, approval_required=False)
    unit_cost, amount, value_reason = _stock_ledger_source_cost(row)
    quantity = row.quantity_in if row.quantity_in > Decimal("0.000") else row.quantity_out
    source_reference = _stock_ledger_reference(row)
    item_name = getattr(getattr(row.inventory_item, "product", None), "name", None) or str(row.inventory_item)
    location_name = getattr(row.stock_location, "name", None) or row.warehouse_name or ""
    payload = base._candidate_payload(candidate_id=base._candidate_id(source_model=STOCK_LEDGER_SOURCE_MODEL, source_pk=row.id, event_key=event_key), event_key=event_key, event_label=event_label, module="inventory", source_model=STOCK_LEDGER_SOURCE_MODEL, source_pk=row.id, source_display=f"StockLedger {source_reference}", source_reference=source_reference, source_date=row.movement_date, amount=amount or Decimal("0.00"), lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:StockLedger:{row.id}:{row.movement_date.isoformat()}:{base._money(amount or Decimal('0.00')):.2f}", source_status=None, source_type=row.movement_type)
    payload.update({
        "stock_ledger_id": row.id,
        "stock_ledger_reference": source_reference,
        "movement_type": row.movement_type,
        "movement_date": row.movement_date.isoformat(),
        "quantity": f"{quantity:.3f}",
        "quantity_in": f"{row.quantity_in:.3f}",
        "quantity_out": f"{row.quantity_out:.3f}",
        "unit_cost": f"{unit_cost:.2f}" if unit_cost is not None else None,
        "amount": f"{base._money(amount or Decimal('0.00')):.2f}",
        "value_blocker_reason": value_reason,
        "inventory_item_id": row.inventory_item_id,
        "item_name": item_name,
        "product_name": item_name,
        "product_code": getattr(getattr(row.inventory_item, "product", None), "product_code", None),
        "stock_location_id": row.stock_location_id,
        "stock_location_name": location_name,
        "branch_id": getattr(row.stock_location, "branch_id", None),
        "branch_name": getattr(getattr(row.stock_location, "branch", None), "name", None),
        "reference_model": row.reference_model,
        "reference_id": row.reference_id,
        "source_module": "inventory",
    })
    return payload


def _purchase_queryset(filters: BridgeCandidateFilters):
    qs = PurchaseBill.objects.select_related("vendor", "branch", "stock_location", "finance_account", "finance_account__chart_account")
    return base._date_filter_qs(qs, filters, date_field="bill_date")


def _vendor_payment_queryset(filters: BridgeCandidateFilters):
    qs = VendorPayment.objects.select_related("vendor", "vendor_bill", "finance_account", "finance_account__chart_account", "finance_account__branch")
    return base._date_filter_qs(qs, filters, date_field="payment_date")


def _stock_ledger_queryset(filters: BridgeCandidateFilters):
    qs = StockLedger.objects.select_related("inventory_item", "inventory_item__product", "stock_location", "stock_location__branch")
    return base._date_filter_qs(qs, filters, date_field="movement_date")


def list_bridge_candidates(filters: BridgeCandidateFilters | None = None) -> list[dict[str, Any]]:
    active_filters = filters or BridgeCandidateFilters()
    requested_model = (active_filters.source_model or "").strip()
    rows: list[dict[str, Any]] = []
    if requested_model != PURCHASE_BILL_SOURCE_MODEL:
        rows.extend(base.list_bridge_candidates(active_filters))
    if requested_model in {"", PURCHASE_BILL_SOURCE_MODEL} and (not active_filters.module or active_filters.module in {"inventory", "purchase"}):
        qs = _purchase_queryset(active_filters)
        rows.extend(purchase_bill_candidate(item) for item in qs.order_by("-bill_date", "-id")[:500])
    if requested_model in {"", VENDOR_PAYMENT_SOURCE_MODEL} and (not active_filters.module or active_filters.module in {"inventory", "purchase"}):
        qs = _vendor_payment_queryset(active_filters)
        rows.extend(vendor_payment_candidate(item) for item in qs.order_by("-payment_date", "-id")[:500])
    if requested_model in {"", STOCK_LEDGER_SOURCE_MODEL} and (not active_filters.module or active_filters.module == "inventory"):
        qs = _stock_ledger_queryset(active_filters)
        rows.extend(stock_ledger_candidate(item) for item in qs.order_by("-movement_date", "-id")[:500])
    if active_filters.event_key:
        rows = [row for row in rows if row["event_key"] == active_filters.event_key]
    if active_filters.status:
        rows = [row for row in rows if row["status"] == active_filters.status or row.get("reconciliation_state") == active_filters.status]
    rows.sort(key=lambda row: (row.get("source_date") or "", str(row.get("source_id") or "")), reverse=True)
    return rows


def get_bridge_candidate(candidate_id: str, *, for_update: bool = False) -> dict[str, Any]:
    source_kind, source_pk, event_key = base._parse_candidate_id(candidate_id)
    if source_kind != "purchasebill":
        if source_kind == "stockledger":
            qs = StockLedger.objects.select_related("inventory_item", "inventory_item__product", "stock_location", "stock_location__branch")
            if for_update:
                qs = qs.select_for_update()
            candidate = stock_ledger_candidate(qs.get(pk=source_pk))
            if candidate["event_key"] != event_key:
                raise ValueError("StockLedger candidate event no longer matches current source state.")
            return candidate
        if source_kind == "vendorpayment":
            qs = VendorPayment.objects.select_related("vendor", "vendor_bill", "finance_account", "finance_account__chart_account", "finance_account__branch")
            if for_update:
                qs = qs.select_for_update()
            candidate = vendor_payment_candidate(qs.get(pk=source_pk))
            if candidate["event_key"] != event_key:
                raise ValueError("VendorPayment candidate event no longer matches current source state.")
            return candidate
        return base.get_bridge_candidate(candidate_id, for_update=for_update)
    qs = PurchaseBill.objects.select_related("vendor", "branch", "stock_location", "finance_account", "finance_account__chart_account")
    if for_update:
        qs = qs.select_for_update()
    candidate = purchase_bill_candidate(qs.get(pk=source_pk))
    if candidate["event_key"] != event_key:
        raise ValueError("PurchaseBill candidate event no longer matches current source state.")
    return candidate


def _lines_for_candidate(candidate: dict[str, Any]):
    if candidate["source_model"] != PURCHASE_BILL_SOURCE_MODEL:
        if candidate["source_model"] == STOCK_LEDGER_SOURCE_MODEL:
            row = StockLedger.objects.select_related("inventory_item", "inventory_item__product", "stock_location").get(pk=candidate["source_id"])
            return _stock_ledger_lines(row, candidate["event_key"])
        if candidate["source_model"] == VENDOR_PAYMENT_SOURCE_MODEL:
            row = VendorPayment.objects.select_related("vendor", "vendor_bill", "finance_account", "finance_account__chart_account").get(pk=candidate["source_id"])
            return _vendor_payment_lines(row, candidate["event_key"])
        return base._lines_for_candidate(candidate)
    row = PurchaseBill.objects.select_related("vendor", "finance_account", "finance_account__chart_account").get(pk=candidate["source_id"])
    return _purchase_bill_lines(row, candidate["event_key"])


def preview_bridge_candidate(candidate_id: str) -> dict[str, Any]:
    candidate = get_bridge_candidate(candidate_id)
    if candidate.get("source_model") != PURCHASE_BILL_SOURCE_MODEL:
        if candidate.get("source_model") == STOCK_LEDGER_SOURCE_MODEL:
            lines, warnings, _finance_account = _lines_for_candidate(candidate)
            blockers = []
            if not candidate["can_post"]:
                blockers.append(candidate["blocker_reason"] or "Candidate is not postable.")
            try:
                sequence = validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, date.fromisoformat(candidate["source_date"]))
                journal_number_preview = preview_document_number(sequence=sequence)
            except DocumentNumberingSetupError as exc:
                journal_number_preview = None
                blockers.append(str(exc))
            total_debit, total_credit = base._line_totals(lines)
            return {"candidate": candidate, "candidate_id": candidate_id, "source": {"model": STOCK_LEDGER_SOURCE_MODEL, "pk": candidate.get("source_pk") or candidate["source_id"], "display": candidate["source_display"], "reference_number": candidate["source_reference_number"], "date": candidate["source_date"], "amount": candidate["amount"], "source_status": candidate.get("source_status"), "source_type": candidate.get("source_type"), "stock_ledger_id": candidate.get("stock_ledger_id"), "movement_type": candidate.get("movement_type"), "movement_date": candidate.get("movement_date"), "item_name": candidate.get("item_name"), "product_name": candidate.get("product_name"), "stock_location_name": candidate.get("stock_location_name"), "branch_name": candidate.get("branch_name"), "quantity": candidate.get("quantity"), "unit_cost": candidate.get("unit_cost"), "reference_model": candidate.get("reference_model"), "reference_id": candidate.get("reference_id")}, "journal_date": candidate["source_date"], "accounting_period": candidate["accounting_period"], "journal_number_preview": journal_number_preview, "debit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if base._money(line.get("debit_amount")) > 0], "credit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if base._money(line.get("credit_amount")) > 0], "lines": base._preview_lines(lines), "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "is_balanced": bool(lines and total_debit == total_credit), "tax_lines": [], "finance_account_line": candidate.get("finance_account"), "warnings": warnings, "blockers": list(dict.fromkeys([item for item in blockers if item])), "can_post": bool(candidate["can_post"] and lines and total_debit == total_credit and not blockers), "idempotency_key": candidate["idempotency_key"], "safety_text": STOCK_LEDGER_SAFETY_TEXT}
        if candidate.get("source_model") == VENDOR_PAYMENT_SOURCE_MODEL:
            lines, warnings, _finance_account = _lines_for_candidate(candidate)
            blockers = []
            if not candidate["can_post"]:
                blockers.append(candidate["blocker_reason"] or "Candidate is not postable.")
            try:
                sequence = validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, date.fromisoformat(candidate["source_date"]))
                journal_number_preview = preview_document_number(sequence=sequence)
            except DocumentNumberingSetupError as exc:
                journal_number_preview = None
                blockers.append(str(exc))
            total_debit, total_credit = base._line_totals(lines)
            return {"candidate": candidate, "candidate_id": candidate_id, "source": {"model": VENDOR_PAYMENT_SOURCE_MODEL, "pk": candidate.get("source_pk") or candidate["source_id"], "display": candidate["source_display"], "reference_number": candidate["source_reference_number"], "date": candidate["source_date"], "amount": candidate["amount"], "source_status": candidate.get("source_status"), "source_type": candidate.get("source_type"), "vendor_payment_number": candidate.get("vendor_payment_number"), "vendor_name": candidate.get("vendor_name"), "purchase_bill_number": candidate.get("purchase_bill_number"), "payment_method": candidate.get("payment_method"), "finance_account_name": candidate.get("finance_account_name")}, "journal_date": candidate["source_date"], "accounting_period": candidate["accounting_period"], "journal_number_preview": journal_number_preview, "debit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if base._money(line.get("debit_amount")) > 0], "credit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if base._money(line.get("credit_amount")) > 0], "lines": base._preview_lines(lines), "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "is_balanced": bool(lines and total_debit == total_credit), "tax_lines": [], "finance_account_line": candidate.get("finance_account"), "warnings": warnings, "blockers": list(dict.fromkeys([item for item in blockers if item])), "can_post": bool(candidate["can_post"] and lines and total_debit == total_credit and not blockers), "idempotency_key": candidate["idempotency_key"], "safety_text": VENDOR_PAYMENT_SAFETY_TEXT}
        return base.preview_bridge_candidate(candidate_id)
    lines, warnings, _finance_account = _lines_for_candidate(candidate)
    blockers = []
    if not candidate["can_post"]:
        blockers.append(candidate["blocker_reason"] or "Candidate is not postable.")
    try:
        sequence = validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, date.fromisoformat(candidate["source_date"]))
        journal_number_preview = preview_document_number(sequence=sequence)
    except DocumentNumberingSetupError as exc:
        journal_number_preview = None
        blockers.append(str(exc))
    total_debit, total_credit = base._line_totals(lines)
    tax_lines = [base._line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount"), credit=line.get("credit_amount")) for line in lines if getattr(line.get("chart_account"), "system_code", "") == "INPUT_GST"]
    return {"candidate": candidate, "candidate_id": candidate_id, "source": {"model": PURCHASE_BILL_SOURCE_MODEL, "pk": candidate.get("source_pk") or candidate["source_id"], "display": candidate["source_display"], "reference_number": candidate["source_reference_number"], "date": candidate["source_date"], "amount": candidate["amount"], "source_status": candidate.get("source_status"), "source_type": candidate.get("source_type"), "purchase_bill_number": candidate.get("purchase_bill_number"), "vendor_name": candidate.get("vendor_name"), "taxable_amount": candidate.get("taxable_amount"), "tax_amount": candidate.get("tax_amount")}, "journal_date": candidate["source_date"], "accounting_period": candidate["accounting_period"], "journal_number_preview": journal_number_preview, "debit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if base._money(line.get("debit_amount")) > 0], "credit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if base._money(line.get("credit_amount")) > 0], "lines": base._preview_lines(lines), "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "is_balanced": bool(lines and total_debit == total_credit), "tax_lines": tax_lines, "finance_account_line": candidate.get("finance_account"), "warnings": warnings, "blockers": list(dict.fromkeys([item for item in blockers if item])), "can_post": bool(candidate["can_post"] and lines and total_debit == total_credit and not blockers), "idempotency_key": candidate["idempotency_key"], "safety_text": PURCHASE_BILL_SAFETY_TEXT}


@transaction.atomic
def post_bridge_candidate(*, candidate_id: str, idempotency_key: str, confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    candidate = get_bridge_candidate(candidate_id, for_update=True)
    if candidate.get("source_model") != PURCHASE_BILL_SOURCE_MODEL:
        if candidate.get("source_model") == STOCK_LEDGER_SOURCE_MODEL:
            if not confirmed:
                raise ValueError("Explicit confirmation is required before posting.")
            key = (idempotency_key or "").strip()
            if not key:
                raise ValueError("idempotency_key is required.")
            if candidate["event_key"] not in STOCK_LEDGER_EVENT_KEYS:
                raise ValueError("Unsupported bridge candidate source.")
            purpose = STOCK_LEDGER_PURPOSE_BY_EVENT[candidate["event_key"]]
            existing = AccountingBridgePosting.objects.select_for_update().filter(source_model=STOCK_LEDGER_SOURCE_MODEL, source_id=candidate["source_id"], purpose=purpose).select_related("journal_entry").first()
            if existing is not None:
                existing_key = ((existing.trace_metadata or {}).get("idempotency_key") or "").strip()
                if existing_key and existing_key == key:
                    return {"posted": False, "already_posted": True, "journal_entry": base._journal_payload(existing.journal_entry), "reconciliation_item": base._reconciliation_payload(base._latest_posting_reconciliation_item(source_model=STOCK_LEDGER_SOURCE_MODEL, source_id=candidate["source_id"])), "next_action": "Run reconciliation checks and verify the pending bridge item."}
                raise ValueError("This source item has already been posted with a different or legacy idempotency key.")
            if candidate["idempotency_key"] != key:
                raise ValueError("idempotency_key does not match the current source candidate.")
            preview = preview_bridge_candidate(candidate_id)
            if not preview["can_post"]:
                raise ValueError("; ".join(preview["blockers"]) or "Candidate is not postable.")
            row = StockLedger.objects.select_for_update().select_related("inventory_item", "inventory_item__product", "stock_location", "stock_location__branch").get(pk=candidate["source_id"])
            source_before = _stock_ledger_snapshot(row)
            item_before = _inventory_item_snapshot(row.inventory_item)
            lines, _warnings, finance_account = _lines_for_candidate(candidate)
            total_debit, total_credit = base._line_totals(lines)
            if not lines or total_debit != total_credit:
                raise ValueError("Bridge posting preview is not balanced.")
            journal, created = post_bridge_entry(source_instance=row, purpose=purpose, entry_date=row.movement_date, memo=f"Bridge posting StockLedger {row.id} {candidate['event_key']}", lines=lines, voucher_type=purpose, source_type="STOCK_LEDGER", source_reference=_stock_ledger_reference(row), source_document_no=_stock_ledger_reference(row), source_event_date=row.movement_date, trace_metadata={"event_key": candidate["event_key"], "idempotency_key": key, "posting_note": posting_note, "source_model": STOCK_LEDGER_SOURCE_MODEL, "source_id": candidate["source_id"], "inventory_item_id": row.inventory_item_id, "stock_location_id": row.stock_location_id, "branch_id": getattr(row.stock_location, "branch_id", None), "movement_type": row.movement_type, "quantity": candidate.get("quantity"), "unit_cost": candidate.get("unit_cost"), "amount": candidate["amount"], "reference_model": row.reference_model, "reference_id": row.reference_id, "stock_ledger_mutation": False, "inventory_item_mutation": False, "quantity_mutation": False, "valuation_mutation": False, "purchase_bill_mutation": False, "vendor_payment_mutation": False, "cogs_posting": False}, posted_by=actor)
            row.refresh_from_db()
            row.inventory_item.refresh_from_db()
            if _stock_ledger_snapshot(row) != source_before:
                raise ValueError("StockLedger source mutation detected; bridge posting rolled back.")
            if _inventory_item_snapshot(row.inventory_item) != item_before:
                raise ValueError("InventoryItem mutation detected; bridge posting rolled back.")
            item = base._latest_posting_reconciliation_item(source_model=STOCK_LEDGER_SOURCE_MODEL, source_id=candidate["source_id"])
            if created and not (item and item.exception_code == "POSTED_UNVERIFIED"):
                item = base._create_pending_reconciliation_item(journal=journal, source_model=STOCK_LEDGER_SOURCE_MODEL, source_id=candidate["source_id"], source_label=_stock_ledger_reference(row), amount=base._money(candidate["amount"]), candidate_id=candidate_id, actor=actor, note=posting_note)
            base._log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model=STOCK_LEDGER_SOURCE_MODEL, source_id=int(candidate["source_id"]), event_key=candidate["event_key"], amount=base._money(candidate["amount"]), candidate_key=key, reconciliation_item=item)
            return {"posted": created, "already_posted": not created, "journal_entry": base._journal_payload(journal), "reconciliation_item": base._reconciliation_payload(item), "next_action": "Run reconciliation checks and verify the pending bridge item."}
        if candidate.get("source_model") == VENDOR_PAYMENT_SOURCE_MODEL:
            if not confirmed:
                raise ValueError("Explicit confirmation is required before posting.")
            key = (idempotency_key or "").strip()
            if not key:
                raise ValueError("idempotency_key is required.")
            if candidate["event_key"] not in VENDOR_PAYMENT_EVENT_KEYS:
                raise ValueError("Unsupported bridge candidate source.")
            purpose = VENDOR_PAYMENT_PURPOSE_BY_EVENT[candidate["event_key"]]
            existing = AccountingBridgePosting.objects.select_for_update().filter(source_model=VENDOR_PAYMENT_SOURCE_MODEL, source_id=candidate["source_id"], purpose=purpose).select_related("journal_entry").first()
            if existing is not None:
                existing_key = ((existing.trace_metadata or {}).get("idempotency_key") or "").strip()
                if existing_key and existing_key == key:
                    return {"posted": False, "already_posted": True, "journal_entry": base._journal_payload(existing.journal_entry), "reconciliation_item": base._reconciliation_payload(base._latest_posting_reconciliation_item(source_model=VENDOR_PAYMENT_SOURCE_MODEL, source_id=candidate["source_id"])), "next_action": "Run reconciliation checks and verify the pending bridge item."}
                raise ValueError("This source item has already been posted with a different or legacy idempotency key.")
            if candidate["idempotency_key"] != key:
                raise ValueError("idempotency_key does not match the current source candidate.")
            preview = preview_bridge_candidate(candidate_id)
            if not preview["can_post"]:
                raise ValueError("; ".join(preview["blockers"]) or "Candidate is not postable.")
            row = VendorPayment.objects.select_for_update().select_related("vendor", "vendor_bill", "finance_account", "finance_account__chart_account").get(pk=candidate["source_id"])
            before = _vendor_payment_snapshot(row)
            lines, _warnings, finance_account = _lines_for_candidate(candidate)
            total_debit, total_credit = base._line_totals(lines)
            if not lines or total_debit != total_credit:
                raise ValueError("Bridge posting preview is not balanced.")
            journal, created = post_bridge_entry(source_instance=row, purpose=purpose, entry_date=row.payment_date, memo=f"Bridge posting VendorPayment {row.id} {candidate['event_key']}", lines=lines, voucher_type=purpose, source_type="VENDOR_PAYMENT", source_reference=_vendor_payment_reference(row), source_document_no=row.payment_no, source_event_date=row.payment_date, trace_metadata={"event_key": candidate["event_key"], "idempotency_key": key, "posting_note": posting_note, "source_model": VENDOR_PAYMENT_SOURCE_MODEL, "source_id": candidate["source_id"], "vendor_id": row.vendor_id, "vendor_name": _vendor_name(row), "vendor_bill_id": row.vendor_bill_id, "purchase_bill_number": getattr(row.vendor_bill, "bill_no", None), "finance_account_id": getattr(finance_account, "id", None), "amount": candidate["amount"], "source_mutation": False, "purchase_bill_mutation": False, "stock_ledger_mutation": False}, posted_by=actor)
            row.refresh_from_db()
            if _vendor_payment_snapshot(row) != before:
                raise ValueError("VendorPayment source mutation detected; bridge posting rolled back.")
            item = base._latest_posting_reconciliation_item(source_model=VENDOR_PAYMENT_SOURCE_MODEL, source_id=candidate["source_id"])
            if created and not (item and item.exception_code == "POSTED_UNVERIFIED"):
                item = base._create_pending_reconciliation_item(journal=journal, source_model=VENDOR_PAYMENT_SOURCE_MODEL, source_id=candidate["source_id"], source_label=_vendor_payment_reference(row), amount=base._money(candidate["amount"]), candidate_id=candidate_id, actor=actor, note=posting_note)
            base._log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model=VENDOR_PAYMENT_SOURCE_MODEL, source_id=int(candidate["source_id"]), event_key=candidate["event_key"], amount=base._money(candidate["amount"]), candidate_key=key, reconciliation_item=item)
            return {"posted": created, "already_posted": not created, "journal_entry": base._journal_payload(journal), "reconciliation_item": base._reconciliation_payload(item), "next_action": "Run reconciliation checks and verify the pending bridge item."}
        return base.post_bridge_candidate(candidate_id=candidate_id, idempotency_key=idempotency_key, confirmed=confirmed, posting_note=posting_note, actor=actor)
    if not confirmed:
        raise ValueError("Explicit confirmation is required before posting.")
    key = (idempotency_key or "").strip()
    if not key:
        raise ValueError("idempotency_key is required.")
    if candidate["event_key"] not in PURCHASE_BILL_EVENT_KEYS:
        raise ValueError("Unsupported bridge candidate source.")
    purpose = PURCHASE_BILL_PURPOSE_BY_EVENT[candidate["event_key"]]
    existing = AccountingBridgePosting.objects.select_for_update().filter(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=candidate["source_id"], purpose=purpose).select_related("journal_entry").first()
    if existing is not None:
        existing_key = ((existing.trace_metadata or {}).get("idempotency_key") or "").strip()
        if existing_key and existing_key == key:
            return {"posted": False, "already_posted": True, "journal_entry": base._journal_payload(existing.journal_entry), "reconciliation_item": base._reconciliation_payload(base._latest_posting_reconciliation_item(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=candidate["source_id"])), "next_action": "Run reconciliation checks and verify the pending bridge item."}
        raise ValueError("This source item has already been posted with a different or legacy idempotency key.")
    if candidate["idempotency_key"] != key:
        raise ValueError("idempotency_key does not match the current source candidate.")
    preview = preview_bridge_candidate(candidate_id)
    if not preview["can_post"]:
        raise ValueError("; ".join(preview["blockers"]) or "Candidate is not postable.")
    row = PurchaseBill.objects.select_for_update().get(pk=candidate["source_id"])
    before = {"bill_no": row.bill_no, "status": row.status, "subtotal": row.subtotal, "tax_total": row.tax_total, "grand_total": row.grand_total, "posted_journal_entry_id": row.posted_journal_entry_id}
    lines, _warnings, finance_account = _lines_for_candidate(candidate)
    total_debit, total_credit = base._line_totals(lines)
    if not lines or total_debit != total_credit:
        raise ValueError("Bridge posting preview is not balanced.")
    journal, created = post_bridge_entry(source_instance=row, purpose=purpose, entry_date=row.bill_date, memo=f"Bridge posting PurchaseBill {row.id} {candidate['event_key']}", lines=lines, voucher_type=purpose, source_type="PURCHASE_BILL", source_reference=row.bill_no, source_document_no=row.bill_no, source_event_date=row.bill_date, trace_metadata={"event_key": candidate["event_key"], "idempotency_key": key, "posting_note": posting_note, "source_model": PURCHASE_BILL_SOURCE_MODEL, "source_id": candidate["source_id"], "vendor_id": row.vendor_id, "vendor_name": _vendor_name(row), "finance_account_id": getattr(finance_account, "id", None), "stock_location_id": row.stock_location_id, "amount": candidate["amount"], "taxable_amount": candidate.get("taxable_amount"), "tax_amount": candidate.get("tax_amount"), "inventory_mutation": False, "stock_ledger_mutation": False}, posted_by=actor)
    row.refresh_from_db()
    after = {"bill_no": row.bill_no, "status": row.status, "subtotal": row.subtotal, "tax_total": row.tax_total, "grand_total": row.grand_total, "posted_journal_entry_id": row.posted_journal_entry_id}
    if after != before:
        raise ValueError("PurchaseBill source mutation detected; bridge posting rolled back.")
    item = base._latest_posting_reconciliation_item(source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=candidate["source_id"])
    if created and not (item and item.exception_code == "POSTED_UNVERIFIED"):
        item = base._create_pending_reconciliation_item(journal=journal, source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=candidate["source_id"], source_label=row.bill_no, amount=base._money(candidate["amount"]), candidate_id=candidate_id, actor=actor, note=posting_note)
    base._log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model=PURCHASE_BILL_SOURCE_MODEL, source_id=int(candidate["source_id"]), event_key=candidate["event_key"], amount=base._money(candidate["amount"]), candidate_key=key, reconciliation_item=item)
    return {"posted": created, "already_posted": not created, "journal_entry": base._journal_payload(journal), "reconciliation_item": base._reconciliation_payload(item), "next_action": "Run reconciliation checks and verify the pending bridge item."}


def batch_preview_bridge_candidates(candidate_ids: list[str]) -> dict[str, Any]:
    previews = []
    blockers: dict[str, list[str]] = {}
    total_debit = Decimal("0.00")
    total_credit = Decimal("0.00")
    for candidate_id in candidate_ids:
        try:
            preview = preview_bridge_candidate(candidate_id)
            previews.append(preview)
            total_debit += base._money(preview["total_debit"])
            total_credit += base._money(preview["total_credit"])
            if not preview["can_post"]:
                blockers[candidate_id] = preview["blockers"]
        except Exception as exc:
            blockers[candidate_id] = [str(exc)]
    return {"selected_count": len(candidate_ids), "previewable_count": len(previews), "postable_count": sum(1 for item in previews if item["can_post"]), "blocked_count": len(blockers), "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "previews": previews, "blockers": blockers}


def batch_post_bridge_candidates(*, candidate_ids: list[str], idempotency_keys: dict[str, str], confirmed: bool, posting_note: str = "", actor) -> dict[str, Any]:
    posted = []
    already_posted = []
    errors: dict[str, list[str]] = {}
    for candidate_id in candidate_ids:
        try:
            result = post_bridge_candidate(candidate_id=candidate_id, idempotency_key=idempotency_keys.get(candidate_id, ""), confirmed=confirmed, posting_note=posting_note, actor=actor)
            (posted if result["posted"] else already_posted).append(result)
        except Exception as exc:
            errors[candidate_id] = [str(exc)]
    return {"selected_count": len(candidate_ids), "posted_count": len(posted), "already_posted_count": len(already_posted), "skipped_already_posted_count": len(already_posted), "blocked_count": len(errors), "created_journal_ids": [item["journal_entry"]["id"] for item in posted if item.get("journal_entry")], "reconciliation_pending_count": sum(1 for item in posted if item.get("reconciliation_item")), "posted": posted, "already_posted": already_posted, "errors": errors}


def summarize_candidate_statuses(rows: list[dict[str, Any]]) -> dict[str, int]:
    summary = dict(base.summarize_candidate_statuses(rows))
    counter = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == PURCHASE_BILL_SOURCE_MODEL)
    posted_unverified = sum(1 for row in rows if row.get("source_model") == PURCHASE_BILL_SOURCE_MODEL and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    vendor_counter = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == VENDOR_PAYMENT_SOURCE_MODEL)
    vendor_posted_unverified = sum(1 for row in rows if row.get("source_model") == VENDOR_PAYMENT_SOURCE_MODEL and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    stock_counter = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == STOCK_LEDGER_SOURCE_MODEL)
    stock_posted_unverified = sum(1 for row in rows if row.get("source_model") == STOCK_LEDGER_SOURCE_MODEL and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    summary.update({"purchase_bill_ready_unposted_count": counter.get("READY_UNPOSTED", 0), "purchase_bill_posted_count": counter.get("POSTED", 0), "purchase_bill_posted_unverified_count": posted_unverified, "purchase_bill_reconciled_count": counter.get("RECONCILED", 0), "purchase_bill_blocked_count": sum(v for k, v in counter.items() if str(k).startswith("BLOCKED")), "purchase_bill_unsupported_count": counter.get("UNSUPPORTED_SOURCE", 0), "vendor_payment_ready_unposted_count": vendor_counter.get("READY_UNPOSTED", 0), "vendor_payment_posted_count": vendor_counter.get("POSTED", 0), "vendor_payment_posted_unverified_count": vendor_posted_unverified, "vendor_payment_reconciled_count": vendor_counter.get("RECONCILED", 0), "vendor_payment_blocked_count": sum(v for k, v in vendor_counter.items() if str(k).startswith("BLOCKED")), "vendor_payment_unsupported_count": vendor_counter.get("UNSUPPORTED_SOURCE", 0), "stock_ledger_ready_unposted_count": stock_counter.get("READY_UNPOSTED", 0), "stock_ledger_posted_count": stock_counter.get("POSTED", 0), "stock_ledger_posted_unverified_count": stock_posted_unverified, "stock_ledger_reconciled_count": stock_counter.get("RECONCILED", 0), "stock_ledger_blocked_count": sum(v for k, v in stock_counter.items() if str(k).startswith("BLOCKED")), "stock_ledger_unsupported_count": stock_counter.get("UNSUPPORTED_SOURCE", 0)})
    return summary
