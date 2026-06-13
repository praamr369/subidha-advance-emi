from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any

from django.db.models import Q
from django.utils import timezone

from accounting.models import AccountingBridgePosting, AccountingPeriod, AccountingPeriodStatus, FinancialYear, JournalEntry, MoneyMovement
from accounting.services.accounting_bridge_candidate_service import (
    BridgeCandidateFilters,
    list_bridge_candidates,
    summarize_candidate_statuses,
)
from accounting.services.accounting_postability_service import CANONICAL_STATUSES, canonicalize_bridge_readiness_payload, evaluate_accounting_postability
from accounting.services.accounting_bridge_readiness_service import build_accounting_bridge_posting_period_readiness
from accounting.services.returns_damage_credit_bridge_readiness_service import build_accounting_bridge_readiness_with_returns_damage_credit
from billing.models import BillingInvoice, ReceiptDocument
from reconciliation.models import ReconciliationItem
from settlements.models import SettlementAllocation

EXCEPTION_STATUSES = {"MISSING_LEDGER", "MISSING_SOURCE", "AMOUNT_MISMATCH", "QUANTITY_MISMATCH", "STATUS_MISMATCH", "DUPLICATE_POSTING", "WRONG_ACCOUNT", "NEEDS_REVIEW"}
SETUP_HREF = "/admin/accounting/setup/mapping-audit"
COA_HREF = "/admin/accounting/chart-of-accounts"
FINANCE_ACCOUNT_HREF = "/admin/accounting/finance-accounts"
BRIDGE_HREF = "/admin/accounting/bridges"
PERIODS_HREF = "/admin/accounting/periods"
DOCUMENT_NUMBERING_HREF = "/admin/settings/business-setup/document-numbering"
JOURNALS_HREF = "/admin/accounting/journals"
RECONCILIATION_HREF = "/admin/reconciliation/runs"


PHASE_F_ACTION_LINKS = (
    ("bridge_posting", "Bridge Posting", "/admin/accounting/bridge-reconciliation"),
    ("mapping_audit", "Mapping Audit", "/admin/accounting/setup/mapping-audit"),
    ("finance_accounts", "Finance Accounts", "/admin/settings/business-setup/finance-accounts"),
    ("accounting_periods", "Accounting Periods", "/admin/accounting/periods"),
    ("journal_numbering", "Journal Numbering", "/admin/settings/business-setup/document-numbering"),
    ("journals", "Journals", JOURNALS_HREF),
    ("reconciliation", "Reconciliation", RECONCILIATION_HREF),
)


PHASE_F_SOURCE_SPECS: tuple[dict[str, Any], ...] = (
    {"phase": "F1", "domain": "Cash/receipt/payment", "source_model": "Payment", "event_keys": ("subscription_emi_payment", "advance_emi_collection"), "accounting_shape": "Dr FinanceAccount chart account, Cr Customer receivable / EMI income", "source_owner": "subscriptions.Payment"},
    {"phase": "F2", "domain": "Cash/receipt/payment", "source_model": "ReceiptDocument", "event_keys": ("direct_sale_receipt", "customer_advance", "customer_refund", "refund_customer_credit"), "accounting_shape": "Receipt-specific cash/bank/UPI settlement against receivable or customer credit", "source_owner": "billing.ReceiptDocument"},
    {"phase": "F3", "domain": "Billing/invoice/returns", "source_model": "BillingInvoice", "event_keys": ("direct_sale_invoice", "direct_sale_outstanding"), "accounting_shape": "Dr Customer receivable, Cr Direct sale income / output tax when applicable", "source_owner": "billing.BillingInvoice"},
    {"phase": "F4", "domain": "Billing/invoice/returns", "source_model": "BillingCreditNote", "event_keys": ("credit_note_issue", "sales_return", "customer_credit_adjustment", "direct_sale_return"), "accounting_shape": "Dr sales return/customer credit account, Cr customer receivable", "source_owner": "billing.BillingCreditNote"},
    {"phase": "F4", "domain": "Billing/invoice/returns", "source_model": "DirectSaleReturn", "event_keys": ("direct_sale_return", "sales_return"), "accounting_shape": "Dr sales return / inventory-adjusted return account, Cr customer receivable", "source_owner": "billing.DirectSaleReturn"},
    {"phase": "F5", "domain": "Billing/invoice/returns", "source_model": "BillingDebitNote", "event_keys": ("debit_note_issue", "customer_debit_adjustment", "damage_recovery", "additional_receivable_adjustment"), "accounting_shape": "Dr customer receivable, Cr damage recovery / adjustment income", "source_owner": "billing.BillingDebitNote"},
    {"phase": "F6", "domain": "Purchase/vendor", "source_model": "PurchaseBill", "event_keys": ("purchase_bill_accrual", "purchase_bill"), "accounting_shape": "Dr inventory/expense/input tax, Cr vendor payable", "source_owner": "inventory.PurchaseBill"},
    {"phase": "F7", "domain": "Purchase/vendor", "source_model": "VendorPayment", "event_keys": ("vendor_payment", "vendor_payment_settlement"), "accounting_shape": "Dr vendor payable, Cr concrete finance account", "source_owner": "inventory.VendorPayment"},
    {"phase": "F8", "domain": "Inventory/COGS", "source_model": "StockLedger", "event_keys": ("stock_ledger_inventory_movement", "inventory_movement"), "accounting_shape": "Inventory movement between mapped stock accounts", "source_owner": "inventory.StockLedger"},
    {"phase": "F9", "domain": "Inventory/COGS", "source_model": "StockLedger", "event_keys": ("cogs_stockout", "deferred_cogs"), "accounting_shape": "Dr COGS, Cr inventory asset", "source_owner": "inventory.StockLedger"},
    {"phase": "F10", "domain": "Commission/payout", "source_model": "Commission", "event_keys": ("commission_accrual", "partner_commission_accrual", "sales_commission_accrual"), "accounting_shape": "Dr commission expense, Cr commission payable", "source_owner": "subscriptions.Commission"},
    {"phase": "F11", "domain": "Commission/payout", "source_model": "CommissionPayoutBatch", "event_keys": ("commission_payout", "commission_settlement", "partner_commission_payout", "commission_payable_settlement"), "accounting_shape": "Dr commission payable, Cr concrete payout finance account", "source_owner": "subscriptions.CommissionPayoutBatch"},
    {"phase": "F12", "domain": "Payroll/salary", "source_model": "SalarySheet", "event_keys": ("salary_accrual", "payroll_accrual"), "accounting_shape": "Dr salary expense, Cr salary payable", "source_owner": "hr.SalarySheet"},
    {"phase": "F13", "domain": "Payroll/salary", "source_model": "SalaryPayment", "event_keys": ("salary_payment", "payroll_payment"), "accounting_shape": "Dr salary payable, Cr concrete finance account", "source_owner": "hr.SalaryPayment"},
    {"phase": "F14", "domain": "Rent/lease", "source_model": "RentLeaseBillingDemand", "event_keys": ("rent_monthly_revenue", "lease_monthly_revenue", "rent_invoice_revenue", "lease_invoice_revenue", "rent_lease_invoice_revenue"), "accounting_shape": "Dr customer receivable, Cr rent/lease income / output tax when applicable", "source_owner": "subscriptions.RentLeaseBillingDemand"},
    {"phase": "F15B", "domain": "Rent/lease", "source_model": "RentLeaseCollection", "event_keys": ("rent_lease_collection_source_contract",), "accounting_shape": "Source contract only; F15C owns controlled settlement posting", "source_owner": "subscriptions.RentLeaseCollection", "default_status": "DEFERRED"},
    {"phase": "F15C", "domain": "Rent/lease", "source_model": "RentLeaseCollection", "event_keys": ("rent_lease_collection_settlement", "rent_lease_monthly_collection"), "accounting_shape": "Dr concrete finance account, Cr customer receivable / settlement account", "source_owner": "subscriptions.RentLeaseCollection"},
    {"phase": "F16", "domain": "Security deposit", "source_model": "RentLeaseDepositTransaction", "event_keys": ("security_deposit_source_contract",), "accounting_shape": "Source contract only; F17/F18 own receipt/refund posting", "source_owner": "subscriptions.RentLeaseDepositTransaction", "default_status": "DEFERRED"},
    {"phase": "F17", "domain": "Security deposit", "source_model": "RentLeaseDepositTransaction", "event_keys": ("security_deposit_receipt", "rent_security_deposit_receipt", "lease_security_deposit_receipt"), "accounting_shape": "Dr concrete finance account, Cr security deposit liability", "source_owner": "subscriptions.RentLeaseDepositTransaction"},
    {"phase": "F18", "domain": "Security deposit", "source_model": "RentLeaseDepositTransaction", "event_keys": ("security_deposit_refund", "rent_security_deposit_refund", "lease_security_deposit_refund"), "accounting_shape": "Dr security deposit liability, Cr concrete finance account", "source_owner": "subscriptions.RentLeaseDepositTransaction"},
    {"phase": "F19", "domain": "Customer advance", "source_model": "CustomerAdvance", "event_keys": ("customer_advance_source_contract",), "accounting_shape": "Source-contract hardening only; F20 owns receipt posting", "source_owner": "subscriptions.CustomerAdvance", "default_status": "DEFERRED"},
    {"phase": "F20", "domain": "Customer advance", "source_model": "CustomerAdvance", "event_keys": ("customer_advance_receipt", "customer_advance"), "accounting_shape": "Dr concrete finance account, Cr customer advance liability", "source_owner": "subscriptions.CustomerAdvance"},
    {"phase": "F21", "domain": "Customer advance", "source_model": "CustomerAdvanceAllocation", "event_keys": ("customer_advance_application", "advance_application"), "accounting_shape": "Dr customer advance liability, Cr customer receivable", "source_owner": "subscriptions.CustomerAdvanceAllocation"},
    {"phase": "F22", "domain": "Customer advance", "source_model": "CustomerAdvanceRefund", "event_keys": ("customer_advance_refund_source_contract",), "accounting_shape": "Source-contract hardening only; F23 owns refund posting", "source_owner": "subscriptions.CustomerAdvanceRefund", "default_status": "DEFERRED"},
    {"phase": "F23", "domain": "Customer advance", "source_model": "CustomerAdvanceRefund", "event_keys": ("customer_advance_refund",), "accounting_shape": "Dr customer advance liability, Cr concrete finance account", "source_owner": "subscriptions.CustomerAdvanceRefund"},
    {"phase": "Deferred", "domain": "Payroll/salary", "source_model": "StaffAdvance", "event_keys": ("staff_advance",), "accounting_shape": "Unsupported boundary; no controlled bridge posting source exists", "source_owner": "HR/Payroll", "default_status": "UNSUPPORTED"},
)


F25_SAFETY_COPY = "Validation is read-only. Posting remains explicit, admin-only, idempotent, period-gated, numbering-gated, and reconciliation-controlled."


F25_VALIDATION_WORKFLOWS: tuple[dict[str, Any], ...] = (
    {"domain": "EMI / subscription", "workflow": "EMI payment collection", "source_model": "Payment", "event_key": "subscription_emi_payment", "accounting_shape": "Dr FinanceAccount chart account, Cr customer receivable / EMI income", "operator": "cashier/admin", "bridge_source_ownership": "F1 Payment bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Posted rows require operator verification before reconciled.", "validation_test_name": "test_emi_subscription_workflows_and_advance_allocation_boundary"},
    {"domain": "EMI / subscription", "workflow": "EMI receipt", "source_model": "ReceiptDocument", "event_key": "direct_sale_receipt", "accounting_shape": "ReceiptDocument remains receipt evidence; EMI payment accounting remains owned by Payment F1.", "operator": "cashier/admin", "bridge_source_ownership": "F2 receipt bridge; EMI cash posting remains F1 Payment", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Receipt evidence is reviewed separately from EMI payment posting.", "validation_test_name": "test_emi_subscription_workflows_and_advance_allocation_boundary"},
    {"domain": "EMI / subscription", "workflow": "Winner waiver remains future-EMI-only", "source_model": "WinnerHistory", "event_key": "future_emi_waiver", "accounting_shape": "Waiver is non-cash benefit; paid EMIs remain paid and future EMI rows may be waived by draw service only.", "operator": "admin/system", "bridge_source_ownership": "Lucky draw/waiver workflow; no new F25 posting source", "expected_candidate_status": "VALIDATION_ONLY", "expected_action_link": "lucky_draw", "expected_reconciliation_posture": "Waived EMI must remain distinguishable from paid EMI.", "validation_test_name": "test_emi_subscription_workflows_and_advance_allocation_boundary"},
    {"domain": "EMI / subscription", "workflow": "ADVANCE_ALLOCATION Payment remains excluded from F1", "source_model": "Payment", "event_key": "ADVANCE_ALLOCATION", "accounting_shape": "Advance allocation is not Payment F1 cash collection; customer advance application remains F21.", "operator": "system/admin", "bridge_source_ownership": "Excluded from F1; F21 owns CustomerAdvanceAllocation application", "expected_candidate_status": "EXCLUDED", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "No Payment F1 reconciliation credit for advance allocation rows.", "validation_test_name": "test_emi_subscription_workflows_and_advance_allocation_boundary"},
    {"domain": "Direct sale / billing", "workflow": "Direct-sale invoice", "source_model": "BillingInvoice", "event_key": "direct_sale_invoice", "accounting_shape": "Dr customer receivable, Cr direct sale income / output tax when applicable", "operator": "admin/system", "bridge_source_ownership": "F3 BillingInvoice bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Invoice posting must be verified before reconciled.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Direct sale / billing", "workflow": "Direct-sale receipt", "source_model": "ReceiptDocument", "event_key": "direct_sale_receipt", "accounting_shape": "Dr concrete finance account, Cr direct sale/customer receivable", "operator": "cashier/admin", "bridge_source_ownership": "F2 ReceiptDocument bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Receipt posting must be verified before reconciled.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Direct sale / billing", "workflow": "Credit note", "source_model": "BillingCreditNote", "event_key": "credit_note_issue", "accounting_shape": "Dr sales return/customer credit account, Cr customer receivable", "operator": "admin", "bridge_source_ownership": "F4 BillingCreditNote bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Credit note posting must be verified before reconciled.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Direct sale / billing", "workflow": "Debit note", "source_model": "BillingDebitNote", "event_key": "debit_note_issue", "accounting_shape": "Dr customer receivable, Cr damage recovery / adjustment income", "operator": "admin", "bridge_source_ownership": "F5 BillingDebitNote bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Debit note posting must be verified before reconciled.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Direct sale / billing", "workflow": "Direct-sale return", "source_model": "DirectSaleReturn", "event_key": "direct_sale_return", "accounting_shape": "Dr sales return / inventory-adjusted return account, Cr customer receivable", "operator": "admin/system", "bridge_source_ownership": "F4 DirectSaleReturn bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Return posting must be verified before reconciled.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Purchase / vendor", "workflow": "Purchase bill", "source_model": "PurchaseBill", "event_key": "purchase_bill_accrual", "accounting_shape": "Dr inventory/expense/input tax, Cr vendor payable", "operator": "admin/system", "bridge_source_ownership": "F6 PurchaseBill bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Purchase bill accrual requires bridge verification.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Purchase / vendor", "workflow": "Vendor payment", "source_model": "VendorPayment", "event_key": "vendor_payment", "accounting_shape": "Dr vendor payable, Cr concrete finance account", "operator": "admin", "bridge_source_ownership": "F7 VendorPayment bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Vendor payment settlement requires verification.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Inventory / COGS", "workflow": "Stock receive", "source_model": "StockLedger", "event_key": "stock_ledger_inventory_movement", "accounting_shape": "Inventory movement between mapped stock accounts", "operator": "system/admin", "bridge_source_ownership": "F8 StockLedger bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Stock receive accounting requires bridge verification.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Inventory / COGS", "workflow": "Stock adjustment", "source_model": "StockLedger", "event_key": "inventory_movement", "accounting_shape": "Inventory movement between mapped stock accounts", "operator": "system/admin", "bridge_source_ownership": "F8 StockLedger bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Adjustment accounting requires bridge verification.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Inventory / COGS", "workflow": "Stock-out / COGS", "source_model": "StockLedger", "event_key": "cogs_stockout", "accounting_shape": "Dr COGS, Cr inventory asset", "operator": "system/admin", "bridge_source_ownership": "F9 StockLedger COGS bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "COGS posting requires bridge verification.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Commission / payout", "workflow": "Commission accrual", "source_model": "Commission", "event_key": "commission_accrual", "accounting_shape": "Dr commission expense, Cr commission payable", "operator": "system/admin", "bridge_source_ownership": "F10 Commission bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Commission accrual requires bridge verification.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Commission / payout", "workflow": "Commission payout", "source_model": "CommissionPayoutBatch", "event_key": "partner_commission_payout", "accounting_shape": "Dr commission payable, Cr concrete payout finance account", "operator": "admin", "bridge_source_ownership": "F11 CommissionPayoutBatch bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Payout settlement requires bridge verification.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Payroll", "workflow": "Salary accrual", "source_model": "SalarySheet", "event_key": "salary_accrual", "accounting_shape": "Dr salary expense, Cr salary payable", "operator": "admin/system", "bridge_source_ownership": "F12 SalarySheet bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Salary accrual requires bridge verification.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Payroll", "workflow": "Salary payment", "source_model": "SalaryPayment", "event_key": "salary_payment", "accounting_shape": "Dr salary payable, Cr concrete finance account", "operator": "admin", "bridge_source_ownership": "F13 SalaryPayment bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Salary payment requires bridge verification.", "validation_test_name": "test_matrix_includes_all_required_operational_workflows"},
    {"domain": "Rent/lease", "workflow": "Rent/lease revenue", "source_model": "RentLeaseBillingDemand", "event_key": "rent_monthly_revenue", "accounting_shape": "Dr customer receivable, Cr rent/lease income / output tax when applicable", "operator": "system/admin", "bridge_source_ownership": "F14 RentLeaseBillingDemand bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Revenue demand posting is separate from cash settlement.", "validation_test_name": "test_rent_lease_and_security_deposit_separation"},
    {"domain": "Rent/lease", "workflow": "Rent/lease collection settlement", "source_model": "RentLeaseCollection", "event_key": "rent_lease_collection_settlement", "accounting_shape": "Dr concrete finance account, Cr customer receivable / settlement account", "operator": "cashier/admin", "bridge_source_ownership": "F15C RentLeaseCollection bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Collection settlement remains separate from F14 revenue demand.", "validation_test_name": "test_rent_lease_and_security_deposit_separation"},
    {"domain": "Rent/lease", "workflow": "Security deposit receipt", "source_model": "RentLeaseDepositTransaction", "event_key": "security_deposit_receipt", "accounting_shape": "Dr concrete finance account, Cr security deposit liability", "operator": "cashier/admin", "bridge_source_ownership": "F17 RentLeaseDepositTransaction receipt bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Deposit receipt is liability, not income.", "validation_test_name": "test_rent_lease_and_security_deposit_separation"},
    {"domain": "Rent/lease", "workflow": "Security deposit refund", "source_model": "RentLeaseDepositTransaction", "event_key": "security_deposit_refund", "accounting_shape": "Dr security deposit liability, Cr concrete finance account", "operator": "admin", "bridge_source_ownership": "F18 RentLeaseDepositTransaction refund bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Deposit refund remains separate from receipt and rent/lease revenue.", "validation_test_name": "test_rent_lease_and_security_deposit_separation"},
    {"domain": "Customer advance", "workflow": "ReceiptDocument.customer_advance remains F2", "source_model": "ReceiptDocument", "event_key": "customer_advance", "accounting_shape": "ReceiptDocument customer advance evidence remains F2 receipt bridge.", "operator": "cashier/admin", "bridge_source_ownership": "F2 ReceiptDocument bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Kept separate from concrete CustomerAdvance F20 receipt posting.", "validation_test_name": "test_customer_advance_phase_separation"},
    {"domain": "Customer advance", "workflow": "CustomerAdvance receipt remains F20", "source_model": "CustomerAdvance", "event_key": "customer_advance_receipt", "accounting_shape": "Dr concrete finance account, Cr customer advance liability", "operator": "cashier/admin", "bridge_source_ownership": "F20 CustomerAdvance bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "CustomerAdvance receipt is liability until applied.", "validation_test_name": "test_customer_advance_phase_separation"},
    {"domain": "Customer advance", "workflow": "CustomerAdvanceAllocation application remains F21", "source_model": "CustomerAdvanceAllocation", "event_key": "customer_advance_application", "accounting_shape": "Dr customer advance liability, Cr customer receivable", "operator": "admin/system", "bridge_source_ownership": "F21 CustomerAdvanceAllocation bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Advance application is not F1 cash collection.", "validation_test_name": "test_customer_advance_phase_separation"},
    {"domain": "Customer advance", "workflow": "CustomerAdvanceRefund refund remains F23", "source_model": "CustomerAdvanceRefund", "event_key": "customer_advance_refund", "accounting_shape": "Dr customer advance liability, Cr concrete finance account", "operator": "admin", "bridge_source_ownership": "F23 CustomerAdvanceRefund bridge", "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Refund remains separate from F22 source contract hardening.", "validation_test_name": "test_customer_advance_phase_separation"},
    {"domain": "Control tower", "workflow": "Readiness source inventory", "source_model": "PhaseFControlTower", "event_key": "source_inventory", "accounting_shape": "Read-only inventory of supported, deferred, and unsupported Phase F source workflows.", "operator": "admin/system", "bridge_source_ownership": "F24/F25 validation payload", "expected_candidate_status": "VALIDATION_ONLY", "expected_action_link": "bridge_posting", "expected_reconciliation_posture": "Inventory does not mark posted-unverified rows reconciled.", "validation_test_name": "test_control_tower_validation_surfaces_and_no_mutation_contract"},
    {"domain": "Control tower", "workflow": "Mapping blockers", "source_model": "PhaseFControlTower", "event_key": "mapping_blockers", "accounting_shape": "Read-only blocker routing to mapping audit.", "operator": "admin", "bridge_source_ownership": "F24/F25 validation payload", "expected_candidate_status": "BLOCKED_BY_MAPPING", "expected_action_link": "mapping_audit", "expected_reconciliation_posture": "Blocked rows remain unreconciled.", "validation_test_name": "test_control_tower_validation_surfaces_and_no_mutation_contract"},
    {"domain": "Control tower", "workflow": "Finance-account blockers", "source_model": "PhaseFControlTower", "event_key": "finance_account_blockers", "accounting_shape": "Read-only blocker routing to finance account setup.", "operator": "admin", "bridge_source_ownership": "F24/F25 validation payload", "expected_candidate_status": "BLOCKED_BY_FINANCE_ACCOUNT", "expected_action_link": "finance_accounts", "expected_reconciliation_posture": "Blocked rows remain unreconciled.", "validation_test_name": "test_control_tower_validation_surfaces_and_no_mutation_contract"},
    {"domain": "Control tower", "workflow": "Numbering blockers", "source_model": "PhaseFControlTower", "event_key": "numbering_blockers", "accounting_shape": "Read-only blocker routing to journal numbering setup.", "operator": "admin", "bridge_source_ownership": "F24/F25 validation payload", "expected_candidate_status": "BLOCKED_BY_NUMBERING", "expected_action_link": "journal_numbering", "expected_reconciliation_posture": "Blocked rows remain unreconciled.", "validation_test_name": "test_control_tower_validation_surfaces_and_no_mutation_contract"},
    {"domain": "Control tower", "workflow": "Period blockers", "source_model": "PhaseFControlTower", "event_key": "period_blockers", "accounting_shape": "Read-only blocker routing to accounting periods.", "operator": "admin", "bridge_source_ownership": "F24/F25 validation payload", "expected_candidate_status": "BLOCKED_BY_PERIOD", "expected_action_link": "accounting_periods", "expected_reconciliation_posture": "Blocked rows remain unreconciled.", "validation_test_name": "test_control_tower_validation_surfaces_and_no_mutation_contract"},
    {"domain": "Control tower", "workflow": "Unsupported source blockers", "source_model": "StaffAdvance", "event_key": "staff_advance", "accounting_shape": "Unsupported boundary; no controlled bridge posting source exists.", "operator": "admin/system", "bridge_source_ownership": "Unsupported boundary", "expected_candidate_status": "UNSUPPORTED", "expected_action_link": "mapping_audit", "expected_reconciliation_posture": "Unsupported rows are visible but never postable.", "validation_test_name": "test_staff_advance_and_unsupported_sources_remain_non_postable"},
    {"domain": "Control tower", "workflow": "Posted-unverified not treated as reconciled", "source_model": "PhaseFControlTower", "event_key": "posted_unverified_review", "accounting_shape": "Posted journal exists, but bridge reconciliation verification is still pending.", "operator": "admin", "bridge_source_ownership": "Bridge reconciliation verification", "expected_candidate_status": "POSTED_UNVERIFIED", "expected_action_link": "reconciliation", "expected_reconciliation_posture": "POSTED_UNVERIFIED count must not increment reconciled count.", "validation_test_name": "test_posted_unverified_rows_are_not_reconciled"},
)


@dataclass(frozen=True)
class BridgeReconciliationFilters:
    module: str | None = None
    event_key: str | None = None
    date_from: Any = None
    date_to: Any = None
    status: str | None = None
    customer: str | None = None
    vendor: str | None = None
    partner: str | None = None
    financial_year: str | None = None
    accounting_period: str | None = None
    source_type: str | None = None
    source_model: str | None = None
    account: str | None = None


def _normalize(value: Any) -> str:
    return str(value or "").strip()


def _norm_key(value: Any) -> str:
    return _normalize(value).lower().replace(" ", "_").replace("-", "_")


def _int_or_none(value: Any) -> int | None:
    text = _normalize(value)
    return int(text) if text.isdigit() else None


def _posting_event_key(posting: AccountingBridgePosting) -> str:
    metadata = getattr(posting, "trace_metadata", None)
    if isinstance(metadata, dict) and _normalize(metadata.get("event_key")):
        return _norm_key(metadata.get("event_key"))
    purpose = _normalize(getattr(posting, "purpose", ""))
    return _norm_key(purpose) if purpose else (_norm_key(getattr(posting, "source_type", "")) or "posted_bridge")


def _posting_module(posting: AccountingBridgePosting) -> str:
    source_model = _normalize(getattr(posting, "source_model", ""))
    if source_model in {"Payment", "Subscription", "Commission", "CommissionPayoutBatch"}:
        return "subscriptions"
    if source_model in {"ReceiptDocument", "BillingInvoice", "BillingCreditNote", "BillingDebitNote", "DirectSale"}:
        return "billing"
    if source_model in {"PurchaseBill", "VendorPayment", "StockLedger", "GoodsReceipt"}:
        return "inventory"
    if source_model in {"ProductionJob", "ManufacturingBom"}:
        return "manufacturing"
    if source_model in {"SalarySheet", "SalaryPayment", "EmployeeExpenseClaim", "EmployeeExpenseClaimPayment", "VendorSettlement", "MoneyMovement"}:
        return "accounting"
    return _normalize(getattr(posting, "source_type", "")) or "accounting"


def _financial_year_payload(financial_year: FinancialYear | None) -> dict[str, Any] | None:
    if financial_year is None:
        return None
    return {"id": financial_year.id, "code": financial_year.code, "name": financial_year.name, "start_date": financial_year.start_date.isoformat(), "end_date": financial_year.end_date.isoformat(), "is_active": financial_year.is_active}


def _period_payload(period: AccountingPeriod | None) -> dict[str, Any] | None:
    if period is None:
        return None
    return {"id": period.id, "code": period.code, "name": period.name or period.label, "start_date": period.start_date.isoformat(), "end_date": period.end_date.isoformat(), "status": period.status, "is_locked": period.is_locked, "financial_year": period.financial_year_id, "financial_year_code": getattr(period.financial_year, "code", None)}


def _resolve_financial_year(filters: BridgeReconciliationFilters) -> tuple[FinancialYear | None, list[str]]:
    requested = _normalize(filters.financial_year)
    queryset = FinancialYear.objects.all().order_by("-start_date", "-id")
    if requested:
        numeric_id = _int_or_none(requested)
        lookup = Q(code__iexact=requested)
        if numeric_id is not None:
            lookup |= Q(pk=numeric_id)
        financial_year = queryset.filter(lookup).first()
        return financial_year, [] if financial_year else ["Selected financial year is missing."]
    financial_year = queryset.filter(is_active=True).first()
    return financial_year, [] if financial_year else ["No active financial year is configured."]


def _resolve_period(filters: BridgeReconciliationFilters, financial_year: FinancialYear | None) -> tuple[AccountingPeriod | None, list[str]]:
    queryset = AccountingPeriod.objects.select_related("financial_year").all().order_by("start_date", "id")
    if financial_year is not None:
        queryset = queryset.filter(financial_year=financial_year)
    if not queryset.exists():
        return None, ["No accounting periods are configured for the selected financial year." if financial_year else "No accounting periods are configured."]
    requested = _normalize(filters.accounting_period)
    if requested:
        numeric_id = _int_or_none(requested)
        lookup = Q(code__iexact=requested)
        if numeric_id is not None:
            lookup |= Q(pk=numeric_id)
        period = queryset.filter(lookup).first()
        return period, [] if period else ["Selected accounting period is missing."]
    today = timezone.localdate()
    period = queryset.filter(start_date__lte=today, end_date__gte=today).first()
    if period is None:
        period = queryset.filter(status=AccountingPeriodStatus.OPEN).first() or queryset.first()
    return period, []


def _range_from_selection(*, filters: BridgeReconciliationFilters, financial_year: FinancialYear | None, period: AccountingPeriod | None) -> tuple[Any, Any]:
    start = filters.date_from
    end = filters.date_to
    if period is not None:
        start = start or period.start_date
        end = end or period.end_date
    elif financial_year is not None:
        start = start or financial_year.start_date
        end = end or financial_year.end_date
    return start, end


def _available_periods(financial_year: FinancialYear | None) -> list[dict[str, Any]]:
    queryset = AccountingPeriod.objects.select_related("financial_year").order_by("start_date", "id")
    if financial_year is not None:
        queryset = queryset.filter(financial_year=financial_year)
    return [_period_payload(period) or {} for period in queryset]


def _has_settlement_link(source_model: str, source_id: str, source_reference: str) -> bool:
    query = Q(source_id=source_id)
    if source_model == "Payment" and source_id:
        query |= Q(payment_id=source_id)
    if source_model == "ReceiptDocument" and source_id:
        query |= Q(receipt_id=source_id)
    if source_model == "MoneyMovement" and source_id:
        query |= Q(money_movement_id=source_id)
    if source_reference:
        query |= Q(source_id=source_reference)
    return SettlementAllocation.objects.filter(query).exists()


def _reconciliation_items(source_model: str, source_id: str, source_reference: str):
    query = Q(source_type=source_model, source_id=source_id)
    if source_reference:
        query |= Q(source_label__icontains=source_reference) | Q(metadata__icontains=source_reference)
    return ReconciliationItem.objects.filter(query).order_by("-created_at", "-id")[:5]


def _row_passes_filters(row: dict[str, Any], filters: BridgeReconciliationFilters) -> bool:
    if filters.module and row.get("module") != filters.module:
        return False
    if filters.event_key and row.get("event_key") != filters.event_key:
        return False
    if filters.status and row.get("status") != filters.status:
        return False
    if filters.source_model and row.get("source_model") != filters.source_model:
        return False
    if filters.source_type and row.get("source_type") != filters.source_type:
        return False
    return True


def _row_action_hrefs(postability: dict[str, Any], *, event_key: str, period: AccountingPeriod | None) -> dict[str, Any]:
    status = postability["status"]
    if status == "UNSUPPORTED_SOURCE":
        return {"action_href": SETUP_HREF, "setup_href": SETUP_HREF, "preview_action_href": None, "post_action_href": None, "source_action_href": None, "is_acknowledgeable": False, "is_postable": False}
    if status == "BLOCKED_BY_MAPPING":
        href = FINANCE_ACCOUNT_HREF if event_key in {"inventory_delivery_out", "manufacturing_wastage"} else SETUP_HREF
        return {"action_href": href, "setup_href": SETUP_HREF, "preview_action_href": None, "post_action_href": None, "source_action_href": None, "is_acknowledgeable": False, "is_postable": False}
    if status == "BLOCKED_BY_PERIOD":
        return {"action_href": PERIODS_HREF, "setup_href": PERIODS_HREF, "preview_action_href": None, "post_action_href": None, "source_action_href": None, "is_acknowledgeable": False, "is_postable": False}
    if status == "BLOCKED_BY_NUMBERING":
        return {"action_href": DOCUMENT_NUMBERING_HREF, "setup_href": DOCUMENT_NUMBERING_HREF, "preview_action_href": None, "post_action_href": None, "source_action_href": None, "is_acknowledgeable": False, "is_postable": False}
    if status == "BLOCKED_BY_APPROVAL":
        return {"action_href": BRIDGE_HREF, "setup_href": BRIDGE_HREF, "preview_action_href": BRIDGE_HREF, "post_action_href": None, "source_action_href": None, "is_acknowledgeable": False, "is_postable": False}
    if status in {"POSTABLE", "READY_UNPOSTED"}:
        period_open = period is not None and period.status == AccountingPeriodStatus.OPEN
        return {"action_href": "/admin/accounting/bridge-reconciliation", "setup_href": SETUP_HREF, "preview_action_href": None, "post_action_href": None, "source_action_href": "/admin/accounting/bridge-reconciliation", "is_acknowledgeable": False, "is_postable": False, "abstract_posting_blocked": True, "period_open": period_open}
    return {"action_href": "/admin/reconciliation/runs", "setup_href": SETUP_HREF, "preview_action_href": None, "post_action_href": None, "source_action_href": None, "is_acknowledgeable": False, "is_postable": False}


def _readiness_rows(readiness_payload: dict[str, Any], filters: BridgeReconciliationFilters, *, financial_year: FinancialYear | None, period: AccountingPeriod | None) -> list[dict[str, Any]]:
    period_payload = readiness_payload.get("accounting_period_readiness") or readiness_payload.get("financial_year_readiness") or build_accounting_bridge_posting_period_readiness(
        reference_date=period.start_date if period is not None else None,
        financial_year=financial_year,
        period=period,
    )
    canonical = canonicalize_bridge_readiness_payload(readiness_payload, as_source_rows=True)
    rows: list[dict[str, Any]] = []
    for event in canonical.get("events") or []:
        postability = evaluate_accounting_postability(
            event_key=event.get("event_key"),
            event_label=event.get("label"),
            module=event.get("source_module") or event.get("event_group"),
            source_model=event.get("source_model"),
            bridge_row=event,
            period_readiness=period_payload,
            source_workflow_exists=event.get("status") != "UNSUPPORTED_SOURCE" and event.get("event_key") != "staff_advance",
            as_source_row=True,
        )
        action_meta = _row_action_hrefs(postability, event_key=event.get("event_key"), period=period)
        row = {
            "row_type": "readiness_event",
            "event_key": event.get("event_key"),
            "label": event.get("label") or postability["event_label"],
            "module": event.get("source_module") or postability["module"],
            "event_group": event.get("event_group"),
            "source_model": event.get("source_model"),
            "source_type": event.get("source_model"),
            "source_id": None,
            "source_reference": None,
            "status": postability["status"],
            "mapping_status": "READY" if postability["mapping_ready"] else "BLOCKED_BY_MAPPING",
            "posting_mode": event.get("posting_mode"),
            "can_preview": postability["can_preview"],
            "can_post": False,
            "can_reconcile": postability["can_reconcile"],
            "supported": postability["supported"],
            "financial_year": _financial_year_payload(financial_year),
            "accounting_period": _period_payload(period),
            "period_status": getattr(period, "status", None),
            "period_blocker_code": period_payload.get("period_blocker_code"),
            "period_blocker_reason": period_payload.get("period_blocker_reason"),
            "journal_entry": None,
            "settlement_linked": False,
            "reconciliation_linked": False,
            "reconciliation_items": [],
            "exception_reasons": event.get("blocking_reasons") or ([postability["blocker_reason"]] if postability.get("blocker_reason") else []),
            "operator_action": postability["recommended_action"],
            "blocker_code": postability["blocker_code"],
            "blocker_label": postability["blocker_code"],
            "blocker_count": 1 if postability.get("blocker_code") else 0,
            "blocker_reason": postability["blocker_reason"],
            "recommended_action": postability["recommended_action"],
            "source_item_action": "View source items",
            "unsafe_abstract_posting_blocked": True,
            "financial_year_id": getattr(financial_year, "id", None),
            "accounting_period_id": getattr(period, "id", None),
            **action_meta,
        }
        if _row_passes_filters(row, filters):
            rows.append(row)
    return rows


def _apply_posted_filters(queryset, filters: BridgeReconciliationFilters, financial_year: FinancialYear | None, period: AccountingPeriod | None):
    start, end = _range_from_selection(filters=filters, financial_year=financial_year, period=period)
    if financial_year is not None:
        queryset = queryset.filter(Q(journal_entry__financial_year=financial_year) | Q(journal_entry__entry_date__gte=financial_year.start_date, journal_entry__entry_date__lte=financial_year.end_date))
    if period is not None:
        queryset = queryset.filter(Q(journal_entry__accounting_period=period) | Q(journal_entry__entry_date__gte=period.start_date, journal_entry__entry_date__lte=period.end_date))
    if start:
        queryset = queryset.filter(journal_entry__entry_date__gte=start)
    if end:
        queryset = queryset.filter(journal_entry__entry_date__lte=end)
    if filters.source_model:
        queryset = queryset.filter(source_model=filters.source_model)
    if filters.source_type:
        queryset = queryset.filter(source_type=filters.source_type)
    return queryset.distinct()


def _posted_rows(filters: BridgeReconciliationFilters, financial_year: FinancialYear | None, period: AccountingPeriod | None) -> list[dict[str, Any]]:
    queryset = AccountingBridgePosting.objects.select_related("journal_entry", "journal_entry__financial_year", "journal_entry__accounting_period")
    queryset = _apply_posted_filters(queryset, filters, financial_year, period).order_by("-created_at", "-id")[:500]
    rows: list[dict[str, Any]] = []
    for posting in queryset:
        journal: JournalEntry | None = getattr(posting, "journal_entry", None)
        source_model = _normalize(getattr(posting, "source_model", ""))
        source_id = _normalize(getattr(posting, "source_id", ""))
        source_reference = _normalize(getattr(posting, "source_reference", "")) or _normalize(getattr(journal, "source_reference", ""))
        rec_items = list(_reconciliation_items(source_model, source_id, source_reference))
        matched_items = [item for item in rec_items if item.status == "MATCHED"]
        pending_items = [item for item in rec_items if item.exception_code == "POSTED_UNVERIFIED" and item.status == "NEEDS_REVIEW"]
        exception_items = [item for item in rec_items if item.status in EXCEPTION_STATUSES and item.exception_code != "POSTED_UNVERIFIED"]
        event_key = _posting_event_key(posting)
        purpose = _normalize(getattr(posting, "purpose", ""))
        status = "POSTED"
        settlement_linked = _has_settlement_link(source_model, source_id, source_reference)
        if matched_items:
            status = "RECONCILED"
        elif pending_items:
            status = "POSTED"
        if exception_items:
            status = "EXCEPTION"
        journal_fy = getattr(journal, "financial_year", None)
        journal_period = getattr(journal, "accounting_period", None)
        postability = evaluate_accounting_postability(event_key=event_key, event_label=purpose or event_key, module=_posting_module(posting), source_model=source_model, bridge_row={"event_key": event_key, "status": "READY", "label": purpose or event_key}, period_readiness={"financial_year_ready": True, "accounting_period_ready": True, "journal_numbering_ready": True}, source_workflow_exists=True, posted=status == "POSTED", reconciled=status == "RECONCILED")
        row = {
            "row_type": "posted_source",
            "event_key": event_key,
            "label": purpose or event_key,
            "module": _posting_module(posting),
            "event_group": "Posted Bridge",
            "source_model": source_model,
            "source_type": _normalize(getattr(posting, "source_type", "")) or source_model,
            "source_id": source_id,
            "source_reference": source_reference,
            "status": postability["status"] if status != "EXCEPTION" else "EXCEPTION",
            "mapping_status": "READY",
            "posting_mode": "POSTED",
            "can_preview": False,
            "can_post": False,
            "can_reconcile": postability["can_reconcile"],
            "supported": True,
            "financial_year": _financial_year_payload(journal_fy),
            "accounting_period": _period_payload(journal_period),
            "period_status": getattr(journal_period, "status", None),
            "journal_entry": {"id": getattr(journal, "id", None), "entry_no": getattr(journal, "entry_no", None), "entry_date": getattr(journal, "entry_date", None).isoformat() if getattr(journal, "entry_date", None) else None, "status": getattr(journal, "status", None), "financial_year": getattr(journal, "financial_year_id", None), "financial_year_code": getattr(journal_fy, "code", None), "accounting_period": getattr(journal, "accounting_period_id", None), "accounting_period_code": getattr(journal_period, "code", None), "accounting_period_name": getattr(journal_period, "name", None) or getattr(journal_period, "label", None), "accounting_period_status": getattr(journal_period, "status", None)} if journal else None,
            "settlement_linked": settlement_linked,
            "reconciliation_linked": bool(rec_items),
            "reconciliation_items": [{"id": item.id, "status": item.status, "severity": item.severity, "exception_code": item.exception_code, "exception_message": item.exception_message} for item in rec_items],
            "existing_reconciliation_item_id": pending_items[0].id if pending_items else (rec_items[0].id if rec_items else None),
            "posted_unverified": bool(pending_items),
            "exception_reasons": [item.exception_message or item.exception_code or item.status for item in exception_items],
            "operator_action": "Verify the posted bridge item after checks pass." if pending_items else "Review posted journal, settlement, and reconciliation coverage. This cockpit is read-only.",
            "blocker_code": "RECONCILIATION_EXCEPTION" if exception_items else None,
            "blocker_label": "Reconciliation exception" if exception_items else None,
            "blocker_count": len(exception_items),
            "blocker_reason": "; ".join([item.exception_message or item.exception_code or item.status for item in exception_items]),
            "recommended_action": "Open reconciliation runs and resolve exceptions." if exception_items else ("Verify from bridge reconciliation after operator review." if pending_items else postability["recommended_action"]),
            "action_href": "/admin/reconciliation/runs" if exception_items else "/admin/accounting/bridge-reconciliation",
            "setup_href": SETUP_HREF,
            "preview_action_href": None,
            "post_action_href": None,
            "source_action_href": None,
            "is_acknowledgeable": False,
            "is_postable": False,
            "financial_year_id": getattr(journal_fy, "id", None),
            "accounting_period_id": getattr(journal_period, "id", None),
        }
        if _row_passes_filters(row, filters):
            rows.append(row)
    return rows


def _document_counts(filters: BridgeReconciliationFilters, financial_year: FinancialYear | None, period: AccountingPeriod | None) -> dict[str, int]:
    start, end = _range_from_selection(filters=filters, financial_year=financial_year, period=period)
    invoice_qs = BillingInvoice.objects.all()
    receipt_qs = ReceiptDocument.objects.all()
    journal_qs = JournalEntry.objects.all()
    movement_qs = MoneyMovement.objects.all()
    if financial_year is not None:
        invoice_qs = invoice_qs.filter(invoice_date__gte=financial_year.start_date, invoice_date__lte=financial_year.end_date)
        receipt_qs = receipt_qs.filter(receipt_date__gte=financial_year.start_date, receipt_date__lte=financial_year.end_date)
        journal_qs = journal_qs.filter(Q(financial_year=financial_year) | Q(entry_date__gte=financial_year.start_date, entry_date__lte=financial_year.end_date))
        movement_qs = movement_qs.filter(movement_date__gte=financial_year.start_date, movement_date__lte=financial_year.end_date)
    if period is not None:
        invoice_qs = invoice_qs.filter(invoice_date__gte=period.start_date, invoice_date__lte=period.end_date)
        receipt_qs = receipt_qs.filter(receipt_date__gte=period.start_date, receipt_date__lte=period.end_date)
        journal_qs = journal_qs.filter(Q(accounting_period=period) | Q(entry_date__gte=period.start_date, entry_date__lte=period.end_date))
        movement_qs = movement_qs.filter(movement_date__gte=period.start_date, movement_date__lte=period.end_date)
    if start:
        invoice_qs = invoice_qs.filter(invoice_date__gte=start)
        receipt_qs = receipt_qs.filter(receipt_date__gte=start)
        journal_qs = journal_qs.filter(entry_date__gte=start)
        movement_qs = movement_qs.filter(movement_date__gte=start)
    if end:
        invoice_qs = invoice_qs.filter(invoice_date__lte=end)
        receipt_qs = receipt_qs.filter(receipt_date__lte=end)
        journal_qs = journal_qs.filter(entry_date__lte=end)
        movement_qs = movement_qs.filter(movement_date__lte=end)
    movement_ids = list(movement_qs.filter(status="POSTED").values_list("id", flat=True)[:5000])
    linked_movement_ids = set(SettlementAllocation.objects.filter(money_movement_id__in=movement_ids).exclude(money_movement_id__isnull=True).values_list("money_movement_id", flat=True).distinct())
    return {"total_invoices": invoice_qs.count(), "total_receipts": receipt_qs.count(), "total_journal_postings": journal_qs.count(), "total_money_movements": movement_qs.count(), "unreconciled_money_movement_count": len([item for item in movement_ids if item not in linked_movement_ids])}


def _readiness_blockers(*, financial_year: FinancialYear | None, period: AccountingPeriod | None, resolver_blockers: list[str], rows: list[dict[str, Any]], counts: dict[str, int]) -> list[str]:
    blockers = list(dict.fromkeys(resolver_blockers))
    if financial_year is None and "No active financial year is configured." not in blockers:
        blockers.append("No active financial year is configured.")
    if period is None and not any("accounting period" in item.lower() for item in blockers):
        blockers.append("No accounting period is selected.")
    if period is not None and period.status == AccountingPeriodStatus.LOCKED:
        blockers.append("Selected accounting period is locked.")
    if period is not None and period.status == AccountingPeriodStatus.CLOSED:
        blockers.append("Selected accounting period is closed.")
    if any(str(row.get("status", "")).startswith("BLOCKED") for row in rows):
        blockers.append("Bridge postings are blocked by mapping, period, numbering, or approval readiness.")
    if any(row.get("status") == "READY_UNPOSTED" for row in rows):
        blockers.append("Unposted bridge items exist for the selected context.")
    if counts.get("unreconciled_money_movement_count", 0) > 0:
        blockers.append("Unreconciled money movements exist for the selected context.")
    return list(dict.fromkeys(blockers))


def _event_counts(rows: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    counts: dict[str, Counter] = {}
    for row in rows:
        key = row.get("event_key") or "unknown"
        counts.setdefault(key, Counter())
        counts[key][row.get("status") or "INFO"] += 1
    return {key: dict(value) for key, value in counts.items()}


def _blocking_groups(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        status = str(row.get("status", ""))
        if not status.startswith("BLOCKED") and status != "UNSUPPORTED_SOURCE":
            continue
        key = (row.get("event_key") or "unknown", row.get("blocker_code") or status)
        if key not in grouped:
            grouped[key] = {"event_key": key[0], "blocker_code": key[1], "blocker_label": row.get("blocker_label"), "count": 0, "recommended_action": row.get("recommended_action"), "action_href": row.get("action_href"), "is_acknowledgeable": row.get("is_acknowledgeable", False), "is_postable": row.get("is_postable", False)}
        grouped[key]["count"] += 1
    return list(grouped.values())


def _phase_f_action_links(*, source_model: str, event_key: str | None = None) -> list[dict[str, Any]]:
    links = []
    for key, label, href in PHASE_F_ACTION_LINKS:
        target = href
        if key == "bridge_posting":
            params = {"source_model": source_model}
            if event_key:
                params["event_key"] = event_key
            from urllib.parse import urlencode
            target = f"{href}?{urlencode(params)}"
        links.append({"key": key, "label": label, "href": target})
    return links


def _phase_f_row_matches(row: dict[str, Any], spec: dict[str, Any]) -> bool:
    if row.get("source_model") != spec["source_model"]:
        return False
    event_keys = set(spec.get("event_keys") or ())
    return not event_keys or row.get("event_key") in event_keys


def _phase_f_counts(rows: list[dict[str, Any]], spec: dict[str, Any]) -> dict[str, int]:
    matched = [row for row in rows if _phase_f_row_matches(row, spec)]
    return {
        "ready_unposted": sum(1 for row in matched if row.get("status") == "READY_UNPOSTED"),
        "posted_unverified": sum(1 for row in matched if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED"),
        "reconciled": sum(1 for row in matched if row.get("status") == "RECONCILED" or row.get("reconciliation_state") == "RECONCILED"),
        "blocked": sum(1 for row in matched if str(row.get("status") or "").startswith("BLOCKED")),
        "unsupported": sum(1 for row in matched if row.get("status") == "UNSUPPORTED_SOURCE"),
        "skipped_deferred": sum(1 for row in matched if row.get("status") in {"SKIPPED_NOT_APPLICABLE", "DEFERRED"}),
        "exception": sum(1 for row in matched if row.get("status") == "EXCEPTION" or bool(row.get("exception_reasons"))),
    }


def _phase_f_primary_blocker(rows: list[dict[str, Any]], spec: dict[str, Any]) -> str | None:
    matched = [row for row in rows if _phase_f_row_matches(row, spec)]
    for status, blocker_type in (
        ("BLOCKED_BY_MAPPING", "mapping"),
        ("BLOCKED_BY_FINANCE_ACCOUNT", "finance account"),
        ("BLOCKED_BY_NUMBERING", "numbering"),
        ("BLOCKED_BY_PERIOD", "period"),
        ("UNSUPPORTED_SOURCE", "unsupported source"),
        ("EXCEPTION", "duplicate source/event"),
    ):
        if any(row.get("status") == status for row in matched):
            return blocker_type
    for row in matched:
        code = str(row.get("blocker_code") or "").upper()
        if "UNBALANCED" in code:
            return "unbalanced journal"
        if "DUPLICATE" in code:
            return "duplicate source/event"
        if "NUMBER" in code:
            return "numbering"
        if "PERIOD" in code:
            return "period"
        if "FINANCE" in code:
            return "finance account"
        if "MAPPING" in code or "COA" in code:
            return "mapping"
    if spec.get("default_status") == "UNSUPPORTED":
        return "unsupported source"
    return None


def _phase_f_status(counts: dict[str, int], spec: dict[str, Any]) -> str:
    if spec.get("default_status") == "UNSUPPORTED":
        return "UNSUPPORTED"
    if counts["exception"] or counts["blocked"]:
        return "BLOCKED"
    if counts["posted_unverified"]:
        return "POSTED_UNVERIFIED"
    if counts["ready_unposted"]:
        return "READY"
    if counts["reconciled"]:
        return "RECONCILED"
    if counts["unsupported"]:
        return "UNSUPPORTED"
    if spec.get("default_status") == "DEFERRED":
        return "DEFERRED"
    return "READY"


def _phase_f_inventory(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    inventory = []
    for spec in PHASE_F_SOURCE_SPECS:
        counts = _phase_f_counts(rows, spec)
        event_keys = list(spec.get("event_keys") or ())
        primary_event = event_keys[0] if event_keys else None
        inventory.append(
            {
                "phase": spec["phase"],
                "domain": spec["domain"],
                "source_model": spec["source_model"],
                "event_keys": event_keys,
                "event_key": primary_event,
                "accounting_shape": spec["accounting_shape"],
                "source_owner": spec["source_owner"],
                "status": _phase_f_status(counts, spec),
                "counts": counts,
                "primary_blocker_type": _phase_f_primary_blocker(rows, spec),
                "can_post": False,
                "action_links": _phase_f_action_links(source_model=spec["source_model"], event_key=primary_event),
            }
        )
    return inventory


def _phase_f_group_counts(inventory: list[dict[str, Any]], key: str) -> dict[str, dict[str, int]]:
    grouped: dict[str, Counter] = {}
    for item in inventory:
        group = item[key]
        grouped.setdefault(group, Counter())
        counts = item.get("counts") or {}
        for count_key, value in counts.items():
            grouped[group][count_key] += int(value or 0)
    return {group: dict(counts) for group, counts in grouped.items()}


def _phase_f_readiness_contract(rows: list[dict[str, Any]], inventory: list[dict[str, Any]], period_readiness: dict[str, Any], readiness_blockers: list[str]) -> dict[str, Any]:
    concrete_rows = [row for row in rows if row.get("row_type") in {"bridge_candidate", "posted_source"}]
    ready_unposted = sum(1 for row in concrete_rows if row.get("status") == "READY_UNPOSTED")
    posted_unverified = sum(1 for row in concrete_rows if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED")
    unsupported = sum(1 for row in concrete_rows if row.get("status") in {"UNSUPPORTED_SOURCE", "SKIPPED_NOT_APPLICABLE"})
    blockers = sum(1 for row in concrete_rows if str(row.get("status") or "").startswith("BLOCKED"))
    exceptions = sum(1 for row in concrete_rows if row.get("status") == "EXCEPTION" or bool(row.get("exception_reasons")))
    setup_ready = bool(period_readiness.get("posting_controls_ready")) and not readiness_blockers
    states: list[str] = []
    if exceptions:
        states.append("RECONCILIATION_EXCEPTIONS")
    if blockers or any(not bool(period_readiness.get(flag)) for flag in ("financial_year_ready", "accounting_period_ready", "journal_numbering_ready")):
        states.append("ACTION_REQUIRED")
    if posted_unverified:
        states.append("POSTED_UNVERIFIED_EXISTS")
    if ready_unposted and setup_ready:
        states.append("READY_FOR_CONTROLLED_POSTING")
    if not concrete_rows:
        states.append("NO_CANDIDATES")
    if concrete_rows and unsupported == len(concrete_rows):
        states.append("UNSUPPORTED_ONLY")
    primary_state = states[0] if states else "NO_CANDIDATES"
    return {
        "state": primary_state,
        "states": states,
        "ready_for_controlled_posting": "READY_FOR_CONTROLLED_POSTING" in states,
        "read_only": True,
        "creates_journal_entry": False,
        "creates_accounting_bridge_posting": False,
        "auto_posts": False,
        "auto_reconciles": False,
        "auto_closes_period": False,
        "mutates_sources": False,
        "counts": {
            "ready_unposted": ready_unposted,
            "posted_unverified": posted_unverified,
            "blocked": blockers,
            "unsupported": unsupported,
            "exceptions": exceptions,
        },
        "blockers": readiness_blockers,
        "posting_controls_ready": bool(period_readiness.get("posting_controls_ready")),
    }


def _phase_f_control_tower(rows: list[dict[str, Any]], period_readiness: dict[str, Any], readiness_blockers: list[str]) -> dict[str, Any]:
    inventory = _phase_f_inventory(rows)
    return {
        "source_inventory": inventory,
        "groups": _phase_f_group_counts(inventory, "domain"),
        "phase_counts": _phase_f_group_counts(inventory, "phase"),
        "readiness": _phase_f_readiness_contract(rows, inventory, period_readiness, readiness_blockers),
        "guardrails": {
            "read_only": True,
            "no_new_source_model": True,
            "no_new_posting_source": True,
            "no_source_mutation": True,
            "no_auto_post": True,
            "no_auto_reconcile": True,
            "no_auto_close": True,
            "admin_only_posting": True,
        },
    }


def _f25_action_link(key: str, *, source_model: str | None = None, event_key: str | None = None) -> dict[str, Any]:
    for link_key, label, href in PHASE_F_ACTION_LINKS:
        if link_key != key:
            continue
        target = href
        if key == "bridge_posting":
            from urllib.parse import urlencode

            params = {}
            if source_model and source_model not in {"PhaseFControlTower", "WinnerHistory"}:
                params["source_model"] = source_model
            if event_key and event_key not in {"ADVANCE_ALLOCATION", "future_emi_waiver"}:
                params["event_key"] = event_key
            query = urlencode(params)
            target = f"{href}?{query}" if query else href
        return {"key": link_key, "label": label, "href": target}
    if key == "lucky_draw":
        return {"key": "lucky_draw", "label": "Lucky Draw", "href": "/admin/lucky-draws"}
    return {"key": "bridge_posting", "label": "Bridge Posting", "href": "/admin/accounting/bridge-reconciliation"}


def _f25_matching_rows(rows: list[dict[str, Any]], workflow: dict[str, Any]) -> list[dict[str, Any]]:
    source_model = workflow["source_model"]
    event_key = workflow["event_key"]
    if source_model == "PhaseFControlTower":
        if event_key == "mapping_blockers":
            return [row for row in rows if row.get("status") == "BLOCKED_BY_MAPPING"]
        if event_key == "finance_account_blockers":
            return [row for row in rows if row.get("status") == "BLOCKED_BY_FINANCE_ACCOUNT"]
        if event_key == "numbering_blockers":
            return [row for row in rows if row.get("status") == "BLOCKED_BY_NUMBERING"]
        if event_key == "period_blockers":
            return [row for row in rows if row.get("status") == "BLOCKED_BY_PERIOD"]
        if event_key == "posted_unverified_review":
            return [row for row in rows if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED"]
        return rows
    if event_key == "ADVANCE_ALLOCATION":
        return [row for row in rows if row.get("source_model") == "Payment" and row.get("event_key") == "ADVANCE_ALLOCATION"]
    return [row for row in rows if row.get("source_model") == source_model and row.get("event_key") == event_key]


def _f25_status(workflow: dict[str, Any], matched_rows: list[dict[str, Any]]) -> str:
    if workflow["event_key"] == "ADVANCE_ALLOCATION":
        return "EXCLUDED" if not matched_rows else "BOUNDARY_VIOLATION"
    if workflow["source_model"] == "WinnerHistory":
        return "VALIDATION_ONLY"
    if workflow["source_model"] == "StaffAdvance":
        return "UNSUPPORTED"
    if not matched_rows:
        return workflow["expected_candidate_status"]
    statuses = {str(row.get("status") or "") for row in matched_rows}
    if "RECONCILED" in statuses and not any(row.get("posted_unverified") for row in matched_rows):
        return "RECONCILED"
    if any(row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED" for row in matched_rows):
        return "POSTED_UNVERIFIED"
    if any(status.startswith("BLOCKED") for status in statuses):
        return sorted(status for status in statuses if status.startswith("BLOCKED"))[0]
    if "READY_UNPOSTED" in statuses:
        return "READY_UNPOSTED"
    if "UNSUPPORTED_SOURCE" in statuses:
        return "UNSUPPORTED"
    return sorted(statuses)[0] if statuses else workflow["expected_candidate_status"]


def _production_accounting_validation(rows: list[dict[str, Any]], phase_f_control_tower: dict[str, Any]) -> dict[str, Any]:
    workflows = []
    for workflow in F25_VALIDATION_WORKFLOWS:
        matched_rows = _f25_matching_rows(rows, workflow)
        status = _f25_status(workflow, matched_rows)
        reconciled_count = sum(1 for row in matched_rows if row.get("status") == "RECONCILED" or row.get("reconciliation_state") == "RECONCILED")
        posted_unverified_count = sum(1 for row in matched_rows if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED")
        action_link = _f25_action_link(workflow["expected_action_link"], source_model=workflow["source_model"], event_key=workflow["event_key"])
        workflows.append(
            {
                **workflow,
                "status": status,
                "current_row_count": len(matched_rows),
                "posted_unverified_count": posted_unverified_count,
                "reconciled_count": reconciled_count,
                "expected_action": action_link,
                "expected_no_mutation_rule": "Validation must not create JournalEntry, AccountingBridgePosting, ReconciliationItem, or mutate source records.",
                "can_post": False,
                "read_only": True,
            }
        )
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in workflows:
        grouped.setdefault(row["domain"], []).append(row)
    return {
        "title": "Production Accounting Validation",
        "safety_copy": F25_SAFETY_COPY,
        "read_only": True,
        "creates_journal_entry": False,
        "creates_accounting_bridge_posting": False,
        "auto_posts": False,
        "auto_reconciles": False,
        "auto_closes_period": False,
        "mutates_sources": False,
        "workflow_count": len(workflows),
        "groups": grouped,
        "workflows": workflows,
        "control_tower_readiness": phase_f_control_tower["readiness"],
        "source_event_separation_checks": {
            "advance_allocation_payment_excluded_from_f1": not any(row["source_model"] == "Payment" and row["event_key"] == "ADVANCE_ALLOCATION" for row in workflows if row["status"] != "EXCLUDED"),
            "customer_advance_f2_f20_f21_f23_separated": all(
                any(row["source_model"] == source_model and row["event_key"] == event_key for row in workflows)
                for source_model, event_key in (
                    ("ReceiptDocument", "customer_advance"),
                    ("CustomerAdvance", "customer_advance_receipt"),
                    ("CustomerAdvanceAllocation", "customer_advance_application"),
                    ("CustomerAdvanceRefund", "customer_advance_refund"),
                )
            ),
            "security_deposit_f17_f18_separated": all(
                any(row["source_model"] == "RentLeaseDepositTransaction" and row["event_key"] == event_key for row in workflows)
                for event_key in ("security_deposit_receipt", "security_deposit_refund")
            ),
            "rent_lease_revenue_and_collection_separated": all(
                any(row["source_model"] == source_model and row["event_key"] == event_key for row in workflows)
                for source_model, event_key in (
                    ("RentLeaseBillingDemand", "rent_monthly_revenue"),
                    ("RentLeaseCollection", "rent_lease_collection_settlement"),
                )
            ),
            "staff_advance_unsupported": any(row["source_model"] == "StaffAdvance" and row["status"] == "UNSUPPORTED" for row in workflows),
        },
    }


def build_accounting_bridge_reconciliation(filters: BridgeReconciliationFilters | None = None) -> dict[str, Any]:
    active_filters = filters or BridgeReconciliationFilters()
    selected_financial_year, fy_blockers = _resolve_financial_year(active_filters)
    selected_period, period_blockers = _resolve_period(active_filters, selected_financial_year)
    resolver_blockers = [*fy_blockers, *period_blockers]
    selected_period_readiness = build_accounting_bridge_posting_period_readiness(
        reference_date=selected_period.start_date if selected_period is not None else None,
        financial_year=selected_financial_year,
        period=selected_period,
    )
    if active_filters.accounting_period and selected_period is None:
        selected_period_readiness = {
            **selected_period_readiness,
            "accounting_period_ready": False,
            "posting_controls_ready": False,
            "period_blocker_code": "MISSING_PERIOD",
            "period_blocker_reason": period_blockers[0] if period_blockers else "Selected accounting period is missing.",
            "period_blockers": [{"code": "MISSING_PERIOD", "reason": period_blockers[0] if period_blockers else "Selected accounting period is missing."}],
            "blockers": list(dict.fromkeys([*(selected_period_readiness.get("blockers") or []), *(period_blockers or ["Selected accounting period is missing."])])),
        }
    readiness_payload = canonicalize_bridge_readiness_payload(
        {
            **build_accounting_bridge_readiness_with_returns_damage_credit(),
            "financial_year_readiness": selected_period_readiness,
            "accounting_period_readiness": selected_period_readiness,
        },
        as_source_rows=True,
    )
    candidate_rows = list_bridge_candidates(
        BridgeCandidateFilters(
            date_from=active_filters.date_from,
            date_to=active_filters.date_to,
            financial_year=active_filters.financial_year,
            accounting_period=active_filters.accounting_period,
            status=active_filters.status,
            source_model=active_filters.source_model,
            event_key=active_filters.event_key,
            module=active_filters.module,
        )
    )
    rows = [
        *_readiness_rows(readiness_payload, active_filters, financial_year=selected_financial_year, period=selected_period),
        *candidate_rows,
        *_posted_rows(active_filters, selected_financial_year, selected_period),
    ]
    counts = _document_counts(active_filters, selected_financial_year, selected_period)
    status_counts = Counter(str(row.get("status") or "INFO") for row in rows)
    exception_count = sum(1 for row in rows if row["status"] == "EXCEPTION" or row["exception_reasons"])
    locked_period_count = AccountingPeriod.objects.filter(financial_year=selected_financial_year, status=AccountingPeriodStatus.LOCKED).count() if selected_financial_year else 0
    closed_period_count = AccountingPeriod.objects.filter(financial_year=selected_financial_year, status=AccountingPeriodStatus.CLOSED).count() if selected_financial_year else 0
    readiness_blockers = _readiness_blockers(financial_year=selected_financial_year, period=selected_period, resolver_blockers=resolver_blockers, rows=rows, counts=counts)
    canonical_summary = {f"{status.lower()}_count": status_counts.get(status, 0) for status in CANONICAL_STATUSES}
    candidate_summary = summarize_candidate_statuses(candidate_rows)
    summary = {
        "source_count": len(rows),
        "ready_count": status_counts.get("READY", 0),
        "postable_count": status_counts.get("POSTABLE", 0),
        "ready_unposted_count": status_counts.get("READY_UNPOSTED", 0),
        "blocked_count": sum(count for status, count in status_counts.items() if status.startswith("BLOCKED") or status == "UNSUPPORTED_SOURCE"),
        "posted_count": status_counts.get("POSTED", 0),
        "settled_count": 0,
        "reconciled_count": status_counts.get("RECONCILED", 0),
        "exception_count": exception_count,
        "unsupported_count": status_counts.get("UNSUPPORTED_SOURCE", 0),
        "blocked_by_mapping_count": status_counts.get("BLOCKED_BY_MAPPING", 0),
        "blocked_by_period_count": status_counts.get("BLOCKED_BY_PERIOD", 0),
        "blocked_by_numbering_count": status_counts.get("BLOCKED_BY_NUMBERING", 0),
        "blocked_by_approval_count": status_counts.get("BLOCKED_BY_APPROVAL", 0),
        "total_invoices": counts["total_invoices"],
        "total_receipts": counts["total_receipts"],
        "total_journal_postings": counts["total_journal_postings"],
        "total_money_movements": counts["total_money_movements"],
        "unposted_bridge_item_count": status_counts.get("READY_UNPOSTED", 0),
        "posted_unreconciled_count": sum(1 for row in rows if row.get("status") == "POSTED" and (row.get("posted_unverified") or row.get("reconciliation_linked"))),
        "posted_unverified_count": sum(1 for row in rows if row.get("posted_unverified")),
        "unreconciled_money_movement_count": counts["unreconciled_money_movement_count"],
        "reconciliation_exception_count": exception_count,
        "blocked_bridge_item_count": sum(count for status, count in status_counts.items() if status.startswith("BLOCKED") or status == "UNSUPPORTED_SOURCE"),
        "ready_unposted_by_event": {key: value.get("READY_UNPOSTED", 0) for key, value in _event_counts(rows).items() if value.get("READY_UNPOSTED", 0)},
        "blocked_by_mapping_by_event": {key: value.get("BLOCKED_BY_MAPPING", 0) for key, value in _event_counts(rows).items() if value.get("BLOCKED_BY_MAPPING", 0)},
        "status_counts_by_event": _event_counts(rows),
        "blocking_groups": _blocking_groups(rows),
        "locked_period_count": locked_period_count,
        "closed_period_count": closed_period_count,
        **candidate_summary,
        **canonical_summary,
    }
    phase_f_control_tower = _phase_f_control_tower(rows, selected_period_readiness, readiness_blockers)
    production_validation = _production_accounting_validation(rows, phase_f_control_tower)
    return {
        "summary": summary,
        "selected_financial_year": _financial_year_payload(selected_financial_year),
        "selected_accounting_period": _period_payload(selected_period),
        "period_status": getattr(selected_period, "status", None),
        "available_financial_years": [_financial_year_payload(row) for row in FinancialYear.objects.order_by("-start_date", "-id")],
        "available_accounting_periods": _available_periods(selected_financial_year),
        "readiness_blockers": readiness_blockers,
        "year_end_readiness_hint": "Year-end close is blocked until open periods, unposted bridge items, and reconciliation exceptions are resolved.",
        "financial_year_readiness": selected_period_readiness,
        "accounting_period_readiness": selected_period_readiness,
        "canonical_statuses": list(CANONICAL_STATUSES),
        "phase_f_control_tower": phase_f_control_tower,
        "production_accounting_validation": production_validation,
        "results": rows,
    }
