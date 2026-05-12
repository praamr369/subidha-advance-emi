from __future__ import annotations

from dataclasses import dataclass

from accounting.models import ChartOfAccountType


@dataclass(frozen=True)
class CanonicalChartAccountSpec:
    key: str
    code: str
    name: str
    account_type: str
    allow_manual_posting: bool = False
    role: str = "system_profile"  # manual_collection | system_profile
    finance_account_default_name: str | None = None


MANUAL_COLLECTION_CHART_ACCOUNTS: tuple[CanonicalChartAccountSpec, ...] = (
    CanonicalChartAccountSpec(
        key="CASH_COLLECTION",
        code="CASH-1000",
        name="Cash in Hand",
        account_type=ChartOfAccountType.ASSET,
        allow_manual_posting=False,
        role="manual_collection",
        finance_account_default_name="Main Cash Desk",
    ),
    CanonicalChartAccountSpec(
        key="BANK_COLLECTION",
        code="BANK-1010",
        name="Bank Account",
        account_type=ChartOfAccountType.ASSET,
        allow_manual_posting=False,
        role="manual_collection",
        finance_account_default_name="Main Bank Account",
    ),
    CanonicalChartAccountSpec(
        key="UPI_COLLECTION",
        code="UPI-1020",
        name="UPI Collection Account",
        account_type=ChartOfAccountType.ASSET,
        allow_manual_posting=False,
        role="manual_collection",
        finance_account_default_name="UPI Account",
    ),
    CanonicalChartAccountSpec(
        key="PAYMENT_GATEWAY_COLLECTION",
        code="PGW-1030",
        name="Payment Gateway Settlement Account",
        account_type=ChartOfAccountType.ASSET,
        allow_manual_posting=False,
        role="manual_collection",
        finance_account_default_name="Payment Gateway Settlement Account",
    ),
)


SYSTEM_POSTING_PROFILE_ACCOUNTS: tuple[CanonicalChartAccountSpec, ...] = (
    CanonicalChartAccountSpec(
        key="CUSTOMER_RECEIVABLE",
        code="AR-1000",
        name="Accounts Receivable",
        account_type=ChartOfAccountType.ASSET,
    ),
    CanonicalChartAccountSpec(
        key="CUSTOMER_ADVANCE_UNEARNED_REVENUE",
        code="ADV-2200",
        name="Customer Advances and Unapplied Receipts",
        account_type=ChartOfAccountType.LIABILITY,
    ),
    CanonicalChartAccountSpec(
        key="ACCOUNTS_PAYABLE",
        code="AP-2000",
        name="Accounts Payable",
        account_type=ChartOfAccountType.LIABILITY,
    ),
    CanonicalChartAccountSpec(
        key="INVENTORY_ASSET",
        code="INV-1200",
        name="Inventory Asset",
        account_type=ChartOfAccountType.ASSET,
    ),
    CanonicalChartAccountSpec(
        key="WORK_IN_PROGRESS_INVENTORY",
        code="INV-1210",
        name="Work In Progress Inventory",
        account_type=ChartOfAccountType.ASSET,
    ),
    CanonicalChartAccountSpec(
        key="INVENTORY_ADJUSTMENT",
        code="INV-5100",
        name="Inventory Adjustments",
        account_type=ChartOfAccountType.EXPENSE,
    ),
    CanonicalChartAccountSpec(
        key="PURCHASE_EXPENSE",
        code="PUR-5000",
        name="Purchase Expense",
        account_type=ChartOfAccountType.EXPENSE,
    ),
    CanonicalChartAccountSpec(
        key="SALES_REVENUE",
        code="REV-4000",
        name="Sales Revenue",
        account_type=ChartOfAccountType.INCOME,
    ),
    CanonicalChartAccountSpec(
        key="SALES_RETURNS",
        code="REV-4010",
        name="Sales Returns and Allowances",
        account_type=ChartOfAccountType.EXPENSE,
    ),
    CanonicalChartAccountSpec(
        key="EMI_INCOME",
        code="EMI-4000",
        name="Advance EMI Collection Income",
        account_type=ChartOfAccountType.INCOME,
    ),
    CanonicalChartAccountSpec(
        key="EMI_COLLECTION_CLEARING",
        code="EMI-2100",
        name="EMI Collection Clearing",
        account_type=ChartOfAccountType.LIABILITY,
    ),
    CanonicalChartAccountSpec(
        key="EMI_WAIVER_RESERVE",
        code="EMI-2200",
        name="EMI Winner Waiver Reserve",
        account_type=ChartOfAccountType.LIABILITY,
    ),
    CanonicalChartAccountSpec(
        key="EMI_WAIVER_EXPENSE",
        code="EMI-5200",
        name="EMI Winner Waiver Expense",
        account_type=ChartOfAccountType.EXPENSE,
    ),
    CanonicalChartAccountSpec(
        key="RENT_INCOME",
        code="RENT-4000",
        name="Rent Income",
        account_type=ChartOfAccountType.INCOME,
    ),
    CanonicalChartAccountSpec(
        key="LEASE_INCOME",
        code="LEASE-4000",
        name="Lease Income",
        account_type=ChartOfAccountType.INCOME,
    ),
    CanonicalChartAccountSpec(
        key="SECURITY_DEPOSIT_LIABILITY",
        code="SEC-2300",
        name="Rent/Lease Security Deposit Liability",
        account_type=ChartOfAccountType.LIABILITY,
    ),
    CanonicalChartAccountSpec(
        key="PARTNER_COMMISSION_PAYABLE",
        code="COM-2100",
        name="Partner Commission Payable",
        account_type=ChartOfAccountType.LIABILITY,
    ),
    CanonicalChartAccountSpec(
        key="PARTNER_COMMISSION_EXPENSE",
        code="COM-5100",
        name="Partner Commission Expense",
        account_type=ChartOfAccountType.EXPENSE,
    ),
    CanonicalChartAccountSpec(
        key="DELIVERY_CHARGES_INCOME",
        code="DEL-4000",
        name="Delivery Charges Income",
        account_type=ChartOfAccountType.INCOME,
    ),
    CanonicalChartAccountSpec(
        key="DELIVERY_EXPENSE",
        code="DEL-5100",
        name="Delivery Expense",
        account_type=ChartOfAccountType.EXPENSE,
    ),
    CanonicalChartAccountSpec(
        key="DAMAGE_RECOVERY",
        code="DMG-4000",
        name="Damage Recovery Income",
        account_type=ChartOfAccountType.INCOME,
    ),
    CanonicalChartAccountSpec(
        key="SALARY_PAYABLE",
        code="PAY-2100",
        name="Salary Payable",
        account_type=ChartOfAccountType.LIABILITY,
    ),
    CanonicalChartAccountSpec(
        key="PAYROLL_DEDUCTIONS_CLEARING",
        code="PAY-2200",
        name="Payroll Deductions Clearing",
        account_type=ChartOfAccountType.LIABILITY,
    ),
    CanonicalChartAccountSpec(
        key="EMPLOYEE_REIMBURSEMENT_PAYABLE",
        code="PAY-2300",
        name="Employee Reimbursement Payable",
        account_type=ChartOfAccountType.LIABILITY,
    ),
    CanonicalChartAccountSpec(
        key="SALARY_EXPENSE",
        code="PAY-5100",
        name="Salary Expense",
        account_type=ChartOfAccountType.EXPENSE,
    ),
    CanonicalChartAccountSpec(
        key="INPUT_GST",
        code="GST-1100",
        name="Input GST Receivable",
        account_type=ChartOfAccountType.ASSET,
    ),
    CanonicalChartAccountSpec(
        key="OUTPUT_GST",
        code="GST-2100",
        name="Output GST Payable",
        account_type=ChartOfAccountType.LIABILITY,
    ),
    CanonicalChartAccountSpec(
        key="GST_ADJUSTMENTS",
        code="GST-5100",
        name="GST Adjustments",
        account_type=ChartOfAccountType.EXPENSE,
    ),
    CanonicalChartAccountSpec(
        key="DEPRECIATION_EXPENSE",
        code="DEP-5200",
        name="Depreciation Expense",
        account_type=ChartOfAccountType.EXPENSE,
    ),
    CanonicalChartAccountSpec(
        key="ACCUMULATED_DEPRECIATION",
        code="DEP-1250",
        name="Accumulated Depreciation",
        account_type=ChartOfAccountType.ASSET,
    ),
    CanonicalChartAccountSpec(
        key="OWNER_CAPITAL",
        code="EQ-3000",
        name="Owner Capital",
        account_type=ChartOfAccountType.EQUITY,
    ),
    CanonicalChartAccountSpec(
        key="RETAINED_EARNINGS",
        code="EQ-3100",
        name="Retained Earnings / Opening Balance Adjustment",
        account_type=ChartOfAccountType.EQUITY,
    ),
)


CANONICAL_CHART_ACCOUNTS: tuple[CanonicalChartAccountSpec, ...] = (
    *MANUAL_COLLECTION_CHART_ACCOUNTS,
    *SYSTEM_POSTING_PROFILE_ACCOUNTS,
)

CANONICAL_CHART_ACCOUNT_BY_KEY: dict[str, CanonicalChartAccountSpec] = {
    spec.key: spec for spec in CANONICAL_CHART_ACCOUNTS
}

CANONICAL_CHART_ACCOUNT_BY_CODE: dict[str, CanonicalChartAccountSpec] = {
    spec.code: spec for spec in CANONICAL_CHART_ACCOUNTS
}

