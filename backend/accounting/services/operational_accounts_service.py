from __future__ import annotations

from accounting.models import ChartOfAccountType
from accounting.services.gst_document_posting_service import _ensure_system_account


def ensure_phase3_system_accounts():
    return {
        "ACCOUNTS_RECEIVABLE": _ensure_system_account(
            system_code="ACCOUNTS_RECEIVABLE",
            code="AR-1000",
            name="Accounts Receivable",
            account_type=ChartOfAccountType.ASSET,
        ),
        "ACCOUNTS_PAYABLE": _ensure_system_account(
            system_code="ACCOUNTS_PAYABLE",
            code="AP-2000",
            name="Accounts Payable",
            account_type=ChartOfAccountType.LIABILITY,
        ),
        "SALES_REVENUE": _ensure_system_account(
            system_code="SALES_REVENUE",
            code="REV-4000",
            name="Sales Revenue",
            account_type=ChartOfAccountType.INCOME,
        ),
        "SALES_RETURNS": _ensure_system_account(
            system_code="SALES_RETURNS",
            code="REV-4010",
            name="Sales Returns and Allowances",
            account_type=ChartOfAccountType.EXPENSE,
        ),
        "OUTPUT_GST": _ensure_system_account(
            system_code="OUTPUT_GST",
            code="GST-2100",
            name="Output GST Payable",
            account_type=ChartOfAccountType.LIABILITY,
        ),
        "INPUT_GST": _ensure_system_account(
            system_code="INPUT_GST",
            code="GST-1100",
            name="Input GST Receivable",
            account_type=ChartOfAccountType.ASSET,
        ),
        "EMI_COLLECTION_CLEARING": _ensure_system_account(
            system_code="EMI_COLLECTION_CLEARING",
            code="EMI-2100",
            name="EMI Collection Clearing",
            account_type=ChartOfAccountType.LIABILITY,
        ),
        "EMI_WAIVER_EXPENSE": _ensure_system_account(
            system_code="EMI_WAIVER_EXPENSE",
            code="EMI-5200",
            name="EMI Winner Waiver Expense",
            account_type=ChartOfAccountType.EXPENSE,
        ),
        "EMI_WAIVER_RESERVE": _ensure_system_account(
            system_code="EMI_WAIVER_RESERVE",
            code="EMI-2200",
            name="EMI Winner Waiver Reserve",
            account_type=ChartOfAccountType.LIABILITY,
        ),
        "INVENTORY_ASSET": _ensure_system_account(
            system_code="INVENTORY_ASSET",
            code="INV-1200",
            name="Inventory Asset",
            account_type=ChartOfAccountType.ASSET,
        ),
        "INVENTORY_ADJUSTMENT": _ensure_system_account(
            system_code="INVENTORY_ADJUSTMENT",
            code="INV-5100",
            name="Inventory Adjustments",
            account_type=ChartOfAccountType.EXPENSE,
        ),
        "PURCHASE_EXPENSE": _ensure_system_account(
            system_code="PURCHASE_EXPENSE",
            code="PUR-5000",
            name="Purchase Expense",
            account_type=ChartOfAccountType.EXPENSE,
        ),
        "PARTNER_COMMISSION_EXPENSE": _ensure_system_account(
            system_code="PARTNER_COMMISSION_EXPENSE",
            code="COM-5100",
            name="Partner Commission Expense",
            account_type=ChartOfAccountType.EXPENSE,
        ),
        "PARTNER_COMMISSION_PAYABLE": _ensure_system_account(
            system_code="PARTNER_COMMISSION_PAYABLE",
            code="COM-2100",
            name="Partner Commission Payable",
            account_type=ChartOfAccountType.LIABILITY,
        ),
        "DEPRECIATION_EXPENSE": _ensure_system_account(
            system_code="DEPRECIATION_EXPENSE",
            code="DEP-5200",
            name="Depreciation Expense",
            account_type=ChartOfAccountType.EXPENSE,
        ),
        "ACCUMULATED_DEPRECIATION": _ensure_system_account(
            system_code="ACCUMULATED_DEPRECIATION",
            code="DEP-1250",
            name="Accumulated Depreciation",
            account_type=ChartOfAccountType.ASSET,
        ),
    }
