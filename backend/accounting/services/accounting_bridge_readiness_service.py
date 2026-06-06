from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from django.apps import apps
from django.utils import timezone

from accounting.models import (
    BusinessTaxProfile,
    BusinessTaxRegistrationMode,
    ChartOfAccount,
    ChartOfAccountType,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
    RentLeaseAccountingAccountMapping,
)
from accounting.services.accounting_setup_catalog import CANONICAL_CHART_ACCOUNT_BY_KEY
from accounting.services.document_sequence_service import (
    DocumentNumberingSetupError,
    DocumentType,
    validate_document_numbering_ready,
)
from accounting.services.period_service import build_accounting_period_readiness


STATUS_READY = "READY"
STATUS_INFO = "INFO"
STATUS_WARNING = "WARNING"
STATUS_ERROR = "ERROR"
STATUS_NOT_CONFIGURED = "NOT_CONFIGURED"
POSTING_MODE_AUDIT_DEFERRED = "AUDIT_DEFERRED"

COLLECTION_FINANCE_ACCOUNT_KINDS: tuple[str, ...] = (
    FinanceAccountKind.CASH,
    FinanceAccountKind.BANK,
    FinanceAccountKind.UPI,
)

COLLECTION_PURPOSE_BY_KIND: dict[str, str] = {
    FinanceAccountKind.CASH: FinanceAccountMappingPurpose.CASH_COLLECTION,
    FinanceAccountKind.BANK: FinanceAccountMappingPurpose.BANK_COLLECTION,
    FinanceAccountKind.UPI: FinanceAccountMappingPurpose.UPI_COLLECTION,
}

PURPOSE_EXPECTED_ACCOUNT_TYPE: dict[str, str] = {
    FinanceAccountMappingPurpose.CASH_COLLECTION: ChartOfAccountType.ASSET,
    FinanceAccountMappingPurpose.UPI_COLLECTION: ChartOfAccountType.ASSET,
    FinanceAccountMappingPurpose.BANK_COLLECTION: ChartOfAccountType.ASSET,
    FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION: ChartOfAccountType.ASSET,
    FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE: ChartOfAccountType.ASSET,
    FinanceAccountMappingPurpose.SECURITY_DEPOSIT_LIABILITY: ChartOfAccountType.LIABILITY,
    FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE: ChartOfAccountType.LIABILITY,
    FinanceAccountMappingPurpose.EMI_INCOME: ChartOfAccountType.INCOME,
    FinanceAccountMappingPurpose.RENT_INCOME: ChartOfAccountType.INCOME,
    FinanceAccountMappingPurpose.LEASE_INCOME: ChartOfAccountType.INCOME,
    FinanceAccountMappingPurpose.DIRECT_SALE_INCOME: ChartOfAccountType.INCOME,
    FinanceAccountMappingPurpose.DELIVERY_CHARGES_INCOME: ChartOfAccountType.INCOME,
    FinanceAccountMappingPurpose.WAIVER_LOSS: ChartOfAccountType.EXPENSE,
    FinanceAccountMappingPurpose.COMMISSION_PAYABLE: ChartOfAccountType.LIABILITY,
    FinanceAccountMappingPurpose.COMMISSION_EXPENSE: ChartOfAccountType.EXPENSE,
    FinanceAccountMappingPurpose.DAMAGE_RECOVERY: ChartOfAccountType.INCOME,
    FinanceAccountMappingPurpose.DELIVERY_EXPENSE: ChartOfAccountType.EXPENSE,
    FinanceAccountMappingPurpose.SALARY_EXPENSE: ChartOfAccountType.EXPENSE,
    FinanceAccountMappingPurpose.INVENTORY_ASSET: ChartOfAccountType.ASSET,
}

@dataclass(frozen=True)
class BridgeEventSpec:
    event_key: str
    label: str
    source_module: str
    source_app: str
    source_model: str
    event_group: str
    debit_requirements: tuple[str, ...]
    credit_requirements: tuple[str, ...]
    debit_mapping_purposes: tuple[str, ...] = ()
    credit_mapping_purposes: tuple[str, ...] = ()
    debit_coa_system_codes: tuple[str, ...] = ()
    credit_coa_system_codes: tuple[str, ...] = ()
    required_finance_account_kinds: tuple[str, ...] = ()
    requires_rent_lease_mapping: bool = False
    posting_mode: str = POSTING_MODE_AUDIT_DEFERRED
    operator_action: str = (
        "Review mapping readiness only. Future posting must use an approved, explicit accounting bridge workflow."
    )

    @property
    def required_coa_system_codes(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys((*self.debit_coa_system_codes, *self.credit_coa_system_codes)))

    @property
    def required_mapping_purposes(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys((*self.debit_mapping_purposes, *self.credit_mapping_purposes)))


EVENT_REGISTRY: tuple[BridgeEventSpec, ...] = (
    BridgeEventSpec(
        event_key="advance_emi_collection",
        label="Advance EMI collection",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="Payment",
        event_group="EMI",
        debit_requirements=("Cash / Bank / UPI FinanceAccount",),
        credit_requirements=("CUSTOMER_RECEIVABLE", "EMI_INCOME"),
        debit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        credit_mapping_purposes=(
            FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,
            FinanceAccountMappingPurpose.EMI_INCOME,
        ),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
    ),
    BridgeEventSpec(
        event_key="subscription_emi_payment",
        label="Subscription EMI payment",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="Payment",
        event_group="EMI",
        debit_requirements=("Cash / Bank / UPI FinanceAccount",),
        credit_requirements=("CUSTOMER_RECEIVABLE",),
        debit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
    ),
    BridgeEventSpec(
        event_key="subscription_emi_waiver_loss",
        label="Subscription EMI waiver loss",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="AuditLog",
        event_group="EMI",
        debit_requirements=("WAIVER_LOSS",),
        credit_requirements=("EMI_WAIVER_RESERVE",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.WAIVER_LOSS,),
        credit_coa_system_codes=("EMI_WAIVER_RESERVE",),
    ),
    BridgeEventSpec(
        event_key="direct_sale_invoice",
        label="Direct sale invoice",
        source_module="billing",
        source_app="billing",
        source_model="BillingInvoice",
        event_group="Direct Sale",
        debit_requirements=("CUSTOMER_RECEIVABLE",),
        credit_requirements=("DIRECT_SALE_INCOME", "OUTPUT_GST when GST enabled"),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.DIRECT_SALE_INCOME,),
    ),
    BridgeEventSpec(
        event_key="direct_sale_receipt",
        label="Direct sale receipt",
        source_module="billing",
        source_app="billing",
        source_model="ReceiptDocument",
        event_group="Direct Sale",
        debit_requirements=("Cash / Bank / UPI FinanceAccount",),
        credit_requirements=("CUSTOMER_RECEIVABLE",),
        debit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
    ),
    BridgeEventSpec(
        event_key="direct_sale_return",
        label="Direct sale return",
        source_module="billing",
        source_app="billing",
        source_model="DirectSaleReturn",
        event_group="Direct Sale",
        debit_requirements=("SALES_RETURNS",),
        credit_requirements=("CUSTOMER_RECEIVABLE",),
        debit_coa_system_codes=("SALES_RETURNS",),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
    ),
    BridgeEventSpec(
        event_key="direct_sale_outstanding",
        label="Direct sale outstanding",
        source_module="billing",
        source_app="billing",
        source_model="DirectSale",
        event_group="Direct Sale",
        debit_requirements=("CUSTOMER_RECEIVABLE",),
        credit_requirements=("DIRECT_SALE_INCOME",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.DIRECT_SALE_INCOME,),
        operator_action="Validate receivable and sales income readiness only. Outstanding collection remains controlled by direct-sale payment workflows.",
    ),
    BridgeEventSpec(
        event_key="rent_lease_monthly_collection",
        label="Rent / lease monthly collection",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="Subscription",
        event_group="Rent / Lease",
        debit_requirements=("RentLeaseAccountingAccountMapping.settlement_finance_account",),
        credit_requirements=("RentLeaseAccountingAccountMapping.monthly_income_account",),
        requires_rent_lease_mapping=True,
        operator_action="Operational mapping can be ready, but accounting posting remains audit-deferred until explicit approval.",
    ),
    BridgeEventSpec(
        event_key="security_deposit_collection",
        label="Security deposit collection",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="Subscription",
        event_group="Rent / Lease",
        debit_requirements=("RentLeaseAccountingAccountMapping.settlement_finance_account",),
        credit_requirements=("RentLeaseAccountingAccountMapping.deposit_liability_account",),
        requires_rent_lease_mapping=True,
        operator_action="Keep deposit liability mapped. Posting remains audit-deferred in this readiness-only phase.",
    ),
    BridgeEventSpec(
        event_key="security_deposit_refund",
        label="Security deposit refund",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="Subscription",
        event_group="Rent / Lease",
        debit_requirements=("RentLeaseAccountingAccountMapping.deposit_liability_account",),
        credit_requirements=("RentLeaseAccountingAccountMapping.deposit_refund_account",),
        requires_rent_lease_mapping=True,
        operator_action="Keep refund asset and liability mapping valid. Posting remains audit-deferred.",
    ),
    BridgeEventSpec(
        event_key="damage_recovery",
        label="Damage recovery",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="Subscription",
        event_group="Rent / Lease",
        debit_requirements=("RentLeaseAccountingAccountMapping.settlement_finance_account",),
        credit_requirements=("RentLeaseAccountingAccountMapping.damage_recovery_income_account",),
        requires_rent_lease_mapping=True,
        operator_action="Validate damage recovery income only; source collection remains authoritative.",
    ),
    BridgeEventSpec(
        event_key="customer_advance",
        label="Customer advance / unapplied receipt",
        source_module="billing",
        source_app="billing",
        source_model="ReceiptDocument",
        event_group="Customer Credit",
        debit_requirements=("Cash / Bank / UPI FinanceAccount",),
        credit_requirements=("CUSTOMER_ADVANCE_UNEARNED_REVENUE",),
        debit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE,),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
    ),
    BridgeEventSpec(
        event_key="refund_customer_credit",
        label="Refund / customer credit",
        source_module="billing",
        source_app="billing",
        source_model="ReceiptDocument",
        event_group="Customer Credit",
        debit_requirements=("SALES_RETURNS", "CUSTOMER_RECEIVABLE"),
        credit_requirements=("Cash / Bank / UPI FinanceAccount",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
        debit_coa_system_codes=("SALES_RETURNS",),
        credit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
    ),
    BridgeEventSpec(
        event_key="commission_accrual",
        label="Commission accrual",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="Commission",
        event_group="Commission",
        debit_requirements=("COMMISSION_EXPENSE",),
        credit_requirements=("COMMISSION_PAYABLE",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.COMMISSION_EXPENSE,),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.COMMISSION_PAYABLE,),
    ),
    BridgeEventSpec(
        event_key="commission_payout",
        label="Commission payout",
        source_module="subscriptions",
        source_app="subscriptions",
        source_model="CommissionPayoutBatch",
        event_group="Commission",
        debit_requirements=("COMMISSION_PAYABLE",),
        credit_requirements=("Cash / Bank / UPI FinanceAccount",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.COMMISSION_PAYABLE,),
        credit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
    ),
    BridgeEventSpec(
        event_key="vendor_purchase_bill",
        label="Vendor purchase bill",
        source_module="inventory",
        source_app="inventory",
        source_model="PurchaseBill",
        event_group="Vendor / Inventory",
        debit_requirements=("INVENTORY_ASSET", "INPUT_GST"),
        credit_requirements=("ACCOUNTS_PAYABLE",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        debit_coa_system_codes=("INPUT_GST",),
        credit_coa_system_codes=("ACCOUNTS_PAYABLE",),
    ),
    BridgeEventSpec(
        event_key="vendor_payment",
        label="Vendor payment",
        source_module="accounting",
        source_app="accounting",
        source_model="VendorSettlement",
        event_group="Vendor / Inventory",
        debit_requirements=("ACCOUNTS_PAYABLE",),
        credit_requirements=("Cash / Bank / UPI FinanceAccount",),
        debit_coa_system_codes=("ACCOUNTS_PAYABLE",),
        credit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
    ),
    BridgeEventSpec(
        event_key="salary_expense",
        label="Salary expense accrual",
        source_module="accounting",
        source_app="accounting",
        source_model="SalarySheet",
        event_group="Payroll",
        debit_requirements=("SALARY_EXPENSE",),
        credit_requirements=("SALARY_PAYABLE",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.SALARY_EXPENSE,),
        credit_coa_system_codes=("SALARY_PAYABLE",),
    ),
    BridgeEventSpec(
        event_key="salary_payment",
        label="Salary payment",
        source_module="accounting",
        source_app="accounting",
        source_model="SalaryPayment",
        event_group="Payroll",
        debit_requirements=("SALARY_PAYABLE",),
        credit_requirements=("Cash / Bank / UPI FinanceAccount",),
        debit_coa_system_codes=("SALARY_PAYABLE",),
        credit_mapping_purposes=(
            FinanceAccountMappingPurpose.CASH_COLLECTION,
            FinanceAccountMappingPurpose.BANK_COLLECTION,
            FinanceAccountMappingPurpose.UPI_COLLECTION,
        ),
        required_finance_account_kinds=COLLECTION_FINANCE_ACCOUNT_KINDS,
    ),
    BridgeEventSpec(
        event_key="inventory_purchase_receive",
        label="Inventory purchase receive",
        source_module="inventory",
        source_app="inventory",
        source_model="StockLedger",
        event_group="Vendor / Inventory",
        debit_requirements=("INVENTORY_ASSET",),
        credit_requirements=("ACCOUNTS_PAYABLE",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        credit_coa_system_codes=("ACCOUNTS_PAYABLE",),
    ),
    BridgeEventSpec(
        event_key="inventory_delivery_out",
        label="Inventory delivery out",
        source_module="inventory",
        source_app="inventory",
        source_model="StockLedger",
        event_group="Vendor / Inventory",
        debit_requirements=("DELIVERY_EXPENSE",),
        credit_requirements=("INVENTORY_ASSET",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.DELIVERY_EXPENSE,),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
    ),
    BridgeEventSpec(
        event_key="manufacturing_consumption",
        label="Manufacturing material consumption",
        source_module="manufacturing",
        source_app="manufacturing",
        source_model="ProductionJob",
        event_group="Manufacturing",
        debit_requirements=("WORK_IN_PROGRESS_INVENTORY",),
        credit_requirements=("INVENTORY_ASSET",),
        debit_coa_system_codes=("WORK_IN_PROGRESS_INVENTORY",),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
    ),
    BridgeEventSpec(
        event_key="manufacturing_output",
        label="Manufacturing finished output",
        source_module="manufacturing",
        source_app="manufacturing",
        source_model="ProductionJob",
        event_group="Manufacturing",
        debit_requirements=("INVENTORY_ASSET",),
        credit_requirements=("WORK_IN_PROGRESS_INVENTORY",),
        debit_mapping_purposes=(FinanceAccountMappingPurpose.INVENTORY_ASSET,),
        credit_coa_system_codes=("WORK_IN_PROGRESS_INVENTORY",),
    ),
    BridgeEventSpec(
        event_key="customer_return",
        label="Customer return",
        source_module="billing",
        source_app="billing",
        source_model="DirectSaleReturn",
        event_group="Direct Sale",
        debit_requirements=("SALES_RETURNS",),
        credit_requirements=("CUSTOMER_RECEIVABLE",),
        debit_coa_system_codes=("SALES_RETURNS",),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
    ),
    BridgeEventSpec(
        event_key="sales_return",
        label="Sales return",
        source_module="billing",
        source_app="billing",
        source_model="CreditNote",
        event_group="Direct Sale",
        debit_requirements=("SALES_RETURNS",),
        credit_requirements=("CUSTOMER_RECEIVABLE",),
        debit_coa_system_codes=("SALES_RETURNS",),
        credit_mapping_purposes=(FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE,),
    ),
)


def _source_model_exists(spec: BridgeEventSpec) -> bool:
    try:
        apps.get_model(spec.source_app, spec.source_model, require_ready=False)
    except LookupError:
        return False
    return True


def _chart_payload(account: ChartOfAccount | None, *, requirement: str | None = None, purpose: str | None = None) -> dict[str, Any] | None:
    if account is None:
        return None
    return {
        "id": account.id,
        "code": account.code,
        "name": account.name,
        "account_type": account.account_type,
        "type": account.account_type,
        "system_code": account.system_code,
        "is_active": account.is_active,
        "allow_manual_posting": account.allow_manual_posting,
        "requirement": requirement,
        "purpose": purpose,
    }


def _finance_account_payload(account: FinanceAccount, *, purpose: str | None = None) -> dict[str, Any]:
    return {
        "id": account.id,
        "name": account.name,
        "kind": account.kind,
        "is_active": account.is_active,
        "is_real_settlement_account": account.is_real_settlement_account,
        "purpose": purpose,
        "chart_account": _chart_payload(getattr(account, "chart_account", None)),
    }


def validate_coa(account: ChartOfAccount | None, expected_type: str | None = None) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    if account is None:
        return [{"status": STATUS_NOT_CONFIGURED, "reason": "Required Chart of Account is not configured."}]
    if not account.is_active:
        issues.append({"status": STATUS_ERROR, "reason": f"Chart account {account.code} is inactive."})
    if expected_type and account.account_type != expected_type:
        issues.append(
            {
                "status": STATUS_ERROR,
                "reason": f"Chart account {account.code} must be {expected_type}, currently {account.account_type}.",
            }
        )
    return issues


def validate_active_asset_finance_account(finance_account: FinanceAccount | None) -> list[dict[str, str]]:
    if finance_account is None:
        return [{"status": STATUS_NOT_CONFIGURED, "reason": "Required FinanceAccount is not configured."}]
    issues: list[dict[str, str]] = []
    if not finance_account.is_active:
        issues.append({"status": STATUS_ERROR, "reason": f"Finance account {finance_account.name} is inactive."})
    if not finance_account.is_real_settlement_account:
        issues.append(
            {
                "status": STATUS_ERROR,
                "reason": f"Finance account {finance_account.name} is a system profile and cannot settle operational collections.",
            }
        )
    chart_account = getattr(finance_account, "chart_account", None)
    issues.extend(validate_coa(chart_account, ChartOfAccountType.ASSET))
    return issues


def _active_mapping_for_purpose(purpose: str) -> FinanceAccountCoaMapping | None:
    return (
        FinanceAccountCoaMapping.objects.select_related("finance_account", "chart_account")
        .filter(purpose=purpose, is_active=True)
        .order_by("-is_default", "id")
        .first()
    )


def validate_finance_account_coa_mapping(finance_account: FinanceAccount) -> list[dict[str, str]]:
    purpose = COLLECTION_PURPOSE_BY_KIND.get((finance_account.kind or "").strip().upper())
    if not purpose:
        return []
    mapping = (
        FinanceAccountCoaMapping.objects.select_related("chart_account")
        .filter(finance_account=finance_account, purpose=purpose, is_active=True)
        .order_by("-is_default", "id")
        .first()
    )
    if mapping is None:
        return [
            {
                "status": STATUS_WARNING,
                "reason": f"Finance account {finance_account.name} has no active {purpose} FinanceAccountCoaMapping.",
            }
        ]
    return validate_coa(mapping.chart_account, PURPOSE_EXPECTED_ACCOUNT_TYPE.get(purpose))


def _validate_mapping_purpose(
    purpose: str,
    *,
    side: str,
    chart_accounts: list[dict[str, Any]],
    finance_accounts: list[dict[str, Any]],
) -> list[dict[str, str]]:
    mapping = _active_mapping_for_purpose(purpose)
    if mapping is None:
        return [
            {
                "status": STATUS_WARNING,
                "reason": f"Missing active FinanceAccountCoaMapping for {purpose} ({side}).",
            }
        ]

    chart_accounts.append(_chart_payload(mapping.chart_account, requirement=purpose, purpose=purpose) or {})
    finance_accounts.append(_finance_account_payload(mapping.finance_account, purpose=purpose))

    issues = validate_coa(mapping.chart_account, PURPOSE_EXPECTED_ACCOUNT_TYPE.get(purpose))
    if not mapping.finance_account.is_active:
        issues.append(
            {
                "status": STATUS_ERROR,
                "reason": f"Finance account {mapping.finance_account.name} for {purpose} is inactive.",
            }
        )
    if purpose in COLLECTION_PURPOSE_BY_KIND.values():
        if not mapping.finance_account.is_real_settlement_account:
            issues.append(
                {
                    "status": STATUS_ERROR,
                    "reason": f"{purpose} uses system-only finance account {mapping.finance_account.name}; operational collection requires a real settlement account.",
                }
            )
        issues.extend(validate_active_asset_finance_account(mapping.finance_account))
    return issues


def _expected_type_for_system_code(system_code: str) -> str | None:
    spec = CANONICAL_CHART_ACCOUNT_BY_KEY.get(system_code)
    return spec.account_type if spec else None


def _validate_system_code(system_code: str, *, chart_accounts: list[dict[str, Any]]) -> list[dict[str, str]]:
    account = ChartOfAccount.objects.filter(system_code=system_code).order_by("id").first()
    if account:
        chart_accounts.append(_chart_payload(account, requirement=system_code) or {})
    return validate_coa(account, _expected_type_for_system_code(system_code))


def _gst_liability_mapping_required() -> bool:
    return BusinessTaxProfile.objects.filter(
        is_active=True,
        mode__in=(
            BusinessTaxRegistrationMode.GST_REGULAR,
            BusinessTaxRegistrationMode.GST_COMPOSITION,
        ),
    ).exists()


def _validate_finance_account_kind(kind: str, *, finance_accounts: list[dict[str, Any]]) -> list[dict[str, str]]:
    accounts = list(
        FinanceAccount.objects.select_related("chart_account")
        .filter(kind=kind, is_active=True, is_real_settlement_account=True)
        .order_by("name", "id")
    )
    if not accounts:
        return [
            {
                "status": STATUS_NOT_CONFIGURED,
                "reason": f"No active real settlement FinanceAccount configured for {kind}.",
            }
        ]
    issues: list[dict[str, str]] = []
    for account in accounts:
        finance_accounts.append(_finance_account_payload(account, purpose=COLLECTION_PURPOSE_BY_KIND.get(kind)))
        issues.extend(validate_active_asset_finance_account(account))
    return issues


def validate_rent_lease_mapping() -> dict[str, Any]:
    mapping = (
        RentLeaseAccountingAccountMapping.objects.select_related(
            "monthly_income_account",
            "deposit_liability_account",
            "deposit_refund_account",
            "damage_recovery_income_account",
            "settlement_finance_account",
            "settlement_finance_account__chart_account",
        )
        .filter(is_active=True)
        .order_by("-created_at", "-id")
        .first()
    )
    chart_accounts: list[dict[str, Any]] = []
    finance_accounts: list[dict[str, Any]] = []
    issues: list[dict[str, str]] = []
    if mapping is None:
        return {
            "status": STATUS_NOT_CONFIGURED,
            "chart_accounts": chart_accounts,
            "finance_accounts": finance_accounts,
            "blocking_reasons": ["No active RentLeaseAccountingAccountMapping is configured."],
            "repairable": False,
        }

    checks = (
        ("monthly_income_account", ChartOfAccountType.INCOME, "monthly income"),
        ("deposit_liability_account", ChartOfAccountType.LIABILITY, "deposit liability"),
        ("deposit_refund_account", ChartOfAccountType.ASSET, "deposit refund"),
        ("damage_recovery_income_account", ChartOfAccountType.INCOME, "damage recovery"),
    )
    for field_name, expected_type, label in checks:
        account = getattr(mapping, field_name, None)
        chart_accounts.append(_chart_payload(account, requirement=label) or {})
        for issue in validate_coa(account, expected_type):
            issue["reason"] = f"Rent/lease {label}: {issue['reason']}"
            issues.append(issue)

    settlement_account = getattr(mapping, "settlement_finance_account", None)
    if settlement_account is None:
        issues.append(
            {
                "status": STATUS_WARNING,
                "reason": "Rent/lease settlement_finance_account is not configured; source collections cannot be mapped to a real settlement account.",
            }
        )
    else:
        finance_accounts.append(_finance_account_payload(settlement_account, purpose="RENT_LEASE_SETTLEMENT"))
        issues.extend(validate_active_asset_finance_account(settlement_account))

    status = _status_from_issues(issues)
    return {
        "status": status,
        "chart_accounts": [account for account in chart_accounts if account],
        "finance_accounts": finance_accounts,
        "blocking_reasons": [issue["reason"] for issue in issues],
        "repairable": status in {STATUS_WARNING, STATUS_NOT_CONFIGURED},
    }


def _status_from_issues(issues: list[dict[str, str]]) -> str:
    statuses = {issue.get("status") for issue in issues}
    if STATUS_ERROR in statuses:
        return STATUS_ERROR
    if STATUS_NOT_CONFIGURED in statuses:
        return STATUS_NOT_CONFIGURED
    if STATUS_WARNING in statuses:
        return STATUS_WARNING
    if STATUS_INFO in statuses:
        return STATUS_INFO
    return STATUS_READY


def _operator_action_for_status(spec: BridgeEventSpec, status: str, reasons: list[str]) -> str:
    if status == STATUS_READY:
        return spec.operator_action
    if status == STATUS_ERROR:
        return "Fix invalid Chart of Accounts / FinanceAccount type or active-state errors before enabling any posting bridge."
    if status == STATUS_NOT_CONFIGURED:
        return "Complete Accounting Setup defaults and module-specific mapping before this event is considered posting-ready."
    if status == STATUS_WARNING:
        return "Review FinanceAccountCoaMapping / rent-lease mapping gaps. Do not enable posting until warnings are resolved."
    return reasons[0] if reasons else spec.operator_action


def validate_event_mapping(event_key: str) -> dict[str, Any]:
    spec = next((candidate for candidate in EVENT_REGISTRY if candidate.event_key == event_key), None)
    if spec is None:
        raise ValueError(f"Unknown accounting bridge event key: {event_key}")
    return _validate_event_spec(spec)


def _validate_event_spec(spec: BridgeEventSpec) -> dict[str, Any]:
    debit_accounts: list[dict[str, Any]] = []
    credit_accounts: list[dict[str, Any]] = []
    finance_accounts: list[dict[str, Any]] = []
    issues: list[dict[str, str]] = []

    for purpose in spec.debit_mapping_purposes:
        issues.extend(
            _validate_mapping_purpose(purpose, side="debit", chart_accounts=debit_accounts, finance_accounts=finance_accounts)
        )
    for purpose in spec.credit_mapping_purposes:
        issues.extend(
            _validate_mapping_purpose(purpose, side="credit", chart_accounts=credit_accounts, finance_accounts=finance_accounts)
        )
    for system_code in spec.debit_coa_system_codes:
        issues.extend(_validate_system_code(system_code, chart_accounts=debit_accounts))
    for system_code in spec.credit_coa_system_codes:
        issues.extend(_validate_system_code(system_code, chart_accounts=credit_accounts))
    if spec.event_key == "direct_sale_invoice" and _gst_liability_mapping_required():
        issues.extend(_validate_system_code("OUTPUT_GST", chart_accounts=credit_accounts))
    for kind in spec.required_finance_account_kinds:
        issues.extend(_validate_finance_account_kind(kind, finance_accounts=finance_accounts))

    rent_lease_payload: dict[str, Any] | None = None
    if spec.requires_rent_lease_mapping:
        rent_lease_payload = validate_rent_lease_mapping()
        debit_accounts.extend(rent_lease_payload.get("chart_accounts") or [])
        credit_accounts.extend(rent_lease_payload.get("chart_accounts") or [])
        finance_accounts.extend(rent_lease_payload.get("finance_accounts") or [])
        issues.extend(
            {"status": rent_lease_payload["status"], "reason": reason}
            for reason in rent_lease_payload.get("blocking_reasons") or []
        )

    status = _status_from_issues(issues)
    blocking_reasons = list(dict.fromkeys(issue["reason"] for issue in issues if issue.get("reason")))
    return {
        "event_key": spec.event_key,
        "label": spec.label,
        "source_module": spec.source_module,
        "source_model": spec.source_model,
        "event_group": spec.event_group,
        "status": status,
        "can_post": False,
        "posting_mode": spec.posting_mode,
        "debit_requirements": list(spec.debit_requirements),
        "credit_requirements": list(spec.credit_requirements),
        "required_finance_account_kinds": list(spec.required_finance_account_kinds),
        "required_coa_system_codes": list(spec.required_coa_system_codes),
        "required_mapping_purposes": list(spec.required_mapping_purposes),
        "debit_accounts": _dedupe_account_payloads(debit_accounts),
        "credit_accounts": _dedupe_account_payloads(credit_accounts),
        "finance_accounts": _dedupe_finance_account_payloads(finance_accounts),
        "blocking_reasons": blocking_reasons,
        "operator_action": _operator_action_for_status(spec, status, blocking_reasons),
    }


def _dedupe_account_payloads(accounts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, Any, Any]] = set()
    out: list[dict[str, Any]] = []
    for account in accounts:
        key = (account.get("id"), account.get("purpose"), account.get("requirement"))
        if key in seen:
            continue
        seen.add(key)
        out.append(account)
    return out


def _dedupe_finance_account_payloads(accounts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, Any]] = set()
    out: list[dict[str, Any]] = []
    for account in accounts:
        key = (account.get("id"), account.get("purpose"))
        if key in seen:
            continue
        seen.add(key)
        out.append(account)
    return out


def get_accounting_bridge_event_registry() -> list[dict[str, Any]]:
    return [
        {
            "event_key": spec.event_key,
            "label": spec.label,
            "source_module": spec.source_module,
            "source_model": spec.source_model,
            "event_group": spec.event_group,
            "debit_requirements": list(spec.debit_requirements),
            "credit_requirements": list(spec.credit_requirements),
            "required_finance_account_kinds": list(spec.required_finance_account_kinds),
            "required_coa_system_codes": list(spec.required_coa_system_codes),
            "required_mapping_purposes": list(spec.required_mapping_purposes),
            "posting_mode": spec.posting_mode,
        }
        for spec in EVENT_REGISTRY
        if _source_model_exists(spec)
    ]


def build_accounting_bridge_readiness() -> dict[str, Any]:
    events = [_validate_event_spec(spec) for spec in EVENT_REGISTRY if _source_model_exists(spec)]
    summary = build_accounting_bridge_readiness_summary(events=events)
    period_readiness = build_accounting_bridge_period_readiness()
    return {
        "summary": {
            **summary,
            "postable_count": sum(1 for row in events if row.get("status") == STATUS_READY and period_readiness["posting_controls_ready"]),
            "blocked_count": sum(1 for row in events if row.get("status") != STATUS_READY) + (0 if period_readiness["posting_controls_ready"] else summary["ready_count"]),
        },
        "financial_year_readiness": period_readiness,
        "accounting_period_readiness": period_readiness,
        "events": events,
    }


def build_accounting_bridge_period_readiness() -> dict[str, Any]:
    reference_date = timezone.localdate()
    readiness = build_accounting_period_readiness(reference_date)
    active_financial_year = readiness.get("active_financial_year")
    current_period = readiness.get("current_period")
    blockers = [str(error) for error in readiness.get("errors") or []]
    journal_numbering_ready = False

    if readiness.get("is_ready"):
        try:
            validate_document_numbering_ready(DocumentType.JOURNAL_ENTRY, reference_date)
            journal_numbering_ready = True
        except DocumentNumberingSetupError as exc:
            blockers.append(str(exc))

    return {
        "reference_date": reference_date.isoformat(),
        "financial_year_ready": active_financial_year is not None and not any(
            "financial year" in reason.lower() for reason in blockers
        ),
        "accounting_period_ready": bool(readiness.get("is_ready")),
        "journal_numbering_ready": journal_numbering_ready,
        "posting_controls_ready": bool(readiness.get("is_ready") and journal_numbering_ready and not blockers),
        "active_financial_year": {
            "id": active_financial_year.id,
            "code": active_financial_year.code,
            "name": active_financial_year.name,
            "start_date": active_financial_year.start_date.isoformat(),
            "end_date": active_financial_year.end_date.isoformat(),
            "is_active": active_financial_year.is_active,
        } if active_financial_year else None,
        "current_period": {
            "id": current_period.id,
            "code": current_period.code,
            "name": current_period.name or current_period.label,
            "start_date": current_period.start_date.isoformat(),
            "end_date": current_period.end_date.isoformat(),
            "status": current_period.status,
            "is_locked": current_period.is_locked,
        } if current_period else None,
        "blockers": blockers,
        "warnings": [str(warning) for warning in readiness.get("warnings") or []],
    }


def build_accounting_bridge_readiness_summary(events: list[dict[str, Any]] | None = None) -> dict[str, int]:
    rows = events if events is not None else [_validate_event_spec(spec) for spec in EVENT_REGISTRY if _source_model_exists(spec)]
    return {
        "ready_count": sum(1 for row in rows if row.get("status") == STATUS_READY),
        "info_count": sum(1 for row in rows if row.get("status") == STATUS_INFO),
        "warning_count": sum(1 for row in rows if row.get("status") == STATUS_WARNING),
        "error_count": sum(1 for row in rows if row.get("status") == STATUS_ERROR),
        "not_configured_count": sum(1 for row in rows if row.get("status") == STATUS_NOT_CONFIGURED),
    }
