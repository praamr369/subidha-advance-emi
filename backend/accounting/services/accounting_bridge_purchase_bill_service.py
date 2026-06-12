from __future__ import annotations

from collections import Counter
from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction

from accounting.models import AccountingBridgePosting, ChartOfAccount, FinanceAccount, JournalEntry, SalaryPayment, SalarySheet, SalarySheetStatus
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
    "cogs_sale_delivery",
    "cogs_direct_sale_delivery",
    "cogs_subscription_delivery",
    "inventory_sale_stock_out",
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
    "cogs_sale_delivery": "COGS sale delivery",
    "cogs_direct_sale_delivery": "COGS direct sale delivery",
    "cogs_subscription_delivery": "COGS subscription delivery",
    "inventory_sale_stock_out": "Inventory sale stock-out",
}
SKIPPED_STOCK_LEDGER_EVENT_KEY = "inventory_skipped_not_applicable"
UNSUPPORTED_STOCK_LEDGER_EVENT_KEY = "unsupported_stockledger"
DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY = "deferred_cogs"
STOCK_LEDGER_SAFETY_TEXT = "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. It does not edit stock ledger, inventory quantity, valuation, sale/delivery, purchase bill, or vendor payment records."
COGS_STOCK_LEDGER_EVENT_KEYS = {"cogs_sale_delivery", "cogs_direct_sale_delivery", "cogs_subscription_delivery", "inventory_sale_stock_out"}
COGS_STOCK_OUT_MOVEMENT_TYPES = {StockMovementType.SALE_OUT, StockMovementType.EMI_DELIVERY_OUT, StockMovementType.DELIVERY_OUT}
SALARY_SHEET_SOURCE_MODEL = "SalarySheet"
SALARY_ACCRUAL_EVENT_KEY = "salary_accrual"
SALARY_ACCRUAL_EVENT_KEYS = {"payroll_accrual", "salary_accrual", "staff_salary_accrual", "wages_accrual"}
SALARY_ACCRUAL_PURPOSE_BY_EVENT = {key: key.upper() for key in SALARY_ACCRUAL_EVENT_KEYS}
SALARY_ACCRUAL_LABEL_BY_EVENT = {
    "payroll_accrual": "Payroll accrual",
    "salary_accrual": "Salary accrual",
    "staff_salary_accrual": "Staff salary accrual",
    "wages_accrual": "Wages accrual",
}
SKIPPED_SALARY_ACCRUAL_EVENT_KEY = "salary_accrual_skipped_not_applicable"
UNSUPPORTED_SALARY_ACCRUAL_EVENT_KEY = "unsupported_salary_accrual"
SALARY_ACCRUAL_SAFETY_TEXT = (
    "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. "
    "It does not edit payroll, staff, attendance, staff advance, or payment records."
)
SALARY_PAYMENT_SOURCE_MODEL = "SalaryPayment"
SALARY_PAYMENT_EVENT_KEY = "salary_payment"
SALARY_PAYMENT_EVENT_KEYS = {"salary_payment", "payroll_payment", "salary_payable_settlement", "wages_payment"}
SALARY_PAYMENT_PURPOSE_BY_EVENT = {key: key.upper() for key in SALARY_PAYMENT_EVENT_KEYS}
SALARY_PAYMENT_LABEL_BY_EVENT = {
    "salary_payment": "Salary payment",
    "payroll_payment": "Payroll payment",
    "salary_payable_settlement": "Salary payable settlement",
    "wages_payment": "Wages payment",
}
UNSUPPORTED_SALARY_PAYMENT_EVENT_KEY = "unsupported_salary_payment"
SALARY_PAYMENT_SAFETY_TEXT = (
    "Preview is read-only. Posting creates accounting entries only after explicit admin confirmation. "
    "It does not edit salary payment, salary sheet, staff, attendance, or StaffAdvance records."
)

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


def _salary_sheet_reference(row: SalarySheet) -> str:
    employee_code = getattr(row.employee, "employee_code", None) or f"EMP-{row.employee_id}"
    period_code = getattr(row.payroll_period, "code", None) or f"{row.year}-{row.month:02d}"
    return f"SAL-{employee_code}-{period_code}"


def _salary_sheet_period_label(row: SalarySheet) -> str:
    if row.payroll_period_id:
        return f"{row.payroll_period.code} ({row.payroll_period.start_date} to {row.payroll_period.end_date})"
    return f"{row.year}-{row.month:02d}"


def _salary_sheet_date(row: SalarySheet):
    return row.payroll_period.end_date if row.payroll_period_id else None


def _salary_sheet_snapshot(row: SalarySheet) -> dict[str, Any]:
    return {
        "employee_id": row.employee_id,
        "payroll_period_id": row.payroll_period_id,
        "year": row.year,
        "month": row.month,
        "gross_amount": row.gross_amount,
        "deductions_amount": row.deductions_amount,
        "net_amount": row.net_amount,
        "status": row.status,
        "posted_journal_entry_id": row.posted_journal_entry_id,
    }


def _employee_snapshot(row: SalarySheet) -> dict[str, Any]:
    employee = row.employee
    return {
        "employee_code": employee.employee_code,
        "name": employee.name,
        "branch_id": employee.branch_id,
        "base_salary": employee.base_salary,
        "is_active": employee.is_active,
        "employment_status": employee.employment_status,
        "employment_type": employee.employment_type,
        "payroll_eligible": employee.payroll_eligible,
        "payment_mode": employee.payment_mode,
        "payroll_expense_account_id": employee.payroll_expense_account_id,
    }


def _salary_expense_account(row: SalarySheet) -> ChartOfAccount | None:
    account = getattr(row.employee, "payroll_expense_account", None)
    if account is not None and account.is_active:
        return account
    return base._posting_profile_account("SALARY_EXPENSE") or base._posting_profile_account("WAGES_EXPENSE")


def _salary_payable_account() -> ChartOfAccount | None:
    return base._posting_profile_account("SALARY_PAYABLE") or base._chart_by_system_code("SALARY_PAYABLE")


def _salary_payment_reference(row: SalaryPayment) -> str:
    return row.reference_no or f"SALPAY-{row.id}"


def _salary_payment_snapshot(row: SalaryPayment) -> dict[str, Any]:
    return {
        "salary_sheet_id": row.salary_sheet_id,
        "payment_date": row.payment_date,
        "amount": row.amount,
        "branch_id": row.branch_id,
        "finance_account_id": row.finance_account_id,
        "reference_no": row.reference_no,
        "posted_journal_entry_id": row.posted_journal_entry_id,
    }


def _classify_salary_payment_event(row: SalaryPayment) -> tuple[str, str, str | None, bool]:
    if not row.salary_sheet_id:
        return UNSUPPORTED_SALARY_PAYMENT_EVENT_KEY, "Unsupported salary payment", "SalaryPayment has no linked SalarySheet; settlement cannot be classified safely.", False
    if not row.payment_date:
        return UNSUPPORTED_SALARY_PAYMENT_EVENT_KEY, "Unsupported salary payment", "SalaryPayment has no reliable payment_date.", False
    if base._money(row.amount) <= Decimal("0.00"):
        return UNSUPPORTED_SALARY_PAYMENT_EVENT_KEY, "Unsupported salary payment", "SalaryPayment amount must be greater than zero.", False
    if not row.finance_account_id:
        return SALARY_PAYMENT_EVENT_KEY, SALARY_PAYMENT_LABEL_BY_EVENT[SALARY_PAYMENT_EVENT_KEY], "SalaryPayment has no finance account/payment source.", False
    return SALARY_PAYMENT_EVENT_KEY, SALARY_PAYMENT_LABEL_BY_EVENT[SALARY_PAYMENT_EVENT_KEY], None, False


def _classify_salary_accrual_event(row: SalarySheet) -> tuple[str, str, str | None, bool]:
    if row.status == SalarySheetStatus.DRAFT:
        return SALARY_ACCRUAL_EVENT_KEY, SALARY_ACCRUAL_LABEL_BY_EVENT[SALARY_ACCRUAL_EVENT_KEY], "SalarySheet must be approved/finalized before accrual posting.", True
    if row.status in {SalarySheetStatus.POSTED, SalarySheetStatus.PAID_PARTIAL, SalarySheetStatus.PAID}:
        return SKIPPED_SALARY_ACCRUAL_EVENT_KEY, "Salary accrual skipped", "SalarySheet is already posted or paid through the legacy salary workflow; F12 will not duplicate or mutate it.", False
    if row.status != SalarySheetStatus.APPROVED:
        return UNSUPPORTED_SALARY_ACCRUAL_EVENT_KEY, "Unsupported salary accrual", "SalarySheet status cannot be safely classified for F12 accrual posting.", False
    if not row.payroll_period_id or not row.payroll_period.end_date:
        return UNSUPPORTED_SALARY_ACCRUAL_EVENT_KEY, "Unsupported salary accrual", "SalarySheet has no linked payroll period end date; accrual date cannot be resolved safely.", False
    gross = base._money(row.gross_amount)
    net = base._money(row.net_amount)
    deductions = base._money(row.deductions_amount)
    if gross <= Decimal("0.00") or net <= Decimal("0.00"):
        return UNSUPPORTED_SALARY_ACCRUAL_EVENT_KEY, "Unsupported salary accrual", "SalarySheet amount must be greater than zero for accrual posting.", False
    if deductions > Decimal("0.00") or gross != net:
        return UNSUPPORTED_SALARY_ACCRUAL_EVENT_KEY, "Unsupported salary accrual", "SalarySheet has deductions; F12 supports only simple Dr Salary/Wages Expense and Cr Salary Payable without deduction clearing.", False
    return SALARY_ACCRUAL_EVENT_KEY, SALARY_ACCRUAL_LABEL_BY_EVENT[SALARY_ACCRUAL_EVENT_KEY], None, False


def _salary_accrual_lines(row: SalarySheet, event_key: str) -> tuple[list[dict[str, Any]], list[str], FinanceAccount | None]:
    warnings: list[str] = []
    if event_key not in SALARY_ACCRUAL_EVENT_KEYS:
        return [], ["Unsupported SalarySheet accrual event for Phase F12."], None
    amount = base._money(row.net_amount)
    if amount <= Decimal("0.00"):
        warnings.append("SalarySheet net_amount must be greater than zero.")
    expense = _salary_expense_account(row)
    payable = _salary_payable_account()
    if expense is None:
        warnings.append("SALARY_EXPENSE / WAGES_EXPENSE posting profile/chart account is missing or inactive.")
    if payable is None:
        warnings.append("SALARY_PAYABLE chart account is missing or inactive.")
    if warnings:
        return [], warnings, None
    reference = _salary_sheet_reference(row)
    employee_name = getattr(row.employee, "name", None) or f"Employee #{row.employee_id}"
    return [
        {"chart_account": expense, "description": f"Salary expense {employee_name} {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
        {"chart_account": payable, "description": f"Salary payable {employee_name} {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
    ], warnings, None


def _salary_payment_lines(row: SalaryPayment, event_key: str) -> tuple[list[dict[str, Any]], list[str], FinanceAccount | None]:
    warnings: list[str] = []
    if event_key not in SALARY_PAYMENT_EVENT_KEYS:
        return [], ["Unsupported SalaryPayment settlement event for Phase F13."], None
    amount = base._money(row.amount)
    if amount <= Decimal("0.00"):
        warnings.append("SalaryPayment amount must be greater than zero.")
    payable = _salary_payable_account()
    if payable is None:
        warnings.append("SALARY_PAYABLE chart account is missing or inactive.")
    finance_account = row.finance_account
    if finance_account is None:
        warnings.append("SalaryPayment finance account/payment source is missing.")
    elif not finance_account.is_active:
        warnings.append("SalaryPayment finance account is inactive.")
    elif not finance_account.chart_account_id or not finance_account.chart_account.is_active:
        warnings.append("SalaryPayment finance account is not mapped to an active chart account.")
    if warnings:
        return [], warnings, finance_account
    reference = _salary_payment_reference(row)
    return [
        {"chart_account": payable, "description": f"Salary payable settlement {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
        {"chart_account": finance_account.chart_account, "description": f"Salary paid from {finance_account.name} {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
    ], warnings, finance_account


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


def _nested_snapshot_value(snapshot: Any, keys: set[str]) -> Any:
    if not isinstance(snapshot, dict):
        return None
    stack = [snapshot]
    while stack:
        current = stack.pop()
        for key, value in current.items():
            normalized = str(key).strip().lower()
            if normalized in keys and value not in (None, ""):
                return value
            if isinstance(value, dict):
                stack.append(value)
    return None


def _cost_from_snapshot(snapshot: Any, quantity: Decimal) -> tuple[Decimal | None, Decimal | None, str | None]:
    unit_keys = {"cogs_unit_cost", "unit_cost_snapshot", "cost_unit", "unit_cost", "stock_unit_cost"}
    amount_keys = {"cogs_amount", "cogs_total", "valuation_amount_snapshot", "cost_amount", "stock_cost_amount", "total_cost"}
    raw_unit = _nested_snapshot_value(snapshot, unit_keys)
    raw_amount = _nested_snapshot_value(snapshot, amount_keys)
    unit = base._money(raw_unit) if raw_unit not in (None, "") else None
    amount = base._money(raw_amount) if raw_amount not in (None, "") else None
    if amount is None and unit is not None and quantity > Decimal("0.000"):
        amount = base._money(unit * quantity)
    if unit is None and amount is not None and quantity > Decimal("0.000"):
        unit = (amount / quantity).quantize(Decimal("0.01"))
    if amount is None or unit is None:
        return None, None, "Source snapshot does not contain persisted COGS/unit-cost evidence."
    if amount <= Decimal("0.00") or unit <= Decimal("0.00"):
        return None, None, "Source COGS evidence is zero or negative; COGS is deferred."
    return unit, amount, None


def _stock_ledger_cogs_evidence(row: StockLedger) -> tuple[str, str, Decimal | None, Decimal | None, str | None]:
    ref_pk = _stock_ledger_ref_pk(row)
    if ref_pk is None:
        return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", None, None, "StockLedger reference_id is not a resolvable concrete sale/delivery source id."
    quantity = Decimal(str(row.quantity_out or "0.000"))
    if row.movement_type not in COGS_STOCK_OUT_MOVEMENT_TYPES or row.quantity_out <= Decimal("0.000"):
        return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", None, None, "COGS bridge requires a finalized physical stock-out row."
    if row.reference_model == "BillingInvoiceLine":
        from billing.models import BillingDocumentStatus, BillingInvoiceLine

        line = BillingInvoiceLine.objects.select_related("invoice", "invoice__direct_sale").filter(pk=ref_pk).first()
        if line is None:
            return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", None, None, "Linked BillingInvoiceLine was not found."
        finalized = line.invoice.status in {BillingDocumentStatus.APPROVED, BillingDocumentStatus.POSTED}
        direct_sale_finalized = not line.invoice.direct_sale_id or getattr(line.invoice.direct_sale, "status", "") in {"DELIVERED", "INVOICED"}
        if not finalized or not direct_sale_finalized:
            return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", None, None, "Linked invoice/direct sale is not finalized for COGS posting."
        unit, amount, reason = _cost_from_snapshot(line.tax_profile_snapshot or line.invoice.tax_profile_snapshot, quantity)
        if reason:
            return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", unit, amount, reason
        event_key = "cogs_direct_sale_delivery" if line.invoice.direct_sale_id else "cogs_sale_delivery"
        return event_key, STOCK_LEDGER_LABEL_BY_EVENT[event_key], unit, amount, None
    if row.reference_model == "DirectSaleLine":
        from billing.models import DirectSaleLine

        line = DirectSaleLine.objects.select_related("direct_sale").filter(pk=ref_pk).first()
        if line is None:
            return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", None, None, "Linked DirectSaleLine was not found."
        if line.direct_sale.status not in {"DELIVERED", "INVOICED"}:
            return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", None, None, "Linked direct sale is not delivered/invoiced."
        unit, amount, reason = _cost_from_snapshot(line.direct_sale.tax_profile_snapshot, quantity)
        if reason:
            return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", unit, amount, reason
        return "cogs_direct_sale_delivery", STOCK_LEDGER_LABEL_BY_EVENT["cogs_direct_sale_delivery"], unit, amount, None
    if row.reference_model == "SubscriptionDelivery":
        from subscriptions.models import DeliveryStatus, SubscriptionDelivery

        delivery = SubscriptionDelivery.objects.select_related("subscription", "subscription__product").filter(pk=ref_pk).first()
        if delivery is None:
            return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", None, None, "Linked SubscriptionDelivery was not found."
        if delivery.status != DeliveryStatus.DELIVERED or not delivery.delivered_at:
            return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", None, None, "Linked subscription delivery is not finalized as delivered."
        snapshots = [delivery.subscription.pricing_snapshot, delivery.subscription.product_snapshot, delivery.subscription.tax_profile_snapshot]
        for snapshot in snapshots:
            unit, amount, reason = _cost_from_snapshot(snapshot, quantity)
            if not reason:
                return "cogs_subscription_delivery", STOCK_LEDGER_LABEL_BY_EVENT["cogs_subscription_delivery"], unit, amount, None
        return DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY, "COGS deferred", None, None, "Subscription delivery snapshots do not contain persisted COGS/unit-cost evidence."
    return UNSUPPORTED_STOCK_LEDGER_EVENT_KEY, "Unsupported StockLedger movement", None, None, "Stock-out row does not link to a supported finalized sale/delivery source."


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


def _cogs_account() -> ChartOfAccount | None:
    return base._posting_profile_account("COGS") or base._posting_profile_account("COST_OF_GOODS_SOLD")


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
    if movement in COGS_STOCK_OUT_MOVEMENT_TYPES:
        event_key, event_label, _unit, _amount, reason = _stock_ledger_cogs_evidence(row)
        return event_key, event_label, reason
    if movement in {StockMovementType.EMI_RETURN_IN, StockMovementType.CUSTOMER_RETURN, StockMovementType.SALE_RETURN_IN}:
        return "inventory_return_in", STOCK_LEDGER_LABEL_BY_EVENT["inventory_return_in"], None
    if movement in {StockMovementType.PURCHASE_RETURN_OUT, StockMovementType.VENDOR_RETURN}:
        return "inventory_return_out", STOCK_LEDGER_LABEL_BY_EVENT["inventory_return_out"], None
    return UNSUPPORTED_STOCK_LEDGER_EVENT_KEY, "Unsupported StockLedger movement", "StockLedger movement type cannot be safely classified for Phase F8 bridge posting."


def _stock_ledger_lines(row: StockLedger, event_key: str) -> tuple[list[dict[str, Any]], list[str], FinanceAccount | None]:
    warnings: list[str] = []
    if event_key not in STOCK_LEDGER_EVENT_KEYS:
        return [], ["Unsupported StockLedger event for Phase F8."], None
    if event_key in COGS_STOCK_LEDGER_EVENT_KEYS:
        unit_cost, amount, value_reason = _stock_ledger_cogs_evidence(row)[2:]
    else:
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
    if event_key in COGS_STOCK_LEDGER_EVENT_KEYS:
        cogs = _cogs_account()
        if cogs is None:
            warnings.append("COGS / COST_OF_GOODS_SOLD posting profile/chart account is missing or inactive.")
        if warnings:
            return [], warnings, None
        return [
            {"chart_account": cogs, "description": f"COGS stock-out {reference}", "debit_amount": amount, "credit_amount": Decimal("0.00")},
            {"chart_account": asset, "description": f"Inventory asset COGS relief {reference}", "debit_amount": Decimal("0.00"), "credit_amount": amount},
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
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_STOCK_LEDGER_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_STOCK_LEDGER_EVENT_KEY else "DEFERRED_COGS" if event_key == DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = base._candidate_status_payload(event_key=event_key, event_label=event_label, module="inventory", source_model=STOCK_LEDGER_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=row.movement_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in STOCK_LEDGER_EVENT_KEYS, classification_reason=reason, approval_required=False)
    if event_key in COGS_STOCK_LEDGER_EVENT_KEYS or event_key == DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY:
        _cogs_event_key, _cogs_label, unit_cost, amount, value_reason = _stock_ledger_cogs_evidence(row)
    else:
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
        "cogs_state": "READY" if event_key in COGS_STOCK_LEDGER_EVENT_KEYS else "DEFERRED_COGS" if event_key == DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY else None,
        "cogs_amount": f"{base._money(amount or Decimal('0.00')):.2f}" if event_key in COGS_STOCK_LEDGER_EVENT_KEYS or event_key == DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY else None,
        "cost_evidence": row.reference_model if unit_cost is not None and amount is not None else None,
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


def salary_sheet_candidate(row: SalarySheet) -> dict[str, Any]:
    event_key, event_label, reason, approval_required = _classify_salary_accrual_event(row)
    purpose = SALARY_ACCRUAL_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    bridge = base._existing_bridge_for(source_model=SALARY_SHEET_SOURCE_MODEL, source_id=str(row.id), purpose=purpose)
    journal = bridge.journal_entry if bridge else None
    item = base._latest_posting_reconciliation_item(source_model=SALARY_SHEET_SOURCE_MODEL, source_id=str(row.id)) if journal else base._latest_reconciliation_item(source_model=SALARY_SHEET_SOURCE_MODEL, source_id=str(row.id))
    source_date = getattr(journal, "entry_date", None) or _salary_sheet_date(row)
    period = getattr(journal, "accounting_period", None) or base._source_period(source_date)
    lines, warnings, finance_account = _salary_accrual_lines(row, event_key) if event_key in SALARY_ACCRUAL_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "SKIPPED_NOT_APPLICABLE" if event_key == SKIPPED_SALARY_ACCRUAL_EVENT_KEY else "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_SALARY_ACCRUAL_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    postability = base._candidate_status_payload(event_key=event_key, event_label=event_label, module="accounting", source_model=SALARY_SHEET_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=source_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in SALARY_ACCRUAL_EVENT_KEYS, classification_reason=reason, approval_required=approval_required)
    source_date_key = source_date.isoformat() if source_date else "NO_SAFE_DATE"
    payload = base._candidate_payload(candidate_id=base._candidate_id(source_model=SALARY_SHEET_SOURCE_MODEL, source_pk=row.id, event_key=event_key), event_key=event_key, event_label=event_label, module="accounting", source_model=SALARY_SHEET_SOURCE_MODEL, source_pk=row.id, source_display=f"Salary sheet {_salary_sheet_reference(row)}", source_reference=_salary_sheet_reference(row), source_date=source_date, amount=row.net_amount, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:SalarySheet:{row.id}:{source_date_key}:{base._money(row.net_amount):.2f}", source_status=row.status, source_type="SALARY_ACCRUAL")
    if payload.get("reconciliation_state") == "POSTED_UNVERIFIED":
        payload["status"] = "POSTED_UNVERIFIED"
        payload["canonical_status"] = "POSTED_UNVERIFIED"
    payroll_period = row.payroll_period
    employee = row.employee
    payload.update(
        {
            "salary_sheet_id": row.id,
            "salary_reference": _salary_sheet_reference(row),
            "salary_status": row.status,
            "payroll_status": row.status,
            "payroll_period": _salary_sheet_period_label(row),
            "payroll_period_code": getattr(payroll_period, "code", None),
            "payroll_period_start": payroll_period.start_date.isoformat() if payroll_period else None,
            "payroll_period_end": payroll_period.end_date.isoformat() if payroll_period else None,
            "staff_id": row.employee_id,
            "staff_name": employee.name,
            "employee_code": employee.employee_code,
            "employee_name": employee.name,
            "employment_type": employee.employment_type,
            "gross_salary": f"{base._money(row.gross_amount):.2f}",
            "gross_amount": f"{base._money(row.gross_amount):.2f}",
            "deductions_amount": f"{base._money(row.deductions_amount):.2f}",
            "payable_amount": f"{base._money(row.net_amount):.2f}",
            "net_amount": f"{base._money(row.net_amount):.2f}",
            "legacy_posted_journal_entry_id": row.posted_journal_entry_id,
        }
    )
    return payload


def salary_payment_candidate(row: SalaryPayment) -> dict[str, Any]:
    event_key, event_label, reason, approval_required = _classify_salary_payment_event(row)
    purpose = SALARY_PAYMENT_PURPOSE_BY_EVENT.get(event_key, event_key.upper())
    bridge = base._existing_bridge_for(source_model=SALARY_PAYMENT_SOURCE_MODEL, source_id=str(row.id), purpose=purpose)
    journal = bridge.journal_entry if bridge else row.posted_journal_entry
    item = base._latest_posting_reconciliation_item(source_model=SALARY_PAYMENT_SOURCE_MODEL, source_id=str(row.id)) if journal else base._latest_reconciliation_item(source_model=SALARY_PAYMENT_SOURCE_MODEL, source_id=str(row.id))
    source_date = getattr(journal, "entry_date", None) or row.payment_date
    period = getattr(journal, "accounting_period", None) or base._source_period(source_date)
    lines, warnings, finance_account = _salary_payment_lines(row, event_key) if event_key in SALARY_PAYMENT_EVENT_KEYS else ([], [reason] if reason else [], None)
    raw = "UNSUPPORTED_SOURCE" if event_key == UNSUPPORTED_SALARY_PAYMENT_EVENT_KEY else "READY" if lines else "NOT_CONFIGURED"
    if row.posted_journal_entry_id and bridge is None:
        raw = "UNSUPPORTED_SOURCE"
        warnings = ["SalaryPayment already has a legacy posted_journal_entry but no bridge posting; F13 will not duplicate salary payment accounting."]
    postability = base._candidate_status_payload(event_key=event_key, event_label=event_label, module="accounting", source_model=SALARY_PAYMENT_SOURCE_MODEL, raw_status=raw, lines=lines, line_warnings=warnings, period=period, source_date=source_date, journal=journal, reconciliation_item=item, source_workflow_exists=event_key in SALARY_PAYMENT_EVENT_KEYS, classification_reason=reason, approval_required=approval_required)
    source_date_key = source_date.isoformat() if source_date else "NO_SAFE_DATE"
    payload = base._candidate_payload(candidate_id=base._candidate_id(source_model=SALARY_PAYMENT_SOURCE_MODEL, source_pk=row.id, event_key=event_key), event_key=event_key, event_label=event_label, module="accounting", source_model=SALARY_PAYMENT_SOURCE_MODEL, source_pk=row.id, source_display=f"Salary payment {_salary_payment_reference(row)}", source_reference=_salary_payment_reference(row), source_date=source_date, amount=row.amount, lines=lines, finance_account=finance_account, period=period, postability=postability, journal=journal, reconciliation_item=item, idempotency_key=f"bridge:{purpose}:SalaryPayment:{row.id}:{source_date_key}:{base._money(row.amount):.2f}", source_status=None, source_type="SALARY_PAYMENT")
    if payload.get("reconciliation_state") == "POSTED_UNVERIFIED":
        payload["status"] = "POSTED_UNVERIFIED"
        payload["canonical_status"] = "POSTED_UNVERIFIED"
    if row.posted_journal_entry_id and bridge is None:
        payload.update(
            {
                "status": "UNSUPPORTED_SOURCE",
                "canonical_status": "UNSUPPORTED_SOURCE",
                "can_preview": False,
                "can_post": False,
                "can_reconcile": False,
                "blocker_code": "LEGACY_POSTED_JOURNAL",
                "blocker_reason": "SalaryPayment already has a legacy posted_journal_entry but no bridge posting; F13 will not duplicate salary payment accounting.",
                "unsupported_source": True,
                "exception_reasons": ["SalaryPayment already has a legacy posted_journal_entry but no bridge posting; F13 will not duplicate salary payment accounting."],
                "operator_action": "Review the legacy salary payment journal; do not post a duplicate bridge settlement.",
                "recommended_action": "Review the legacy salary payment journal; do not post a duplicate bridge settlement.",
                "preview_action_href": None,
                "post_action_href": None,
                "is_postable": False,
            }
        )
    sheet = row.salary_sheet
    employee = sheet.employee
    payload.update(
        {
            "salary_payment_id": row.id,
            "salary_payment_reference": _salary_payment_reference(row),
            "salary_payment_date": row.payment_date.isoformat() if row.payment_date else None,
            "salary_payment_amount": f"{base._money(row.amount):.2f}",
            "salary_payment_status": None,
            "payment_method": getattr(row.finance_account, "kind", None),
            "finance_account_name": getattr(row.finance_account, "name", None),
            "salary_sheet_id": row.salary_sheet_id,
            "salary_reference": _salary_sheet_reference(sheet),
            "linked_salary_sheet_reference": _salary_sheet_reference(sheet),
            "payroll_status": sheet.status,
            "staff_id": sheet.employee_id,
            "staff_name": employee.name,
            "employee_code": employee.employee_code,
            "employee_name": employee.name,
            "branch_id": row.branch_id,
            "branch_name": getattr(row.branch, "name", None),
            "legacy_posted_journal_entry_id": row.posted_journal_entry_id,
        }
    )
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
    if requested_model in {"", SALARY_SHEET_SOURCE_MODEL} and (not active_filters.module or active_filters.module in {"accounting", "payroll"}):
        qs = SalarySheet.objects.select_related("employee", "employee__payroll_expense_account", "payroll_period")
        salary_rows = [salary_sheet_candidate(item) for item in qs.order_by("-year", "-month", "-id")[:1000]]
        rows.extend(row for row in salary_rows if base._row_matches_date_filters(row, active_filters))
    if requested_model in {"", SALARY_PAYMENT_SOURCE_MODEL} and (not active_filters.module or active_filters.module in {"accounting", "payroll"}):
        qs = base._date_filter_qs(
            SalaryPayment.objects.select_related("salary_sheet", "salary_sheet__employee", "finance_account", "finance_account__chart_account", "branch", "posted_journal_entry"),
            active_filters,
            date_field="payment_date",
        )
        rows.extend(salary_payment_candidate(item) for item in qs.order_by("-payment_date", "-id")[:500])
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
        if source_kind == "salarysheet":
            qs = SalarySheet.objects.select_related("employee", "employee__payroll_expense_account", "payroll_period")
            if for_update:
                qs = qs.select_for_update()
            candidate = salary_sheet_candidate(qs.get(pk=source_pk))
            if candidate["event_key"] != event_key:
                raise ValueError("SalarySheet candidate event no longer matches current source state.")
            return candidate
        if source_kind == "salarypayment":
            qs = SalaryPayment.objects.select_related("salary_sheet", "salary_sheet__employee", "finance_account", "finance_account__chart_account", "branch", "posted_journal_entry")
            if for_update:
                qs = qs.select_for_update()
            candidate = salary_payment_candidate(qs.get(pk=source_pk))
            if candidate["event_key"] != event_key:
                raise ValueError("SalaryPayment candidate event no longer matches current source state.")
            return candidate
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
        if candidate["source_model"] == SALARY_SHEET_SOURCE_MODEL:
            row = SalarySheet.objects.select_related("employee", "employee__payroll_expense_account", "payroll_period").get(pk=candidate["source_id"])
            return _salary_accrual_lines(row, candidate["event_key"])
        if candidate["source_model"] == SALARY_PAYMENT_SOURCE_MODEL:
            row = SalaryPayment.objects.select_related("salary_sheet", "salary_sheet__employee", "finance_account", "finance_account__chart_account").get(pk=candidate["source_id"])
            return _salary_payment_lines(row, candidate["event_key"])
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
        if candidate.get("source_model") == SALARY_SHEET_SOURCE_MODEL:
            lines, warnings, _finance_account = _lines_for_candidate(candidate) if candidate.get("source_date") else ([], [candidate.get("blocker_reason") or "SalarySheet has no safe accrual date."], None)
            blockers = []
            if not candidate["can_post"]:
                blockers.append(candidate["blocker_reason"] or "Candidate is not postable.")
            journal_date = date.fromisoformat(candidate["source_date"]) if candidate.get("source_date") else None
            journal_number_preview = None
            if journal_date is not None:
                try:
                    sequence = validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, journal_date)
                    journal_number_preview = preview_document_number(sequence=sequence)
                except DocumentNumberingSetupError as exc:
                    blockers.append(str(exc))
            total_debit, total_credit = base._line_totals(lines)
            return {
                "candidate": candidate,
                "candidate_id": candidate_id,
                "source": {
                    "model": SALARY_SHEET_SOURCE_MODEL,
                    "pk": candidate.get("source_pk") or candidate["source_id"],
                    "display": candidate["source_display"],
                    "reference_number": candidate["source_reference_number"],
                    "date": candidate.get("source_date"),
                    "amount": candidate["amount"],
                    "source_status": candidate.get("source_status"),
                    "source_type": candidate.get("source_type"),
                    "salary_sheet_id": candidate.get("salary_sheet_id"),
                    "salary_reference": candidate.get("salary_reference"),
                    "staff_name": candidate.get("staff_name"),
                    "employee_code": candidate.get("employee_code"),
                    "payroll_period": candidate.get("payroll_period"),
                    "payroll_period_code": candidate.get("payroll_period_code"),
                    "payroll_period_start": candidate.get("payroll_period_start"),
                    "payroll_period_end": candidate.get("payroll_period_end"),
                    "payroll_status": candidate.get("payroll_status"),
                    "gross_salary": candidate.get("gross_salary"),
                    "deductions_amount": candidate.get("deductions_amount"),
                    "payable_amount": candidate.get("payable_amount"),
                },
                "payroll_identity": {
                    "salary_sheet_id": candidate.get("salary_sheet_id"),
                    "reference": candidate.get("salary_reference"),
                    "staff_name": candidate.get("staff_name"),
                    "employee_code": candidate.get("employee_code"),
                    "period": candidate.get("payroll_period"),
                    "status": candidate.get("payroll_status"),
                },
                "journal_date": journal_date.isoformat() if journal_date else None,
                "accounting_period": candidate["accounting_period"],
                "journal_number_preview": journal_number_preview,
                "debit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if base._money(line.get("debit_amount")) > 0],
                "credit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if base._money(line.get("credit_amount")) > 0],
                "lines": base._preview_lines(lines),
                "total_debit": f"{total_debit:.2f}",
                "total_credit": f"{total_credit:.2f}",
                "is_balanced": bool(lines and total_debit == total_credit),
                "tax_lines": [],
                "finance_account_line": None,
                "warnings": warnings,
                "blockers": list(dict.fromkeys([item for item in blockers if item])),
                "can_post": bool(candidate["can_post"] and lines and total_debit == total_credit and not blockers),
                "idempotency_key": candidate["idempotency_key"],
                "safety_text": SALARY_ACCRUAL_SAFETY_TEXT,
            }
        if candidate.get("source_model") == SALARY_PAYMENT_SOURCE_MODEL:
            lines, warnings, _finance_account = _lines_for_candidate(candidate) if candidate.get("source_date") else ([], [candidate.get("blocker_reason") or "SalaryPayment has no safe payment date."], None)
            blockers = []
            if not candidate["can_post"]:
                blockers.append(candidate["blocker_reason"] or "Candidate is not postable.")
            journal_date = date.fromisoformat(candidate["source_date"]) if candidate.get("source_date") else None
            journal_number_preview = None
            if journal_date is not None:
                try:
                    sequence = validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, journal_date)
                    journal_number_preview = preview_document_number(sequence=sequence)
                except DocumentNumberingSetupError as exc:
                    blockers.append(str(exc))
            total_debit, total_credit = base._line_totals(lines)
            return {
                "candidate": candidate,
                "candidate_id": candidate_id,
                "source": {
                    "model": SALARY_PAYMENT_SOURCE_MODEL,
                    "pk": candidate.get("source_pk") or candidate["source_id"],
                    "display": candidate["source_display"],
                    "reference_number": candidate["source_reference_number"],
                    "date": candidate.get("source_date"),
                    "amount": candidate["amount"],
                    "source_status": candidate.get("source_status"),
                    "source_type": candidate.get("source_type"),
                    "salary_payment_id": candidate.get("salary_payment_id"),
                    "salary_payment_reference": candidate.get("salary_payment_reference"),
                    "salary_payment_date": candidate.get("salary_payment_date"),
                    "staff_name": candidate.get("staff_name"),
                    "employee_code": candidate.get("employee_code"),
                    "salary_sheet_id": candidate.get("salary_sheet_id"),
                    "linked_salary_sheet_reference": candidate.get("linked_salary_sheet_reference"),
                    "payroll_status": candidate.get("payroll_status"),
                    "payment_method": candidate.get("payment_method"),
                    "finance_account_name": candidate.get("finance_account_name"),
                    "legacy_posted_journal_entry_id": candidate.get("legacy_posted_journal_entry_id"),
                },
                "salary_payment_identity": {
                    "salary_payment_id": candidate.get("salary_payment_id"),
                    "reference": candidate.get("salary_payment_reference"),
                    "payment_date": candidate.get("salary_payment_date"),
                    "staff_name": candidate.get("staff_name"),
                    "employee_code": candidate.get("employee_code"),
                    "salary_sheet_id": candidate.get("salary_sheet_id"),
                    "salary_sheet_reference": candidate.get("linked_salary_sheet_reference"),
                    "payment_method": candidate.get("payment_method"),
                    "finance_account_name": candidate.get("finance_account_name"),
                },
                "journal_date": journal_date.isoformat() if journal_date else None,
                "accounting_period": candidate["accounting_period"],
                "journal_number_preview": journal_number_preview,
                "debit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if base._money(line.get("debit_amount")) > 0],
                "credit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if base._money(line.get("credit_amount")) > 0],
                "lines": base._preview_lines(lines),
                "total_debit": f"{total_debit:.2f}",
                "total_credit": f"{total_credit:.2f}",
                "is_balanced": bool(lines and total_debit == total_credit),
                "tax_lines": [],
                "finance_account_line": candidate.get("finance_account"),
                "warnings": warnings,
                "blockers": list(dict.fromkeys([item for item in blockers if item])),
                "can_post": bool(candidate["can_post"] and lines and total_debit == total_credit and not blockers),
                "idempotency_key": candidate["idempotency_key"],
                "safety_text": SALARY_PAYMENT_SAFETY_TEXT,
            }
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
            return {"candidate": candidate, "candidate_id": candidate_id, "source": {"model": STOCK_LEDGER_SOURCE_MODEL, "pk": candidate.get("source_pk") or candidate["source_id"], "display": candidate["source_display"], "reference_number": candidate["source_reference_number"], "date": candidate["source_date"], "amount": candidate["amount"], "source_status": candidate.get("source_status"), "source_type": candidate.get("source_type"), "stock_ledger_id": candidate.get("stock_ledger_id"), "movement_type": candidate.get("movement_type"), "movement_date": candidate.get("movement_date"), "item_name": candidate.get("item_name"), "product_name": candidate.get("product_name"), "stock_location_name": candidate.get("stock_location_name"), "branch_name": candidate.get("branch_name"), "quantity": candidate.get("quantity"), "quantity_out": candidate.get("quantity_out"), "unit_cost": candidate.get("unit_cost"), "cogs_amount": candidate.get("cogs_amount"), "cogs_state": candidate.get("cogs_state"), "cost_evidence": candidate.get("cost_evidence"), "reference_model": candidate.get("reference_model"), "reference_id": candidate.get("reference_id")}, "journal_date": candidate["source_date"], "accounting_period": candidate["accounting_period"], "journal_number_preview": journal_number_preview, "debit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), debit=line.get("debit_amount")) for line in lines if base._money(line.get("debit_amount")) > 0], "credit_lines": [base._line_payload(account=line["chart_account"], description=line.get("description", ""), credit=line.get("credit_amount")) for line in lines if base._money(line.get("credit_amount")) > 0], "lines": base._preview_lines(lines), "total_debit": f"{total_debit:.2f}", "total_credit": f"{total_credit:.2f}", "is_balanced": bool(lines and total_debit == total_credit), "tax_lines": [], "finance_account_line": candidate.get("finance_account"), "warnings": warnings, "blockers": list(dict.fromkeys([item for item in blockers if item])), "can_post": bool(candidate["can_post"] and lines and total_debit == total_credit and not blockers), "idempotency_key": candidate["idempotency_key"], "safety_text": STOCK_LEDGER_SAFETY_TEXT}
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
        if candidate.get("source_model") == SALARY_SHEET_SOURCE_MODEL:
            if not confirmed:
                raise ValueError("Explicit confirmation is required before posting.")
            key = (idempotency_key or "").strip()
            if not key:
                raise ValueError("idempotency_key is required.")
            if candidate["event_key"] not in SALARY_ACCRUAL_EVENT_KEYS:
                raise ValueError("Unsupported bridge candidate source.")
            purpose = SALARY_ACCRUAL_PURPOSE_BY_EVENT[candidate["event_key"]]
            existing = AccountingBridgePosting.objects.select_for_update().filter(source_model=SALARY_SHEET_SOURCE_MODEL, source_id=candidate["source_id"], purpose=purpose).select_related("journal_entry").first()
            if existing is not None:
                existing_key = ((existing.trace_metadata or {}).get("idempotency_key") or "").strip()
                if existing_key and existing_key == key:
                    return {"posted": False, "already_posted": True, "journal_entry": base._journal_payload(existing.journal_entry), "reconciliation_item": base._reconciliation_payload(base._latest_posting_reconciliation_item(source_model=SALARY_SHEET_SOURCE_MODEL, source_id=candidate["source_id"])), "next_action": "Run reconciliation checks and verify the pending bridge item."}
                raise ValueError("This source item has already been posted with a different or legacy idempotency key.")
            if candidate["idempotency_key"] != key:
                raise ValueError("idempotency_key does not match the current source candidate.")
            preview = preview_bridge_candidate(candidate_id)
            if not preview["can_post"]:
                raise ValueError("; ".join(preview["blockers"]) or "Candidate is not postable.")
            row = SalarySheet.objects.select_for_update().select_related("employee", "employee__payroll_expense_account", "payroll_period").get(pk=candidate["source_id"])
            if row.status != SalarySheetStatus.APPROVED:
                raise ValueError("SalarySheet must remain approved/finalized at posting time.")
            salary_before = _salary_sheet_snapshot(row)
            employee_before = _employee_snapshot(row)
            salary_payment_count_before = SalaryPayment.objects.filter(salary_sheet_id=row.id).count()
            lines, _warnings, finance_account = _lines_for_candidate(candidate)
            total_debit, total_credit = base._line_totals(lines)
            if not lines or total_debit != total_credit:
                raise ValueError("Bridge posting preview is not balanced.")
            entry_date = date.fromisoformat(candidate["source_date"])
            journal, created = post_bridge_entry(
                source_instance=row,
                purpose=purpose,
                entry_date=entry_date,
                memo=f"Bridge posting SalarySheet {row.id} {candidate['event_key']}",
                lines=lines,
                voucher_type=purpose,
                source_type="SALARY_ACCRUAL",
                source_reference=_salary_sheet_reference(row),
                source_document_no=_salary_sheet_reference(row),
                source_event_date=entry_date,
                trace_metadata={
                    "event_key": candidate["event_key"],
                    "idempotency_key": key,
                    "posting_note": posting_note,
                    "source_model": SALARY_SHEET_SOURCE_MODEL,
                    "source_id": candidate["source_id"],
                    "salary_sheet_id": row.id,
                    "employee_id": row.employee_id,
                    "employee_code": row.employee.employee_code,
                    "payroll_period_id": row.payroll_period_id,
                    "payroll_period_code": getattr(row.payroll_period, "code", None),
                    "amount": candidate["amount"],
                    "gross_amount": candidate.get("gross_salary"),
                    "deductions_amount": candidate.get("deductions_amount"),
                    "payable_amount": candidate.get("payable_amount"),
                    "payroll_source_mutation": False,
                    "staff_mutation": False,
                    "attendance_mutation": False,
                    "staff_advance_mutation": False,
                    "payment_mutation": False,
                    "salary_payment_posting": False,
                },
                posted_by=actor,
            )
            row.refresh_from_db()
            row.employee.refresh_from_db()
            if _salary_sheet_snapshot(row) != salary_before:
                raise ValueError("SalarySheet source mutation detected; bridge posting rolled back.")
            if _employee_snapshot(row) != employee_before:
                raise ValueError("Staff source mutation detected; bridge posting rolled back.")
            if SalaryPayment.objects.filter(salary_sheet_id=row.id).count() != salary_payment_count_before:
                raise ValueError("Salary payment mutation detected; bridge posting rolled back.")
            item = base._latest_posting_reconciliation_item(source_model=SALARY_SHEET_SOURCE_MODEL, source_id=candidate["source_id"])
            if created and not (item and item.exception_code == "POSTED_UNVERIFIED"):
                item = base._create_pending_reconciliation_item(journal=journal, source_model=SALARY_SHEET_SOURCE_MODEL, source_id=candidate["source_id"], source_label=_salary_sheet_reference(row), amount=base._money(candidate["amount"]), candidate_id=candidate_id, actor=actor, note=posting_note)
            base._log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model=SALARY_SHEET_SOURCE_MODEL, source_id=int(candidate["source_id"]), event_key=candidate["event_key"], amount=base._money(candidate["amount"]), candidate_key=key, reconciliation_item=item)
            return {"posted": created, "already_posted": not created, "journal_entry": base._journal_payload(journal), "reconciliation_item": base._reconciliation_payload(item), "next_action": "Run reconciliation checks and verify the pending bridge item."}
        if candidate.get("source_model") == SALARY_PAYMENT_SOURCE_MODEL:
            if not confirmed:
                raise ValueError("Explicit confirmation is required before posting.")
            key = (idempotency_key or "").strip()
            if not key:
                raise ValueError("idempotency_key is required.")
            if candidate["event_key"] not in SALARY_PAYMENT_EVENT_KEYS:
                raise ValueError("Unsupported bridge candidate source.")
            purpose = SALARY_PAYMENT_PURPOSE_BY_EVENT[candidate["event_key"]]
            existing = AccountingBridgePosting.objects.select_for_update().filter(source_model=SALARY_PAYMENT_SOURCE_MODEL, source_id=candidate["source_id"], purpose=purpose).select_related("journal_entry").first()
            if existing is not None:
                existing_key = ((existing.trace_metadata or {}).get("idempotency_key") or "").strip()
                if existing_key and existing_key == key:
                    return {"posted": False, "already_posted": True, "journal_entry": base._journal_payload(existing.journal_entry), "reconciliation_item": base._reconciliation_payload(base._latest_posting_reconciliation_item(source_model=SALARY_PAYMENT_SOURCE_MODEL, source_id=candidate["source_id"])), "next_action": "Run reconciliation checks and verify the pending bridge item."}
                raise ValueError("This source item has already been posted with a different or legacy idempotency key.")
            if candidate["idempotency_key"] != key:
                raise ValueError("idempotency_key does not match the current source candidate.")
            preview = preview_bridge_candidate(candidate_id)
            if not preview["can_post"]:
                raise ValueError("; ".join(preview["blockers"]) or "Candidate is not postable.")
            row = SalaryPayment.objects.select_for_update().select_related("salary_sheet", "salary_sheet__employee", "finance_account", "finance_account__chart_account", "branch").get(pk=candidate["source_id"])
            if row.posted_journal_entry_id:
                raise ValueError("SalaryPayment already has a posted journal reference; F13 will not duplicate salary payment accounting.")
            payment_before = _salary_payment_snapshot(row)
            salary_before = _salary_sheet_snapshot(row.salary_sheet)
            employee_before = _employee_snapshot(row.salary_sheet)
            lines, _warnings, finance_account = _lines_for_candidate(candidate)
            total_debit, total_credit = base._line_totals(lines)
            if not lines or total_debit != total_credit:
                raise ValueError("Bridge posting preview is not balanced.")
            journal, created = post_bridge_entry(
                source_instance=row,
                purpose=purpose,
                entry_date=row.payment_date,
                memo=f"Bridge posting SalaryPayment {row.id} {candidate['event_key']}",
                lines=lines,
                voucher_type=purpose,
                source_type="SALARY_PAYMENT",
                source_reference=_salary_payment_reference(row),
                source_document_no=_salary_payment_reference(row),
                source_event_date=row.payment_date,
                trace_metadata={
                    "event_key": candidate["event_key"],
                    "idempotency_key": key,
                    "posting_note": posting_note,
                    "source_model": SALARY_PAYMENT_SOURCE_MODEL,
                    "source_id": candidate["source_id"],
                    "salary_payment_id": row.id,
                    "salary_sheet_id": row.salary_sheet_id,
                    "employee_id": row.salary_sheet.employee_id,
                    "employee_code": row.salary_sheet.employee.employee_code,
                    "finance_account_id": getattr(finance_account, "id", None),
                    "amount": candidate["amount"],
                    "payment_method": getattr(finance_account, "kind", None),
                    "salary_payment_mutation": False,
                    "salary_sheet_mutation": False,
                    "staff_mutation": False,
                    "attendance_mutation": False,
                    "staff_advance_mutation": False,
                    "salary_sheet_status_mutation": False,
                },
                posted_by=actor,
            )
            row.refresh_from_db()
            row.salary_sheet.refresh_from_db()
            row.salary_sheet.employee.refresh_from_db()
            if _salary_payment_snapshot(row) != payment_before:
                raise ValueError("SalaryPayment source mutation detected; bridge posting rolled back.")
            if _salary_sheet_snapshot(row.salary_sheet) != salary_before:
                raise ValueError("SalarySheet source mutation detected; bridge posting rolled back.")
            if _employee_snapshot(row.salary_sheet) != employee_before:
                raise ValueError("Staff source mutation detected; bridge posting rolled back.")
            item = base._latest_posting_reconciliation_item(source_model=SALARY_PAYMENT_SOURCE_MODEL, source_id=candidate["source_id"])
            if created and not (item and item.exception_code == "POSTED_UNVERIFIED"):
                item = base._create_pending_reconciliation_item(journal=journal, source_model=SALARY_PAYMENT_SOURCE_MODEL, source_id=candidate["source_id"], source_label=_salary_payment_reference(row), amount=base._money(candidate["amount"]), candidate_id=candidate_id, actor=actor, note=posting_note)
            base._log_candidate_post(journal=journal, actor=actor, candidate_id=candidate_id, source_model=SALARY_PAYMENT_SOURCE_MODEL, source_id=int(candidate["source_id"]), event_key=candidate["event_key"], amount=base._money(candidate["amount"]), candidate_key=key, reconciliation_item=item)
            return {"posted": created, "already_posted": not created, "journal_entry": base._journal_payload(journal), "reconciliation_item": base._reconciliation_payload(item), "next_action": "Run reconciliation checks and verify the pending bridge item."}
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
            journal, created = post_bridge_entry(source_instance=row, purpose=purpose, entry_date=row.movement_date, memo=f"Bridge posting StockLedger {row.id} {candidate['event_key']}", lines=lines, voucher_type=purpose, source_type="STOCK_LEDGER", source_reference=_stock_ledger_reference(row), source_document_no=_stock_ledger_reference(row), source_event_date=row.movement_date, trace_metadata={"event_key": candidate["event_key"], "idempotency_key": key, "posting_note": posting_note, "source_model": STOCK_LEDGER_SOURCE_MODEL, "source_id": candidate["source_id"], "inventory_item_id": row.inventory_item_id, "stock_location_id": row.stock_location_id, "branch_id": getattr(row.stock_location, "branch_id", None), "movement_type": row.movement_type, "quantity": candidate.get("quantity"), "quantity_out": candidate.get("quantity_out"), "unit_cost": candidate.get("unit_cost"), "amount": candidate["amount"], "cogs_amount": candidate.get("cogs_amount"), "cost_evidence": candidate.get("cost_evidence"), "reference_model": row.reference_model, "reference_id": row.reference_id, "stock_ledger_mutation": False, "inventory_item_mutation": False, "quantity_mutation": False, "valuation_mutation": False, "sale_delivery_mutation": False, "purchase_bill_mutation": False, "vendor_payment_mutation": False, "cogs_posting": candidate["event_key"] in COGS_STOCK_LEDGER_EVENT_KEYS}, posted_by=actor)
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
    payroll_counter = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == SALARY_SHEET_SOURCE_MODEL)
    payroll_posted_unverified = sum(1 for row in rows if row.get("source_model") == SALARY_SHEET_SOURCE_MODEL and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    salary_payment_counter = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == SALARY_PAYMENT_SOURCE_MODEL)
    salary_payment_posted_unverified = sum(1 for row in rows if row.get("source_model") == SALARY_PAYMENT_SOURCE_MODEL and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    counter = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == PURCHASE_BILL_SOURCE_MODEL)
    posted_unverified = sum(1 for row in rows if row.get("source_model") == PURCHASE_BILL_SOURCE_MODEL and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    vendor_counter = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == VENDOR_PAYMENT_SOURCE_MODEL)
    vendor_posted_unverified = sum(1 for row in rows if row.get("source_model") == VENDOR_PAYMENT_SOURCE_MODEL and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    stock_counter = Counter(row.get("status") or "INFO" for row in rows if row.get("source_model") == STOCK_LEDGER_SOURCE_MODEL)
    stock_posted_unverified = sum(1 for row in rows if row.get("source_model") == STOCK_LEDGER_SOURCE_MODEL and row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    cogs_rows = [row for row in rows if row.get("source_model") == STOCK_LEDGER_SOURCE_MODEL and (row.get("event_key") in COGS_STOCK_LEDGER_EVENT_KEYS or row.get("event_key") == DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY)]
    cogs_counter = Counter(row.get("status") or "INFO" for row in cogs_rows)
    summary.update({"payroll_ready_unposted_count": payroll_counter.get("READY_UNPOSTED", 0), "payroll_posted_count": payroll_counter.get("POSTED", 0), "payroll_posted_unverified_count": payroll_posted_unverified, "payroll_reconciled_count": payroll_counter.get("RECONCILED", 0), "payroll_blocked_count": sum(v for k, v in payroll_counter.items() if str(k).startswith("BLOCKED")), "payroll_unsupported_count": payroll_counter.get("UNSUPPORTED_SOURCE", 0), "salary_payment_ready_unposted_count": salary_payment_counter.get("READY_UNPOSTED", 0), "salary_payment_posted_count": salary_payment_counter.get("POSTED", 0), "salary_payment_posted_unverified_count": salary_payment_posted_unverified, "salary_payment_reconciled_count": salary_payment_counter.get("RECONCILED", 0), "salary_payment_blocked_count": sum(v for k, v in salary_payment_counter.items() if str(k).startswith("BLOCKED")), "salary_payment_unsupported_count": salary_payment_counter.get("UNSUPPORTED_SOURCE", 0), "purchase_bill_ready_unposted_count": counter.get("READY_UNPOSTED", 0), "purchase_bill_posted_count": counter.get("POSTED", 0), "purchase_bill_posted_unverified_count": posted_unverified, "purchase_bill_reconciled_count": counter.get("RECONCILED", 0), "purchase_bill_blocked_count": sum(v for k, v in counter.items() if str(k).startswith("BLOCKED")), "purchase_bill_unsupported_count": counter.get("UNSUPPORTED_SOURCE", 0), "vendor_payment_ready_unposted_count": vendor_counter.get("READY_UNPOSTED", 0), "vendor_payment_posted_count": vendor_counter.get("POSTED", 0), "vendor_payment_posted_unverified_count": vendor_posted_unverified, "vendor_payment_reconciled_count": vendor_counter.get("RECONCILED", 0), "vendor_payment_blocked_count": sum(v for k, v in vendor_counter.items() if str(k).startswith("BLOCKED")), "vendor_payment_unsupported_count": vendor_counter.get("UNSUPPORTED_SOURCE", 0), "stock_ledger_ready_unposted_count": stock_counter.get("READY_UNPOSTED", 0), "stock_ledger_posted_count": stock_counter.get("POSTED", 0), "stock_ledger_posted_unverified_count": stock_posted_unverified, "stock_ledger_reconciled_count": stock_counter.get("RECONCILED", 0), "stock_ledger_blocked_count": sum(v for k, v in stock_counter.items() if str(k).startswith("BLOCKED")), "stock_ledger_unsupported_count": stock_counter.get("UNSUPPORTED_SOURCE", 0), "stock_ledger_deferred_cogs_count": sum(1 for row in cogs_rows if row.get("event_key") == DEFERRED_COGS_STOCK_LEDGER_EVENT_KEY), "stock_ledger_cogs_ready_unposted_count": cogs_counter.get("READY_UNPOSTED", 0), "stock_ledger_cogs_posted_unverified_count": sum(1 for row in cogs_rows if row.get("reconciliation_state") == "POSTED_UNVERIFIED"), "stock_ledger_cogs_reconciled_count": cogs_counter.get("RECONCILED", 0), "stock_ledger_cogs_blocked_count": sum(v for k, v in cogs_counter.items() if str(k).startswith("BLOCKED")), "stock_ledger_cogs_unsupported_count": cogs_counter.get("UNSUPPORTED_SOURCE", 0)})
    return summary
