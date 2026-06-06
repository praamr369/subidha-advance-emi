from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.apps import apps
from django.db import transaction
from django.utils import timezone

from accounting.models import (
    AccountingPostingProfile,
    ChartOfAccount,
    ChartOfAccountType,
    DocumentSequence,
    FinanceAccount,
    FinanceAccountCoaMapping,
    FinanceAccountKind,
    FinanceAccountMappingPurpose,
    JournalEntry,
    RentLeaseAccountingAccountMapping,
)
from accounting.services.accounting_bridge_readiness_service import build_accounting_bridge_period_readiness
from accounting.services.accounting_setup_catalog import CANONICAL_CHART_ACCOUNT_BY_KEY
from accounting.services.returns_damage_credit_bridge_readiness_service import build_accounting_bridge_readiness_with_returns_damage_credit
from accounting.services.setup_defaults_service import apply_accounting_setup_defaults
from subscriptions.services.rent_lease_finance_sync_service import ensure_premade_rent_lease_accounting_setup

STATUS_READY = "READY"
STATUS_MISSING = "MISSING_MAPPING"
STATUS_CONFLICT = "CONFLICT"
STATUS_UNSUPPORTED = "UNSUPPORTED"
STATUS_INACTIVE = "INACTIVE_MAPPING"
STATUS_BLOCKED_PERIOD = "BLOCKED_BY_PERIOD"
STATUS_BLOCKED_NUMBERING = "BLOCKED_BY_NUMBERING"
POSTING_MODE_AUDIT_DEFERRED = "AUDIT_DEFERRED"

SETUP_HREF = "/admin/accounting/setup"
COA_HREF = "/admin/accounting/chart-of-accounts"
FA_HREF = "/admin/accounting/finance-accounts"
PERIODS_HREF = "/admin/accounting/periods"
NUMBERING_HREF = "/admin/settings/business-setup/document-numbering"
RENT_LEASE_HREF = "/admin/rent-lease"

COLLECTION_PURPOSES = {
    FinanceAccountMappingPurpose.CASH_COLLECTION,
    FinanceAccountMappingPurpose.BANK_COLLECTION,
    FinanceAccountMappingPurpose.UPI_COLLECTION,
    FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION,
}

PURPOSE_TO_SYSTEM_CODE = {
    FinanceAccountMappingPurpose.CASH_COLLECTION: "CASH_COLLECTION",
    FinanceAccountMappingPurpose.BANK_COLLECTION: "BANK_COLLECTION",
    FinanceAccountMappingPurpose.UPI_COLLECTION: "UPI_COLLECTION",
    FinanceAccountMappingPurpose.PAYMENT_GATEWAY_COLLECTION: "PAYMENT_GATEWAY_COLLECTION",
    FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE: "CUSTOMER_RECEIVABLE",
    FinanceAccountMappingPurpose.SECURITY_DEPOSIT_LIABILITY: "SECURITY_DEPOSIT_LIABILITY",
    FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE: "CUSTOMER_ADVANCE_UNEARNED_REVENUE",
    FinanceAccountMappingPurpose.EMI_INCOME: "EMI_INCOME",
    FinanceAccountMappingPurpose.RENT_INCOME: "RENT_INCOME",
    FinanceAccountMappingPurpose.LEASE_INCOME: "LEASE_INCOME",
    FinanceAccountMappingPurpose.DIRECT_SALE_INCOME: "SALES_REVENUE",
    FinanceAccountMappingPurpose.DELIVERY_CHARGES_INCOME: "DELIVERY_CHARGES_INCOME",
    FinanceAccountMappingPurpose.WAIVER_LOSS: "EMI_WAIVER_EXPENSE",
    FinanceAccountMappingPurpose.COMMISSION_PAYABLE: "PARTNER_COMMISSION_PAYABLE",
    FinanceAccountMappingPurpose.COMMISSION_EXPENSE: "PARTNER_COMMISSION_EXPENSE",
    FinanceAccountMappingPurpose.DAMAGE_RECOVERY: "DAMAGE_RECOVERY",
    FinanceAccountMappingPurpose.DELIVERY_EXPENSE: "DELIVERY_EXPENSE",
    FinanceAccountMappingPurpose.SALARY_EXPENSE: "SALARY_EXPENSE",
    FinanceAccountMappingPurpose.INVENTORY_ASSET: "INVENTORY_ASSET",
}

SUPPLEMENTAL_ACCOUNTS: dict[str, dict[str, str]] = {
    "COGS": {"code": "COGS-5100", "name": "Cost of Goods Sold", "account_type": ChartOfAccountType.EXPENSE},
    "MANUFACTURING_WASTAGE": {"code": "MFG-5200", "name": "Manufacturing Wastage / Scrap Expense", "account_type": ChartOfAccountType.EXPENSE},
    "PAYOUT_PAYABLE": {"code": "PAYOUT-2100", "name": "Payout Payable", "account_type": ChartOfAccountType.LIABILITY},
    "REFUND_PAYABLE": {"code": "REF-2100", "name": "Refund Payable", "account_type": ChartOfAccountType.LIABILITY},
    "SCRAP_SALE_INCOME": {"code": "SCRAP-4000", "name": "Scrap Sale Income", "account_type": ChartOfAccountType.INCOME},
    "RETURN_DAMAGE_EXPENSE": {"code": "RTN-5200", "name": "Return Damage Expense", "account_type": ChartOfAccountType.EXPENSE},
    "CUSTOMER_ADVANCE_ASSET": {"code": "ADV-1100", "name": "Customer Advance Asset", "account_type": ChartOfAccountType.ASSET},
    "STAFF_ADVANCE_RECEIVABLE": {"code": "STAFF-1100", "name": "Staff Advance Receivable", "account_type": ChartOfAccountType.ASSET},
}

DEFAULT_ACCOUNT_ALIASES = {
    "ACCOUNTS_RECEIVABLE": "CUSTOMER_RECEIVABLE",
    "CUSTOMER_ADVANCE_LIABILITY": "CUSTOMER_ADVANCE_UNEARNED_REVENUE",
    "GST_OUTPUT": "OUTPUT_GST",
    "TAX_PAYABLE": "OUTPUT_GST",
    "SALES_INCOME": "SALES_REVENUE",
    "DAMAGE_RECOVERY_INCOME": "DAMAGE_RECOVERY",
    "COGS_EXPENSE": "COGS",
    "WAIVER_LOSS_EXPENSE": "EMI_WAIVER_EXPENSE",
    "COMMISSION_EXPENSE": "PARTNER_COMMISSION_EXPENSE",
    "COMMISSION_PAYABLE": "PARTNER_COMMISSION_PAYABLE",
    "MANUFACTURING_WASTAGE_EXPENSE": "MANUFACTURING_WASTAGE",
    "STOCK_ADJUSTMENT_LOSS": "INVENTORY_ADJUSTMENT",
}


@dataclass(frozen=True)
class AuditEventSpec:
    event_key: str
    event_label: str
    module: str
    source_app: str
    source_model: str
    debit_purpose: str | None
    credit_purpose: str | None
    debit_account_code: str | None
    credit_account_code: str | None
    debit_account_type: str | None
    credit_account_type: str | None
    requires_finance_account: bool = False
    rent_lease_mapping: bool = False
    supported_if_source_missing: bool = False
    posting_mode: str = POSTING_MODE_AUDIT_DEFERRED
    setup_href: str = SETUP_HREF


FULL_MAPPING_EVENT_REGISTRY: tuple[AuditEventSpec, ...] = (
    AuditEventSpec("direct_sale_invoice", "Direct sale invoice", "Sales / Billing", "billing", "BillingInvoice", FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, FinanceAccountMappingPurpose.DIRECT_SALE_INCOME, "CUSTOMER_RECEIVABLE", "SALES_REVENUE", ChartOfAccountType.ASSET, ChartOfAccountType.INCOME),
    AuditEventSpec("direct_sale_receipt", "Direct sale receipt", "Sales / Billing", "billing", "ReceiptDocument", FinanceAccountMappingPurpose.CASH_COLLECTION, FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, "CASH_COLLECTION", "CUSTOMER_RECEIVABLE", ChartOfAccountType.ASSET, ChartOfAccountType.ASSET, requires_finance_account=True),
    AuditEventSpec("tax_invoice", "Tax invoice", "Sales / Billing", "billing", "TaxInvoice", FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, "OUTPUT_GST", "CUSTOMER_RECEIVABLE", "OUTPUT_GST", ChartOfAccountType.ASSET, ChartOfAccountType.LIABILITY),
    AuditEventSpec("credit_note", "Credit note", "Sales / Billing", "billing", "BillingCreditNote", "SALES_RETURNS", FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, "SALES_RETURNS", "CUSTOMER_RECEIVABLE", ChartOfAccountType.EXPENSE, ChartOfAccountType.ASSET),
    AuditEventSpec("debit_note", "Debit note", "Sales / Billing", "billing", "BillingDebitNote", FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, FinanceAccountMappingPurpose.DIRECT_SALE_INCOME, "CUSTOMER_RECEIVABLE", "SALES_REVENUE", ChartOfAccountType.ASSET, ChartOfAccountType.INCOME),
    AuditEventSpec("advance_emi_collection", "Advance EMI collection", "Subscription EMI", "subscriptions", "Payment", FinanceAccountMappingPurpose.CASH_COLLECTION, FinanceAccountMappingPurpose.EMI_INCOME, "CASH_COLLECTION", "EMI_INCOME", ChartOfAccountType.ASSET, ChartOfAccountType.INCOME, requires_finance_account=True),
    AuditEventSpec("subscription_emi_payment", "Subscription EMI payment", "Subscription EMI", "subscriptions", "Payment", FinanceAccountMappingPurpose.CASH_COLLECTION, FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, "CASH_COLLECTION", "CUSTOMER_RECEIVABLE", ChartOfAccountType.ASSET, ChartOfAccountType.ASSET, requires_finance_account=True),
    AuditEventSpec("subscription_emi_waiver_loss", "Subscription EMI waiver loss", "Subscription EMI", "subscriptions", "AuditLog", FinanceAccountMappingPurpose.WAIVER_LOSS, "EMI_WAIVER_RESERVE", "EMI_WAIVER_EXPENSE", "EMI_WAIVER_RESERVE", ChartOfAccountType.EXPENSE, ChartOfAccountType.LIABILITY),
    AuditEventSpec("customer_advance", "Customer advance", "Subscription EMI", "billing", "ReceiptDocument", FinanceAccountMappingPurpose.CASH_COLLECTION, FinanceAccountMappingPurpose.CUSTOMER_ADVANCE_UNEARNED_REVENUE, "CASH_COLLECTION", "CUSTOMER_ADVANCE_UNEARNED_REVENUE", ChartOfAccountType.ASSET, ChartOfAccountType.LIABILITY, requires_finance_account=True),
    AuditEventSpec("cancellation_deduction", "Cancellation deduction", "Subscription EMI", "subscriptions", "OperationalCancellation", FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, "CANCELLATION_DEDUCTION_INCOME", "CUSTOMER_RECEIVABLE", "CANCELLATION_DEDUCTION_INCOME", ChartOfAccountType.ASSET, ChartOfAccountType.INCOME),
    AuditEventSpec("rent_monthly_collection", "Rent monthly collection", "Rent / Lease", "subscriptions", "Subscription", "RENT_LEASE_SETTLEMENT", "RENT_INCOME", "CASH_COLLECTION", "RENT_INCOME", ChartOfAccountType.ASSET, ChartOfAccountType.INCOME, requires_finance_account=True, rent_lease_mapping=True, setup_href=RENT_LEASE_HREF),
    AuditEventSpec("lease_monthly_collection", "Lease monthly collection", "Rent / Lease", "subscriptions", "Subscription", "RENT_LEASE_SETTLEMENT", "LEASE_INCOME", "CASH_COLLECTION", "LEASE_INCOME", ChartOfAccountType.ASSET, ChartOfAccountType.INCOME, requires_finance_account=True, rent_lease_mapping=True, setup_href=RENT_LEASE_HREF),
    AuditEventSpec("rent_security_deposit", "Rent security deposit", "Rent / Lease", "subscriptions", "Subscription", "RENT_LEASE_SETTLEMENT", "SECURITY_DEPOSIT_LIABILITY", "CASH_COLLECTION", "SECURITY_DEPOSIT_LIABILITY", ChartOfAccountType.ASSET, ChartOfAccountType.LIABILITY, requires_finance_account=True, rent_lease_mapping=True, setup_href=RENT_LEASE_HREF),
    AuditEventSpec("lease_security_deposit", "Lease security deposit", "Rent / Lease", "subscriptions", "Subscription", "RENT_LEASE_SETTLEMENT", "SECURITY_DEPOSIT_LIABILITY", "CASH_COLLECTION", "SECURITY_DEPOSIT_LIABILITY", ChartOfAccountType.ASSET, ChartOfAccountType.LIABILITY, requires_finance_account=True, rent_lease_mapping=True, setup_href=RENT_LEASE_HREF),
    AuditEventSpec("security_deposit_refund", "Security deposit refund", "Rent / Lease", "subscriptions", "Subscription", "SECURITY_DEPOSIT_LIABILITY", "CASH_COLLECTION", "SECURITY_DEPOSIT_LIABILITY", "CASH_COLLECTION", ChartOfAccountType.LIABILITY, ChartOfAccountType.ASSET, requires_finance_account=True, rent_lease_mapping=True, setup_href=RENT_LEASE_HREF),
    AuditEventSpec("damage_recovery", "Damage recovery", "Rent / Lease", "subscriptions", "Subscription", "RENT_LEASE_SETTLEMENT", FinanceAccountMappingPurpose.DAMAGE_RECOVERY, "CASH_COLLECTION", "DAMAGE_RECOVERY", ChartOfAccountType.ASSET, ChartOfAccountType.INCOME, requires_finance_account=True, rent_lease_mapping=True, setup_href=RENT_LEASE_HREF),
    AuditEventSpec("rent_lease_adjustment", "Rent / lease adjustment", "Rent / Lease", "subscriptions", "RentLeaseAdjustment", FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, FinanceAccountMappingPurpose.RENT_INCOME, "CUSTOMER_RECEIVABLE", "RENT_INCOME", ChartOfAccountType.ASSET, ChartOfAccountType.INCOME, setup_href=RENT_LEASE_HREF),
    AuditEventSpec("commission_accrual", "Commission accrual", "Commission / Payout", "subscriptions", "Commission", FinanceAccountMappingPurpose.COMMISSION_EXPENSE, FinanceAccountMappingPurpose.COMMISSION_PAYABLE, "PARTNER_COMMISSION_EXPENSE", "PARTNER_COMMISSION_PAYABLE", ChartOfAccountType.EXPENSE, ChartOfAccountType.LIABILITY),
    AuditEventSpec("commission_approval", "Commission approval", "Commission / Payout", "subscriptions", "Commission", FinanceAccountMappingPurpose.COMMISSION_EXPENSE, FinanceAccountMappingPurpose.COMMISSION_PAYABLE, "PARTNER_COMMISSION_EXPENSE", "PARTNER_COMMISSION_PAYABLE", ChartOfAccountType.EXPENSE, ChartOfAccountType.LIABILITY),
    AuditEventSpec("commission_payout", "Commission payout", "Commission / Payout", "subscriptions", "CommissionPayoutBatch", FinanceAccountMappingPurpose.COMMISSION_PAYABLE, FinanceAccountMappingPurpose.CASH_COLLECTION, "PARTNER_COMMISSION_PAYABLE", "CASH_COLLECTION", ChartOfAccountType.LIABILITY, ChartOfAccountType.ASSET, requires_finance_account=True),
    AuditEventSpec("payout_batch_payment", "Payout batch payment", "Commission / Payout", "subscriptions", "CommissionPayoutBatch", "PAYOUT_PAYABLE", FinanceAccountMappingPurpose.CASH_COLLECTION, "PAYOUT_PAYABLE", "CASH_COLLECTION", ChartOfAccountType.LIABILITY, ChartOfAccountType.ASSET, requires_finance_account=True),
    AuditEventSpec("purchase_inventory_receive", "Purchase inventory receive", "Inventory", "inventory", "StockLedger", FinanceAccountMappingPurpose.INVENTORY_ASSET, "ACCOUNTS_PAYABLE", "INVENTORY_ASSET", "ACCOUNTS_PAYABLE", ChartOfAccountType.ASSET, ChartOfAccountType.LIABILITY),
    AuditEventSpec("inventory_delivery_out", "Inventory delivery out", "Inventory", "inventory", "StockLedger", "COGS", FinanceAccountMappingPurpose.INVENTORY_ASSET, "COGS", "INVENTORY_ASSET", ChartOfAccountType.EXPENSE, ChartOfAccountType.ASSET),
    AuditEventSpec("stock_adjustment_gain", "Stock adjustment gain", "Inventory", "inventory", "StockLedger", FinanceAccountMappingPurpose.INVENTORY_ASSET, "INVENTORY_ADJUSTMENT", "INVENTORY_ASSET", "INVENTORY_ADJUSTMENT", ChartOfAccountType.ASSET, ChartOfAccountType.EXPENSE),
    AuditEventSpec("stock_adjustment_loss", "Stock adjustment loss", "Inventory", "inventory", "StockLedger", "INVENTORY_ADJUSTMENT", FinanceAccountMappingPurpose.INVENTORY_ASSET, "INVENTORY_ADJUSTMENT", "INVENTORY_ASSET", ChartOfAccountType.EXPENSE, ChartOfAccountType.ASSET),
    AuditEventSpec("customer_return_receive", "Customer return receive", "Inventory", "service_desk", "ServiceDeskCase", FinanceAccountMappingPurpose.INVENTORY_ASSET, "SALES_RETURNS", "INVENTORY_ASSET", "SALES_RETURNS", ChartOfAccountType.ASSET, ChartOfAccountType.EXPENSE),
    AuditEventSpec("vendor_return_out", "Vendor return out", "Inventory", "inventory", "StockLedger", "ACCOUNTS_PAYABLE", FinanceAccountMappingPurpose.INVENTORY_ASSET, "ACCOUNTS_PAYABLE", "INVENTORY_ASSET", ChartOfAccountType.LIABILITY, ChartOfAccountType.ASSET),
    AuditEventSpec("production_material_consume", "Production material consume", "Manufacturing", "manufacturing", "ProductionJob", "WORK_IN_PROGRESS_INVENTORY", FinanceAccountMappingPurpose.INVENTORY_ASSET, "WORK_IN_PROGRESS_INVENTORY", "INVENTORY_ASSET", ChartOfAccountType.ASSET, ChartOfAccountType.ASSET),
    AuditEventSpec("production_output_receive", "Production output receive", "Manufacturing", "manufacturing", "ProductionJob", FinanceAccountMappingPurpose.INVENTORY_ASSET, "WORK_IN_PROGRESS_INVENTORY", "INVENTORY_ASSET", "WORK_IN_PROGRESS_INVENTORY", ChartOfAccountType.ASSET, ChartOfAccountType.ASSET),
    AuditEventSpec("manufacturing_wastage", "Manufacturing wastage", "Manufacturing", "manufacturing", "ProductionJob", "MANUFACTURING_WASTAGE", FinanceAccountMappingPurpose.INVENTORY_ASSET, "MANUFACTURING_WASTAGE", "INVENTORY_ASSET", ChartOfAccountType.EXPENSE, ChartOfAccountType.ASSET),
    AuditEventSpec("manufacturing_scrap_recovery", "Manufacturing scrap recovery", "Manufacturing", "manufacturing", "ProductionJob", FinanceAccountMappingPurpose.CASH_COLLECTION, "SCRAP_SALE_INCOME", "CASH_COLLECTION", "SCRAP_SALE_INCOME", ChartOfAccountType.ASSET, ChartOfAccountType.INCOME, requires_finance_account=True),
    AuditEventSpec("cashier_collection", "Cashier collection", "Payments / Settlement", "settlements", "SettlementAllocation", FinanceAccountMappingPurpose.CASH_COLLECTION, FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, "CASH_COLLECTION", "CUSTOMER_RECEIVABLE", ChartOfAccountType.ASSET, ChartOfAccountType.ASSET, requires_finance_account=True),
    AuditEventSpec("bank_deposit", "Bank deposit", "Payments / Settlement", "accounting", "MoneyMovement", FinanceAccountMappingPurpose.BANK_COLLECTION, FinanceAccountMappingPurpose.CASH_COLLECTION, "BANK_COLLECTION", "CASH_COLLECTION", ChartOfAccountType.ASSET, ChartOfAccountType.ASSET, requires_finance_account=True),
    AuditEventSpec("settlement_allocation", "Settlement allocation", "Payments / Settlement", "settlements", "SettlementAllocation", FinanceAccountMappingPurpose.CASH_COLLECTION, FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, "CASH_COLLECTION", "CUSTOMER_RECEIVABLE", ChartOfAccountType.ASSET, ChartOfAccountType.ASSET, requires_finance_account=True),
    AuditEventSpec("payment_reversal", "Payment reversal", "Payments / Settlement", "subscriptions", "Payment", FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, FinanceAccountMappingPurpose.CASH_COLLECTION, "CUSTOMER_RECEIVABLE", "CASH_COLLECTION", ChartOfAccountType.ASSET, ChartOfAccountType.ASSET, requires_finance_account=True),
    AuditEventSpec("receipt_void", "Receipt void", "Payments / Settlement", "billing", "ReceiptDocument", FinanceAccountMappingPurpose.CUSTOMER_RECEIVABLE, FinanceAccountMappingPurpose.CASH_COLLECTION, "CUSTOMER_RECEIVABLE", "CASH_COLLECTION", ChartOfAccountType.ASSET, ChartOfAccountType.ASSET, requires_finance_account=True),
    AuditEventSpec("staff_advance", "Staff advance", "Unsupported / Future", "accounting", "StaffAdvance", "STAFF_ADVANCE_RECEIVABLE", FinanceAccountMappingPurpose.CASH_COLLECTION, "STAFF_ADVANCE_RECEIVABLE", "CASH_COLLECTION", ChartOfAccountType.ASSET, ChartOfAccountType.ASSET, requires_finance_account=True, setup_href=SETUP_HREF),
)


def _source_model_exists(spec: AuditEventSpec) -> bool:
    try:
        apps.get_model(spec.source_app, spec.source_model, require_ready=False)
    except LookupError:
        return False
    return True


def _canonical_system_code(value: str | None) -> str | None:
    if not value:
        return None
    normalized = str(value).strip().upper()
    if normalized in FinanceAccountMappingPurpose.values:
        normalized = PURPOSE_TO_SYSTEM_CODE.get(normalized, normalized)
    return DEFAULT_ACCOUNT_ALIASES.get(normalized, normalized)


def _expected_account_type(system_code: str | None, fallback: str | None) -> str | None:
    code = _canonical_system_code(system_code)
    if code in SUPPLEMENTAL_ACCOUNTS:
        return SUPPLEMENTAL_ACCOUNTS[code]["account_type"]
    spec = CANONICAL_CHART_ACCOUNT_BY_KEY.get(code or "")
    return spec.account_type if spec else fallback


def _account_by_system_code(system_code: str | None) -> ChartOfAccount | None:
    code = _canonical_system_code(system_code)
    if not code:
        return None
    return ChartOfAccount.objects.filter(system_code=code).order_by("id").first()


def _mapping_qs(purpose: str):
    return FinanceAccountCoaMapping.objects.select_related("finance_account", "chart_account").filter(purpose=purpose).order_by("-is_active", "-is_default", "id")


def _status_for_purpose(purpose: str | None, expected_type: str | None) -> dict[str, Any]:
    if not purpose:
        return {"status": STATUS_READY, "blocker_code": None, "blocker_reason": "No mapping required."}
    normalized = str(purpose).strip().upper()
    if normalized not in FinanceAccountMappingPurpose.values:
        return _status_for_system_code(normalized, expected_type)
    mappings = list(_mapping_qs(normalized))
    active = [row for row in mappings if row.is_active]
    inactive = [row for row in mappings if not row.is_active]
    duplicate_conflict = normalized not in COLLECTION_PURPOSES and len(active) > 1
    if duplicate_conflict:
        return {"status": STATUS_CONFLICT, "blocker_code": "DUPLICATE_ACTIVE_MAPPING", "blocker_reason": f"Multiple active mappings exist for {normalized}.", "mapping_ids": [row.id for row in active]}
    if not active:
        if inactive:
            return {"status": STATUS_INACTIVE, "blocker_code": "INACTIVE_MAPPING", "blocker_reason": f"Inactive mapping exists for {normalized}; explicit reactivation is required.", "mapping_ids": [row.id for row in inactive]}
        return {"status": STATUS_MISSING, "blocker_code": "MISSING_MAPPING", "blocker_reason": f"Missing active FinanceAccountCoaMapping for {normalized}."}
    mapping = active[0]
    if not mapping.chart_account.is_active:
        return {"status": STATUS_INACTIVE, "blocker_code": "INACTIVE_ACCOUNT", "blocker_reason": f"Mapped chart account {mapping.chart_account.code} is inactive.", "mapping_ids": [mapping.id]}
    if expected_type and mapping.chart_account.account_type != expected_type:
        return {"status": STATUS_CONFLICT, "blocker_code": "WRONG_ACCOUNT_TYPE", "blocker_reason": f"{normalized} maps to {mapping.chart_account.account_type}; expected {expected_type}.", "mapping_ids": [mapping.id]}
    if not mapping.finance_account.is_active:
        return {"status": STATUS_INACTIVE, "blocker_code": "INACTIVE_FINANCE_ACCOUNT", "blocker_reason": f"Finance account {mapping.finance_account.name} is inactive.", "mapping_ids": [mapping.id]}
    return {"status": STATUS_READY, "blocker_code": None, "blocker_reason": "Ready.", "mapping_ids": [mapping.id], "account": _account_payload(mapping.chart_account), "finance_account": _finance_payload(mapping.finance_account)}


def _status_for_system_code(system_code: str | None, expected_type: str | None) -> dict[str, Any]:
    account = _account_by_system_code(system_code)
    canonical = _canonical_system_code(system_code)
    if account is None:
        return {"status": STATUS_MISSING, "blocker_code": "MISSING_ACCOUNT", "blocker_reason": f"Missing chart account {canonical}."}
    if not account.is_active:
        return {"status": STATUS_INACTIVE, "blocker_code": "INACTIVE_ACCOUNT", "blocker_reason": f"Chart account {account.code} is inactive.", "account": _account_payload(account)}
    expected = _expected_account_type(system_code, expected_type)
    if expected and account.account_type != expected:
        return {"status": STATUS_CONFLICT, "blocker_code": "WRONG_ACCOUNT_TYPE", "blocker_reason": f"Chart account {account.code} is {account.account_type}; expected {expected}.", "account": _account_payload(account)}
    return {"status": STATUS_READY, "blocker_code": None, "blocker_reason": "Ready.", "account": _account_payload(account)}


def _finance_status(spec: AuditEventSpec) -> dict[str, Any]:
    if not spec.requires_finance_account:
        return {"status": STATUS_READY, "blocker_reason": "No finance account required."}
    accounts = list(FinanceAccount.objects.select_related("chart_account").filter(is_active=True, is_real_settlement_account=True).order_by("kind", "id"))
    if not accounts:
        return {"status": STATUS_MISSING, "blocker_code": "MISSING_FINANCE_ACCOUNT", "blocker_reason": "No active real settlement finance account is configured."}
    bad = [row for row in accounts if not row.chart_account_id or not row.chart_account.is_active or row.chart_account.account_type != ChartOfAccountType.ASSET]
    if bad:
        return {"status": STATUS_CONFLICT, "blocker_code": "INVALID_FINANCE_ACCOUNT", "blocker_reason": "One or more finance accounts do not map to an active ASSET chart account.", "finance_accounts": [_finance_payload(row) for row in bad]}
    return {"status": STATUS_READY, "blocker_reason": "Finance accounts ready.", "finance_accounts": [_finance_payload(row) for row in accounts]}


def _rent_lease_status() -> dict[str, Any]:
    mapping = RentLeaseAccountingAccountMapping.objects.select_related(
        "monthly_income_account", "deposit_liability_account", "deposit_refund_account", "damage_recovery_income_account", "settlement_finance_account", "settlement_finance_account__chart_account"
    ).filter(is_active=True).order_by("-created_at", "-id").first()
    if mapping is None:
        return {"status": STATUS_MISSING, "blocker_code": "MISSING_RENT_LEASE_MAPPING", "blocker_reason": "Active rent/lease accounting account mapping is missing."}
    checks = [
        (mapping.monthly_income_account, ChartOfAccountType.INCOME, "monthly income"),
        (mapping.deposit_liability_account, ChartOfAccountType.LIABILITY, "deposit liability"),
        (mapping.deposit_refund_account, ChartOfAccountType.ASSET, "deposit refund"),
        (mapping.damage_recovery_income_account, ChartOfAccountType.INCOME, "damage recovery"),
    ]
    for account, expected, label in checks:
        if not account or not account.is_active:
            return {"status": STATUS_INACTIVE, "blocker_code": "INACTIVE_RENT_LEASE_ACCOUNT", "blocker_reason": f"Rent/lease {label} account is missing or inactive."}
        if account.account_type != expected:
            return {"status": STATUS_CONFLICT, "blocker_code": "WRONG_RENT_LEASE_ACCOUNT_TYPE", "blocker_reason": f"Rent/lease {label} must be {expected}."}
    settlement = mapping.settlement_finance_account
    if not settlement or not settlement.is_active or not settlement.is_real_settlement_account or settlement.chart_account.account_type != ChartOfAccountType.ASSET:
        return {"status": STATUS_CONFLICT, "blocker_code": "INVALID_RENT_LEASE_SETTLEMENT", "blocker_reason": "Rent/lease settlement finance account must be an active real settlement account mapped to ASSET."}
    return {"status": STATUS_READY, "blocker_reason": "Rent/lease mapping ready.", "mapping_id": mapping.id}


def _account_payload(account: ChartOfAccount | None) -> dict[str, Any] | None:
    if account is None:
        return None
    return {"id": account.id, "code": account.code, "name": account.name, "account_type": account.account_type, "system_code": account.system_code, "is_active": account.is_active}


def _finance_payload(account: FinanceAccount | None) -> dict[str, Any] | None:
    if account is None:
        return None
    return {"id": account.id, "name": account.name, "kind": account.kind, "is_active": account.is_active, "is_real_settlement_account": account.is_real_settlement_account, "chart_account": _account_payload(account.chart_account)}


def _combine_status(parts: list[dict[str, Any]], *, supported: bool, period_ready: bool, numbering_ready: bool) -> tuple[str, str | None, str]:
    if not supported:
        return STATUS_UNSUPPORTED, "UNSUPPORTED_SOURCE", "Source workflow is not configured. Do not create fake posting readiness."
    for status in (STATUS_CONFLICT, STATUS_INACTIVE, STATUS_MISSING):
        for part in parts:
            if part.get("status") == status:
                return status, part.get("blocker_code"), part.get("blocker_reason") or status
    if not period_ready:
        return STATUS_BLOCKED_PERIOD, "PERIOD_NOT_READY", "Financial year/accounting period readiness blocks posting."
    if not numbering_ready:
        return STATUS_BLOCKED_NUMBERING, "JOURNAL_NUMBERING_NOT_READY", "JOURNAL_ENTRY document numbering is not ready."
    return STATUS_READY, None, "Mapping, period, and numbering readiness are valid."


def _bridge_status_by_key() -> dict[str, str]:
    payload = build_accounting_bridge_readiness_with_returns_damage_credit()
    out = {str(row.get("event_key") or ""): str(row.get("status") or "") for row in payload.get("events") or []}
    aliases = {
        "rent_monthly_collection": "rent_lease_monthly_collection",
        "lease_monthly_collection": "rent_lease_monthly_collection",
        "rent_security_deposit": "security_deposit_collection",
        "lease_security_deposit": "security_deposit_collection",
        "purchase_inventory_receive": "inventory_purchase_receive",
        "commission_approval": "commission_accrual",
        "payout_batch_payment": "commission_payout",
        "production_material_consume": "manufacturing_consumption",
        "production_output_receive": "manufacturing_output",
    }
    for alias, source in aliases.items():
        if source in out and alias not in out:
            out[alias] = out[source]
    return out


def _event_row(spec: AuditEventSpec, period_payload: dict[str, Any], bridge_statuses: dict[str, str]) -> dict[str, Any]:
    supported = spec.event_key != "staff_advance" and (_source_model_exists(spec) or spec.supported_if_source_missing)
    debit_status = _status_for_purpose(spec.debit_purpose, spec.debit_account_type)
    credit_status = _status_for_purpose(spec.credit_purpose, spec.credit_account_type)
    finance_status = _finance_status(spec)
    extra_parts = [debit_status, credit_status, finance_status]
    if spec.rent_lease_mapping:
        extra_parts.append(_rent_lease_status())
    status, blocker_code, blocker_reason = _combine_status(
        extra_parts,
        supported=supported,
        period_ready=bool(period_payload.get("accounting_period_ready")),
        numbering_ready=bool(period_payload.get("journal_numbering_ready")),
    )
    can_seed = supported and status in {STATUS_MISSING, STATUS_INACTIVE, STATUS_BLOCKED_NUMBERING, STATUS_BLOCKED_PERIOD}
    can_apply = supported and status in {STATUS_MISSING, STATUS_INACTIVE}
    return {
        "event_key": spec.event_key,
        "event_label": spec.event_label,
        "label": spec.event_label,
        "module": spec.module,
        "source_model": spec.source_model,
        "supported": supported,
        "posting_enabled": False,
        "posting_mode": spec.posting_mode,
        "debit_purpose": spec.debit_purpose,
        "credit_purpose": spec.credit_purpose,
        "debit_account_code": _canonical_system_code(spec.debit_account_code),
        "credit_account_code": _canonical_system_code(spec.credit_account_code),
        "debit_account_type": spec.debit_account_type,
        "credit_account_type": spec.credit_account_type,
        "debit_mapping_status": debit_status.get("status"),
        "credit_mapping_status": credit_status.get("status"),
        "finance_account_status": finance_status.get("status"),
        "period_readiness": STATUS_READY if period_payload.get("accounting_period_ready") else STATUS_BLOCKED_PERIOD,
        "numbering_readiness": STATUS_READY if period_payload.get("journal_numbering_ready") else STATUS_BLOCKED_NUMBERING,
        "status": status,
        "bridge_status": bridge_statuses.get(spec.event_key),
        "can_seed": can_seed,
        "can_apply_mapping": can_apply,
        "can_post": False,
        "blocker_code": blocker_code,
        "blocker_reason": blocker_reason,
        "recommended_action": _recommended_action(status, spec, blocker_code),
        "setup_href": spec.setup_href,
        "details": {"debit": debit_status, "credit": credit_status, "finance": finance_status},
    }


def _recommended_action(status: str, spec: AuditEventSpec, blocker_code: str | None) -> str:
    if spec.event_key == "staff_advance":
        return "StaffAdvance has no real source workflow. Keep it unsupported and non-postable."
    if status == STATUS_READY:
        return "Ready for controlled bridge preview/execution flow. This audit does not post."
    if status == STATUS_BLOCKED_PERIOD:
        return "Open Accounting Periods and configure active FY/current open period."
    if status == STATUS_BLOCKED_NUMBERING:
        return "Open Document Numbering and configure JOURNAL_ENTRY numbering."
    if blocker_code == "DUPLICATE_ACTIVE_MAPPING":
        return "Resolve duplicate active mappings manually before using auto-fix."
    if blocker_code == "WRONG_ACCOUNT_TYPE":
        return "Correct the chart account type manually; auto-fix will not overwrite wrong-type accounts."
    if status == STATUS_INACTIVE:
        return "Reactivate the inactive mapping/account only after admin review."
    return "Seed safe defaults or apply mapping from the Accounting Mapping Cockpit."


def build_accounting_mapping_audit(*, mutate: bool = False) -> dict[str, Any]:
    period_payload = build_accounting_bridge_period_readiness()
    bridge_statuses = _bridge_status_by_key()
    events = [_event_row(spec, period_payload, bridge_statuses) for spec in FULL_MAPPING_EVENT_REGISTRY]
    conflicts = [row for row in events if row["status"] == STATUS_CONFLICT]
    unsupported = [row for row in events if not row["supported"]]
    missing = [row for row in events if row["status"] in {STATUS_MISSING, STATUS_INACTIVE}]
    blocked_period = [row for row in events if row["status"] == STATUS_BLOCKED_PERIOD]
    blocked_numbering = [row for row in events if row["status"] == STATUS_BLOCKED_NUMBERING]
    ready = [row for row in events if row["status"] == STATUS_READY]
    return {
        "generated_at": timezone.now().isoformat(),
        "read_only": not mutate,
        "journal_entries_created": 0,
        "document_sequences_allocated": 0,
        "period_readiness": period_payload,
        "year_end_impact": "BLOCKED" if conflicts or missing or blocked_period or blocked_numbering else "READY",
        "bridge_impact": "BLOCKED" if conflicts or missing or unsupported else "READY",
        "summary": {
            "total_events": len(events),
            "ready": len(ready),
            "missing_mapping": len(missing),
            "conflicts": len(conflicts),
            "unsupported": len(unsupported),
            "blocked_by_period": len(blocked_period),
            "blocked_by_numbering": len(blocked_numbering),
        },
        "events": events,
        "ready_mappings": ready,
        "missing_mappings": missing,
        "conflicts": conflicts,
        "unsupported_events": unsupported,
        "setup_blockers": [row for row in events if row["status"] != STATUS_READY],
        "actions": {
            "seed_safe_defaults": "/api/v1/admin/accounting/mapping-audit/seed-safe-defaults/",
            "fix_event": "/api/v1/admin/accounting/mapping-audit/fix-event/",
            "validate": "/api/v1/admin/accounting/mapping-audit/validate/",
        },
    }


def _default_account_spec(system_code: str | None, fallback_type: str | None = None) -> dict[str, str] | None:
    canonical = _canonical_system_code(system_code)
    if not canonical:
        return None
    if canonical in SUPPLEMENTAL_ACCOUNTS:
        return {"system_code": canonical, **SUPPLEMENTAL_ACCOUNTS[canonical]}
    spec = CANONICAL_CHART_ACCOUNT_BY_KEY.get(canonical)
    if spec:
        return {"system_code": spec.key, "code": spec.code, "name": spec.name, "account_type": spec.account_type}
    if fallback_type:
        return {"system_code": canonical, "code": canonical[:30], "name": canonical.replace("_", " ").title(), "account_type": fallback_type}
    return None


def _ensure_chart_account(system_code: str | None, fallback_type: str | None, *, actor=None) -> ChartOfAccount | None:
    spec = _default_account_spec(system_code, fallback_type)
    if spec is None:
        return None
    existing = ChartOfAccount.objects.filter(system_code=spec["system_code"]).first()
    if existing is not None:
        if existing.account_type != spec["account_type"]:
            raise ValueError(f"{spec['system_code']} exists with wrong account type {existing.account_type}; manual review required.")
        if not existing.is_active:
            existing.is_active = True
            existing.save(update_fields=["is_active", "updated_at"])
        return existing
    by_code = ChartOfAccount.objects.filter(code=spec["code"]).first()
    if by_code is not None:
        if by_code.system_code and by_code.system_code != spec["system_code"]:
            raise ValueError(f"Chart code {spec['code']} already belongs to {by_code.system_code}; manual review required.")
        if by_code.account_type != spec["account_type"]:
            raise ValueError(f"Chart code {spec['code']} exists with wrong account type {by_code.account_type}; manual review required.")
        by_code.system_code = spec["system_code"]
        by_code.is_active = True
        by_code.save(update_fields=["system_code", "is_active", "updated_at"])
        return by_code
    return ChartOfAccount.objects.create(code=spec["code"], name=spec["name"], account_type=spec["account_type"], system_code=spec["system_code"], is_active=True, allow_manual_posting=True)


def _finance_anchor_for_purpose(purpose: str, chart: ChartOfAccount) -> FinanceAccount:
    if purpose == FinanceAccountMappingPurpose.CASH_COLLECTION:
        name, kind = "Main Cash Desk", FinanceAccountKind.CASH
    elif purpose == FinanceAccountMappingPurpose.UPI_COLLECTION:
        name, kind = "UPI Account", FinanceAccountKind.UPI
    elif purpose == FinanceAccountMappingPurpose.BANK_COLLECTION:
        name, kind = "Main Bank Account", FinanceAccountKind.BANK
    else:
        name, kind = "System Ledger Posting Profiles", FinanceAccountKind.BANK
    account, _ = FinanceAccount.objects.get_or_create(
        name=name,
        defaults={"kind": kind, "chart_account": chart, "opening_balance": "0.00", "is_real_settlement_account": purpose in COLLECTION_PURPOSES, "is_active": True},
    )
    changed = False
    if not account.is_active:
        account.is_active = True
        changed = True
    if account.chart_account_id != chart.id and purpose in COLLECTION_PURPOSES:
        account.chart_account = chart
        changed = True
    if changed:
        account.save()
    return account


def _ensure_mapping_for_purpose(purpose: str | None, expected_type: str | None, *, actor=None, reactivate: bool = False) -> None:
    if not purpose or purpose not in FinanceAccountMappingPurpose.values:
        return
    chart = _ensure_chart_account(PURPOSE_TO_SYSTEM_CODE.get(purpose, purpose), expected_type, actor=actor)
    if chart is None:
        return
    active = list(_mapping_qs(purpose).filter(is_active=True))
    if purpose not in COLLECTION_PURPOSES and len(active) > 1:
        raise ValueError(f"Multiple active mappings exist for {purpose}; manual cleanup required.")
    if active:
        mapping = active[0]
        if mapping.chart_account.account_type != (expected_type or mapping.chart_account.account_type):
            raise ValueError(f"Active mapping for {purpose} has wrong chart account type.")
        if mapping.chart_account_id != chart.id and purpose not in COLLECTION_PURPOSES:
            mapping.chart_account = chart
            mapping.updated_by = actor
            mapping.save()
        return
    inactive = _mapping_qs(purpose).filter(is_active=False).first()
    if inactive and reactivate:
        inactive.is_active = True
        inactive.chart_account = chart
        inactive.updated_by = actor
        inactive.save()
        return
    if inactive and not reactivate:
        return
    finance = _finance_anchor_for_purpose(purpose, chart)
    FinanceAccountCoaMapping.objects.create(finance_account=finance, chart_account=chart, purpose=purpose, is_default=not FinanceAccountCoaMapping.objects.filter(purpose=purpose, is_active=True, is_default=True).exists(), is_active=True, created_by=actor, updated_by=actor, notes="Seeded by accounting mapping audit safe defaults.")


def _ensure_profile_for_system_code(system_code: str | None, expected_type: str | None) -> None:
    chart = _ensure_chart_account(system_code, expected_type)
    canonical = _canonical_system_code(system_code)
    if chart is None or not canonical:
        return
    profile, created = AccountingPostingProfile.objects.get_or_create(key=canonical, defaults={"label": chart.name, "chart_account": chart, "is_system_only": True, "is_active": True, "description": "Seeded by accounting mapping audit safe defaults."})
    if not created:
        changed = False
        if not profile.is_active:
            profile.is_active = True
            changed = True
        if profile.chart_account_id != chart.id:
            profile.chart_account = chart
            changed = True
        if changed:
            profile.save()


@transaction.atomic
def seed_safe_mapping_defaults(*, actor=None) -> dict[str, Any]:
    journal_before = JournalEntry.objects.count()
    sequence_before = DocumentSequence.objects.count()
    before = build_accounting_mapping_audit()
    apply_accounting_setup_defaults(performed_by=actor)
    ensure_premade_rent_lease_accounting_setup(performed_by=actor)
    for spec in FULL_MAPPING_EVENT_REGISTRY:
        if spec.event_key == "staff_advance" or not (_source_model_exists(spec) or spec.supported_if_source_missing):
            continue
        _ensure_mapping_for_purpose(spec.debit_purpose, spec.debit_account_type, actor=actor)
        _ensure_mapping_for_purpose(spec.credit_purpose, spec.credit_account_type, actor=actor)
        if spec.debit_purpose not in FinanceAccountMappingPurpose.values:
            _ensure_profile_for_system_code(spec.debit_purpose, spec.debit_account_type)
        if spec.credit_purpose not in FinanceAccountMappingPurpose.values:
            _ensure_profile_for_system_code(spec.credit_purpose, spec.credit_account_type)
    after = build_accounting_mapping_audit(mutate=True)
    return {
        "before": before,
        "after": after,
        "journal_entries_created": JournalEntry.objects.count() - journal_before,
        "document_sequences_allocated": DocumentSequence.objects.count() - sequence_before,
    }


@transaction.atomic
def fix_mapping_audit_event(*, event_key: str, action: str, purpose: str | None = None, actor=None) -> dict[str, Any]:
    normalized_key = (event_key or "").strip().lower()
    action = (action or "").strip().lower()
    spec = next((row for row in FULL_MAPPING_EVENT_REGISTRY if row.event_key == normalized_key), None)
    if spec is None:
        raise ValueError("Unknown mapping audit event.")
    if spec.event_key == "staff_advance" or not _source_model_exists(spec):
        raise ValueError("Unsupported source workflow cannot be auto-fixed.")
    if action == "open_manual_required":
        return {"detail": "Manual review required; no mutation performed.", "audit": build_accounting_mapping_audit()}
    target_purposes = [purpose] if purpose else [spec.debit_purpose, spec.credit_purpose]
    for item in target_purposes:
        if not item:
            continue
        expected = spec.debit_account_type if item == spec.debit_purpose else spec.credit_account_type
        if item in FinanceAccountMappingPurpose.values:
            _ensure_mapping_for_purpose(item, expected, actor=actor, reactivate=action == "reactivate_mapping")
        else:
            _ensure_profile_for_system_code(item, expected)
    if spec.rent_lease_mapping:
        ensure_premade_rent_lease_accounting_setup(performed_by=actor)
    return {"detail": "Mapping event fix evaluated.", "audit": build_accounting_mapping_audit(mutate=True)}


def validate_mapping_audit() -> dict[str, Any]:
    return build_accounting_mapping_audit()
