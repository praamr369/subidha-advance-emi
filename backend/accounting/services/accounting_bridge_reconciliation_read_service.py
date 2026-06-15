from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

from django.utils import timezone

from accounting.models import AccountingPeriod, AccountingPeriodStatus, FinancialYear
from accounting.services.accounting_bridge_candidate_service import (
    BridgeCandidateFilters,
    summarize_candidate_statuses,
)
from accounting.services.accounting_bridge_customer_advance_refund_service import list_bridge_candidates
from accounting.services.accounting_bridge_readiness_service import build_accounting_bridge_posting_period_readiness
from accounting.services.accounting_postability_service import CANONICAL_STATUSES, evaluate_accounting_postability, staff_advance_unsupported_event
from accounting.services.returns_damage_credit_bridge_readiness_service import build_accounting_bridge_readiness_with_returns_damage_credit

SETUP_HREF = "/admin/accounting/setup/mapping-audit"
FINANCE_ACCOUNT_HREF = "/admin/settings/business-setup/finance-accounts"
BRIDGE_HREF = "/admin/accounting/bridge-reconciliation"
PERIODS_HREF = "/admin/accounting/periods"
DOCUMENT_NUMBERING_HREF = "/admin/settings/business-setup/document-numbering"
RECONCILIATION_HREF = "/admin/reconciliation/runs"

PHASE_F_ACTION_LINKS = (
    ("bridge_posting", "Bridge Posting", BRIDGE_HREF),
    ("mapping_audit", "Mapping Audit", SETUP_HREF),
    ("finance_accounts", "Finance Accounts", FINANCE_ACCOUNT_HREF),
    ("accounting_periods", "Accounting Periods", PERIODS_HREF),
    ("journal_numbering", "Journal Numbering", DOCUMENT_NUMBERING_HREF),
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


def _int_or_none(value: Any) -> int | None:
    text = _normalize(value)
    return int(text) if text.isdigit() else None


def _row_status(row: dict[str, Any]) -> str:
    return str(row.get("status") or "").upper()


def _row_type(row: dict[str, Any]) -> str:
    return str(row.get("row_type") or "").lower()


def _is_bridge_candidate(row: dict[str, Any]) -> bool:
    return _row_type(row) == "bridge_candidate"


def _is_readiness_only(row: dict[str, Any]) -> bool:
    return _row_type(row) in {"readiness", "readiness_event", "setup_readiness"}


def _is_validation_only(row: dict[str, Any]) -> bool:
    return _row_type(row) in {"validation", "validation_event", "operational_validation"}


def _financial_year_payload(financial_year: FinancialYear | None) -> dict[str, Any] | None:
    if financial_year is None:
        return None
    return {
        "id": financial_year.id,
        "code": financial_year.code,
        "name": financial_year.name,
        "start_date": financial_year.start_date.isoformat(),
        "end_date": financial_year.end_date.isoformat(),
        "is_active": financial_year.is_active,
    }


def _period_payload(period: AccountingPeriod | None) -> dict[str, Any] | None:
    if period is None:
        return None
    return {
        "id": period.id,
        "code": period.code,
        "name": period.name or period.label,
        "start_date": period.start_date.isoformat(),
        "end_date": period.end_date.isoformat(),
        "status": period.status,
        "is_locked": period.is_locked,
        "financial_year": period.financial_year_id,
        "financial_year_code": getattr(period.financial_year, "code", None),
    }


def _resolve_financial_year(filters: BridgeReconciliationFilters) -> tuple[FinancialYear | None, list[str]]:
    requested = _normalize(filters.financial_year)
    queryset = FinancialYear.objects.all().order_by("-start_date", "-id")
    if requested:
        numeric_id = _int_or_none(requested)
        financial_year = queryset.filter(pk=numeric_id).first() if numeric_id is not None else queryset.filter(code__iexact=requested).first()
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
        period = queryset.filter(pk=numeric_id).first() if numeric_id is not None else queryset.filter(code__iexact=requested).first()
        return period, [] if period else ["Selected accounting period is missing."]
    today = timezone.localdate()
    period = queryset.filter(start_date__lte=today, end_date__gte=today).first()
    if period is None:
        period = queryset.filter(status=AccountingPeriodStatus.OPEN).first() or queryset.first()
    return period, []


def _available_periods(financial_year: FinancialYear | None) -> list[dict[str, Any]]:
    queryset = AccountingPeriod.objects.select_related("financial_year").order_by("start_date", "id")
    if financial_year is not None:
        queryset = queryset.filter(financial_year=financial_year)
    return [_period_payload(period) or {} for period in queryset]


def _action_link(key: str, label: str, href: str | None, *, disabled: bool = False) -> dict[str, Any]:
    return {"key": key, "label": label, "href": href, "disabled": disabled}


def _bridge_href(*, source_model: str | None = None, event_key: str | None = None, status: str | None = None) -> str:
    params = {}
    if source_model:
        params["source_model"] = source_model
    if event_key:
        params["event_key"] = event_key
    if status:
        params["status"] = status
    query = urlencode(params)
    return f"{BRIDGE_HREF}?{query}" if query else BRIDGE_HREF


def _row_action_links(row: dict[str, Any]) -> list[dict[str, Any]]:
    status = _row_status(row)
    source_model = row.get("source_model") or ""
    event_key = row.get("event_key") or ""
    if status == "BLOCKED_BY_MAPPING":
        return [_action_link("mapping_audit", "Mapping Audit", SETUP_HREF)]
    if status == "BLOCKED_BY_FINANCE_ACCOUNT":
        return [_action_link("finance_accounts", "Finance Accounts", FINANCE_ACCOUNT_HREF)]
    if status == "BLOCKED_BY_NUMBERING":
        return [_action_link("journal_numbering", "Journal Numbering", DOCUMENT_NUMBERING_HREF)]
    if status == "BLOCKED_BY_PERIOD":
        return [_action_link("accounting_periods", "Accounting Periods", PERIODS_HREF)]
    if status == "BLOCKED_BY_APPROVAL":
        return [_action_link("bridge_posting", "Bridge Posting", _bridge_href(source_model=source_model, event_key=event_key))]
    if status in {"EXCEPTION", "POSTED_UNVERIFIED"} or row.get("posted_unverified"):
        return [_action_link("reconciliation", "Reconciliation", RECONCILIATION_HREF)]
    if status == "READY_UNPOSTED" and _is_bridge_candidate(row):
        return [_action_link("bridge_posting", "Bridge Posting", _bridge_href(source_model=source_model, event_key=event_key))]
    if status in {"UNSUPPORTED", "UNSUPPORTED_SOURCE"} or source_model == "StaffAdvance":
        return [_action_link("unsupported_boundary", "Unsupported source", None, disabled=True)]
    if status in {"DEFERRED", "SKIPPED_NOT_APPLICABLE"} or _row_type(row) == "source_contract":
        return [_action_link("deferred_source_contract", "Deferred source contract", None, disabled=True)]
    return []


def annotate_phase_f_row_actions(row: dict[str, Any]) -> dict[str, Any]:
    payload = dict(row)
    status = _row_status(payload)
    row_type = _row_type(payload)
    links = payload.get("action_links") or _row_action_links(payload)
    payload["action_links"] = links
    primary = next((link for link in links if not link.get("disabled")), links[0] if links else None)
    if primary:
        payload["action_href"] = primary.get("href")
        payload["setup_href"] = primary.get("href")
    if row_type in {"readiness", "readiness_event", "setup_readiness", "validation", "validation_event", "operational_validation"}:
        payload["can_post"] = False
        payload["can_preview"] = False
    if status in {"UNSUPPORTED", "UNSUPPORTED_SOURCE", "DEFERRED", "SKIPPED_NOT_APPLICABLE"} or row_type == "source_contract":
        payload["can_post"] = False
        payload["can_preview"] = False
    return payload


def _phase_f_row_matches(row: dict[str, Any], spec: dict[str, Any]) -> bool:
    if row.get("source_model") != spec["source_model"]:
        return False
    event_keys = set(spec.get("event_keys") or ())
    return not event_keys or row.get("event_key") in event_keys


def _phase_f_counts(rows: list[dict[str, Any]], spec: dict[str, Any]) -> dict[str, int]:
    matched = [row for row in rows if _phase_f_row_matches(row, spec)]
    return {
        "ready_unposted": sum(1 for row in matched if _row_status(row) == "READY_UNPOSTED"),
        "posted_unverified": sum(1 for row in matched if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED" or _row_status(row) == "POSTED_UNVERIFIED"),
        "reconciled": sum(1 for row in matched if _row_status(row) == "RECONCILED" or row.get("reconciliation_state") == "RECONCILED"),
        "blocked": sum(1 for row in matched if _row_status(row).startswith("BLOCKED")),
        "unsupported": sum(1 for row in matched if _row_status(row) in {"UNSUPPORTED", "UNSUPPORTED_SOURCE"}),
        "skipped_deferred": sum(1 for row in matched if _row_status(row) in {"SKIPPED_NOT_APPLICABLE", "DEFERRED"}),
        "exception": sum(1 for row in matched if _row_status(row) == "EXCEPTION" or bool(row.get("exception_reasons"))),
    }


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


def _phase_f_primary_blocker(rows: list[dict[str, Any]], spec: dict[str, Any]) -> str | None:
    matched = [row for row in rows if _phase_f_row_matches(row, spec)]
    for status, blocker_type in (
        ("BLOCKED_BY_MAPPING", "mapping"),
        ("BLOCKED_BY_FINANCE_ACCOUNT", "finance account"),
        ("BLOCKED_BY_NUMBERING", "numbering"),
        ("BLOCKED_BY_PERIOD", "period"),
        ("UNSUPPORTED_SOURCE", "unsupported source"),
        ("UNSUPPORTED", "unsupported source"),
        ("EXCEPTION", "reconciliation exception"),
    ):
        if any(_row_status(row) == status for row in matched):
            return blocker_type
    if spec.get("default_status") == "UNSUPPORTED":
        return "unsupported source"
    return None


def _phase_f_action_links(*, source_model: str, event_key: str | None = None, rows: list[dict[str, Any]] | None = None, spec: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    rows = rows or []
    spec = spec or {"source_model": source_model, "event_keys": (event_key,) if event_key else ()}
    matched = [row for row in rows if _phase_f_row_matches(row, spec)]
    keys: list[str] = []
    for row in matched:
        for link in _row_action_links(row):
            key = link.get("key")
            if key and key not in keys:
                keys.append(key)
    if not keys:
        keys.append("bridge_posting")
    href_by_key = {key: (label, href) for key, label, href in PHASE_F_ACTION_LINKS}
    links = []
    for key in keys:
        label, href = href_by_key.get(key, (key.replace("_", " ").title(), BRIDGE_HREF))
        if key == "bridge_posting":
            href = _bridge_href(source_model=source_model, event_key=event_key)
        links.append(_action_link(key, label, href))
    return links


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
                "action_links": _phase_f_action_links(source_model=spec["source_model"], event_key=primary_event, rows=rows, spec=spec),
            }
        )
    return inventory


def _phase_f_group_counts(inventory: list[dict[str, Any]], key: str) -> dict[str, dict[str, int]]:
    grouped: dict[str, Counter] = {}
    for item in inventory:
        group = item[key]
        grouped.setdefault(group, Counter())
        for count_key, value in (item.get("counts") or {}).items():
            grouped[group][count_key] += int(value or 0)
    return {group: dict(counts) for group, counts in grouped.items()}


def _phase_f_readiness_contract(rows: list[dict[str, Any]], inventory: list[dict[str, Any]], period_readiness: dict[str, Any], readiness_blockers: list[str]) -> dict[str, Any]:
    concrete_rows = [row for row in rows if _is_bridge_candidate(row)]
    readiness_only = [row for row in rows if _is_readiness_only(row)]
    validation_only = [row for row in rows if _is_validation_only(row)]
    ready_unposted = sum(1 for row in concrete_rows if _row_status(row) == "READY_UNPOSTED")
    posted_unverified = sum(1 for row in concrete_rows if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED" or _row_status(row) == "POSTED_UNVERIFIED")
    unsupported = sum(1 for row in concrete_rows if _row_status(row) in {"UNSUPPORTED", "UNSUPPORTED_SOURCE"})
    deferred = sum(1 for row in concrete_rows if _row_status(row) in {"DEFERRED", "SKIPPED_NOT_APPLICABLE"})
    blockers = sum(1 for row in rows if _row_status(row).startswith("BLOCKED"))
    exceptions = sum(1 for row in rows if _row_status(row) == "EXCEPTION" or bool(row.get("exception_reasons")))
    states: list[str] = []
    if exceptions:
        states.append("RECONCILIATION_EXCEPTIONS")
    if blockers or readiness_blockers or any(not bool(period_readiness.get(flag, True)) for flag in ("financial_year_ready", "accounting_period_ready", "journal_numbering_ready")):
        states.append("ACTION_REQUIRED")
    if posted_unverified:
        states.append("POSTED_UNVERIFIED_EXISTS")
    if ready_unposted:
        states.append("READY_FOR_CONTROLLED_POSTING")
    if not concrete_rows and readiness_only:
        states.append("SETUP_READY_NO_SOURCE_ROWS")
    if not concrete_rows and validation_only:
        states.append("VALIDATION_ONLY")
    if concrete_rows and unsupported == len(concrete_rows):
        states.append("UNSUPPORTED_ONLY")
    if concrete_rows and deferred == len(concrete_rows):
        states.append("DEFERRED_ONLY")
    if not states:
        states.append("NO_CANDIDATES")
    return {
        "state": states[0],
        "primary_state": states[0],
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
            "deferred": deferred,
            "exceptions": exceptions,
            "readiness_only": len(readiness_only),
            "validation_only": len(validation_only),
        },
        "blockers": readiness_blockers,
        "posting_controls_ready": bool(period_readiness.get("posting_controls_ready", True)),
    }


def _phase_f_control_tower(rows: list[dict[str, Any]], period_readiness: dict[str, Any], readiness_blockers: list[str]) -> dict[str, Any]:
    annotated_rows = [annotate_phase_f_row_actions(row) for row in rows]
    inventory = _phase_f_inventory(annotated_rows)
    return {
        "source_inventory": inventory,
        "groups": _phase_f_group_counts(inventory, "domain"),
        "phase_counts": _phase_f_group_counts(inventory, "phase"),
        "readiness": _phase_f_readiness_contract(annotated_rows, inventory, period_readiness, readiness_blockers),
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
    if key == "lucky_draw":
        return _action_link("lucky_draw", "Lucky Draw", "/admin/lucky-draws")
    for link_key, label, href in PHASE_F_ACTION_LINKS:
        if link_key != key:
            continue
        if key == "bridge_posting" and source_model not in {None, "PhaseFControlTower", "WinnerHistory"}:
            href = _bridge_href(source_model=source_model, event_key=event_key if event_key not in {"ADVANCE_ALLOCATION", "future_emi_waiver"} else None)
        return _action_link(link_key, label, href)
    return _action_link("bridge_posting", "Bridge Posting", BRIDGE_HREF)


def _f25_matching_rows(rows: list[dict[str, Any]], workflow: dict[str, Any]) -> list[dict[str, Any]]:
    source_model = workflow["source_model"]
    event_key = workflow["event_key"]
    if source_model == "PhaseFControlTower":
        if event_key == "mapping_blockers":
            return [row for row in rows if _row_status(row) == "BLOCKED_BY_MAPPING"]
        if event_key == "finance_account_blockers":
            return [row for row in rows if _row_status(row) == "BLOCKED_BY_FINANCE_ACCOUNT"]
        if event_key == "numbering_blockers":
            return [row for row in rows if _row_status(row) == "BLOCKED_BY_NUMBERING"]
        if event_key == "period_blockers":
            return [row for row in rows if _row_status(row) == "BLOCKED_BY_PERIOD"]
        if event_key == "posted_unverified_review":
            return [row for row in rows if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED" or _row_status(row) == "POSTED_UNVERIFIED"]
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
    statuses = {_row_status(row) for row in matched_rows}
    if any(row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED" or _row_status(row) == "POSTED_UNVERIFIED" for row in matched_rows):
        return "POSTED_UNVERIFIED"
    if any(status.startswith("BLOCKED") for status in statuses):
        return sorted(status for status in statuses if status.startswith("BLOCKED"))[0]
    if "READY_UNPOSTED" in statuses:
        return "READY_UNPOSTED"
    if "RECONCILED" in statuses:
        return "RECONCILED"
    if "UNSUPPORTED_SOURCE" in statuses or "UNSUPPORTED" in statuses:
        return "UNSUPPORTED"
    return sorted(statuses)[0] if statuses else workflow["expected_candidate_status"]


def _production_accounting_validation(rows: list[dict[str, Any]], phase_f_control_tower: dict[str, Any]) -> dict[str, Any]:
    annotated_rows = [annotate_phase_f_row_actions(row) for row in rows]
    workflows = []
    for workflow in F25_VALIDATION_WORKFLOWS:
        matched_rows = _f25_matching_rows(annotated_rows, workflow)
        status = _f25_status(workflow, matched_rows)
        reconciled_count = sum(1 for row in matched_rows if _row_status(row) == "RECONCILED" or row.get("reconciliation_state") == "RECONCILED")
        posted_unverified_count = sum(1 for row in matched_rows if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED" or _row_status(row) == "POSTED_UNVERIFIED")
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
            "advance_allocation_payment_excluded_from_f1": not any(row["source_model"] == "Payment" and row["event_key"] == "ADVANCE_ALLOCATION" and row["status"] != "EXCLUDED" for row in workflows),
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


def _event_counts(rows: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    counts: dict[str, Counter] = {}
    for row in rows:
        key = row.get("event_key") or "unknown"
        counts.setdefault(key, Counter())
        counts[key][_row_status(row) or "INFO"] += 1
    return {key: dict(value) for key, value in counts.items()}


def _blocking_groups(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        status = _row_status(row)
        if not status.startswith("BLOCKED") and status not in {"UNSUPPORTED_SOURCE", "UNSUPPORTED"}:
            continue
        key = (row.get("event_key") or "unknown", row.get("blocker_code") or status)
        if key not in grouped:
            grouped[key] = {
                "event_key": key[0],
                "blocker_code": key[1],
                "blocker_label": row.get("blocker_label") or key[1],
                "count": 0,
                "recommended_action": row.get("recommended_action"),
                "action_href": row.get("action_href"),
                "is_acknowledgeable": False,
                "is_postable": False,
            }
        grouped[key]["count"] += 1
    return list(grouped.values())


def _readiness_blockers(*, selected_financial_year: FinancialYear | None, selected_period: AccountingPeriod | None, rows: list[dict[str, Any]], resolver_blockers: list[str]) -> list[str]:
    blockers = list(dict.fromkeys(resolver_blockers))
    if selected_financial_year is None and "No active financial year is configured." not in blockers:
        blockers.append("No active financial year is configured.")
    if selected_period is None and not any("accounting period" in item.lower() for item in blockers):
        blockers.append("No accounting period is selected.")
    if selected_period is not None and selected_period.status == AccountingPeriodStatus.LOCKED:
        blockers.append("Selected accounting period is locked.")
    if selected_period is not None and selected_period.status == AccountingPeriodStatus.CLOSED:
        blockers.append("Selected accounting period is closed.")
    if any(_row_status(row).startswith("BLOCKED") for row in rows):
        blockers.append("Bridge postings are blocked by mapping, period, numbering, or approval readiness.")
    if any(_row_status(row) == "READY_UNPOSTED" for row in rows):
        blockers.append("Unposted bridge items exist for the selected context.")
    return list(dict.fromkeys(blockers))


def _period_blocker_reason(selected_period: AccountingPeriod | None, selected_financial_year: FinancialYear | None) -> str | None:
    if selected_financial_year is not None and not selected_financial_year.is_active:
        return "The selected financial year is not an active financial year."
    if selected_period is None:
        return "No accounting period is selected or the selected period is missing."
    if selected_period.status == AccountingPeriodStatus.LOCKED:
        return "The selected accounting period is locked."
    if selected_period.status == AccountingPeriodStatus.CLOSED:
        return "The selected accounting period is closed."
    return None


def _build_readiness_event_rows(
    readiness_payload: dict[str, Any],
    period_readiness: dict[str, Any],
    selected_period: AccountingPeriod | None,
    selected_financial_year: FinancialYear | None,
    active_filters: BridgeReconciliationFilters,
) -> list[dict[str, Any]]:
    """Convert readiness-service events into virtual readiness_event rows for the results list.

    These are not backed by real DB records. They represent the posting readiness of each
    event type (e.g., EMI payment, invoice, vendor bill) and appear alongside real bridge
    candidate rows so that period/mapping/numbering blockers are visible even when there are
    no concrete DB records in the test or production environment.

    BLOCKED_BY_PERIOD is applied when the selected period is locked, closed, missing, or
    belongs to an inactive financial year.
    """
    period_blocker = _period_blocker_reason(selected_period, selected_financial_year)
    rows: list[dict[str, Any]] = []
    event_filter = (active_filters.event_key or "").strip()
    module_filter = (active_filters.module or "").strip().lower()
    source_model_filter = (getattr(active_filters, "source_model", None) or "").strip()

    for event in readiness_payload.get("events") or []:
        event_key = str(event.get("event_key") or "")
        if event_filter and event_key != event_filter:
            continue
        event_module = str(event.get("source_module") or event.get("event_group") or "").lower()
        if module_filter and event_module and event_module != module_filter:
            continue
        if source_model_filter:
            event_source_model = str(event.get("source_model") or "")
            if event_source_model != source_model_filter:
                continue

        raw_status = str(event.get("status") or "").strip().upper()
        is_unsupported = event_key == "staff_advance" or raw_status in {"UNSUPPORTED", "UNSUPPORTED_SOURCE"}

        if is_unsupported:
            postability = evaluate_accounting_postability(
                event_key=event_key,
                event_label=event.get("label"),
                module=event.get("source_module") or event.get("event_group"),
                source_model=event.get("source_model"),
                bridge_row=None,
                period_readiness=period_readiness,
                source_workflow_exists=False,
                as_source_row=True,
            )
            candidate_status = "UNSUPPORTED_SOURCE"
            blocker_reason = postability.get("blocker_reason", "Unsupported source boundary.")
            blocker_code = "UNSUPPORTED_SOURCE"
        elif period_blocker:
            candidate_status = "BLOCKED_BY_PERIOD"
            blocker_reason = period_blocker
            blocker_code = "PERIOD_NOT_READY"
            postability = {
                "can_post": False,
                "can_preview": False,
                "is_postable": False,
                "blocker_code": blocker_code,
                "blocker_reason": blocker_reason,
                "recommended_action": "Open accounting periods and create/open the required period.",
                "action_href": PERIODS_HREF,
            }
        elif raw_status in {"ERROR", "WARNING", "NOT_CONFIGURED"} or raw_status.startswith("BLOCKED"):
            candidate_status = raw_status if raw_status.startswith("BLOCKED") else "BLOCKED_BY_MAPPING"
            blocker_reason = str((event.get("blocking_reasons") or [""])[0] or event.get("operator_action") or "Mapping or setup is incomplete.")
            blocker_code = candidate_status
            postability = {
                "can_post": False,
                "can_preview": False,
                "is_postable": False,
                "blocker_code": blocker_code,
                "blocker_reason": blocker_reason,
                "recommended_action": event.get("operator_action") or "Fix mapping and retry.",
                "action_href": SETUP_HREF,
            }
        else:
            candidate_status = "READY_UNPOSTED"
            blocker_reason = None
            blocker_code = None
            postability = {
                "can_post": True,
                "can_preview": True,
                "is_postable": True,
                "blocker_code": None,
                "blocker_reason": None,
                "recommended_action": "Preview and post through the bridge posting workflow.",
                "action_href": BRIDGE_HREF,
            }

        status_filter = (active_filters.status or "").strip().upper()
        if status_filter and candidate_status != status_filter:
            continue

        action_href = postability.get("action_href") or BRIDGE_HREF
        row = {
            "row_type": "readiness_event",
            "event_key": event_key,
            "source_model": event.get("source_model") or "",
            "module": event.get("source_module") or event.get("event_group") or "accounting",
            "label": event.get("label") or event_key.replace("_", " ").title(),
            "status": candidate_status,
            "blocker_code": blocker_code,
            "blocker_reason": blocker_reason,
            "blocker_label": blocker_reason,
            "exception_reasons": [blocker_reason] if blocker_reason else [],
            "is_postable": postability.get("is_postable", False),
            "can_post": postability.get("can_post", False),
            "can_preview": postability.get("can_preview", False),
            "action_href": action_href,
            "period_status": getattr(selected_period, "status", None),
            "bridge_candidate_id": None,
            "source_id": None,
            "source_pk": None,
            "source_date": None,
            "source_reference": None,
            "journal_entry": None,
            "reconciliation_state": None,
            "posted_unverified": False,
        }
        rows.append(annotate_phase_f_row_actions(row))

    # Always include staff_advance as UNSUPPORTED_SOURCE if not already present and no restrictive filter
    has_staff_advance = any(r.get("event_key") == "staff_advance" for r in rows)
    staff_event_filter_matches = not event_filter or event_filter == "staff_advance"
    staff_module_filter_matches = not module_filter
    staff_status_filter_matches = not active_filters.status or (active_filters.status or "").strip().upper() in {"UNSUPPORTED", "UNSUPPORTED_SOURCE"}
    staff_source_model_filter_matches = not source_model_filter or source_model_filter == "StaffAdvance"
    if (not has_staff_advance and staff_event_filter_matches and staff_module_filter_matches and staff_status_filter_matches and staff_source_model_filter_matches):
        sa_event = staff_advance_unsupported_event(period_readiness)
        rows.append(annotate_phase_f_row_actions({
            "row_type": "readiness_event",
            "event_key": "staff_advance",
            "source_model": "StaffAdvance",
            "module": "HR & Payroll",
            "label": "Staff advance",
            "status": "UNSUPPORTED_SOURCE",
            "blocker_code": "UNSUPPORTED_SOURCE",
            "blocker_reason": sa_event.get("blocker_reason", "Unsupported boundary."),
            "blocker_label": sa_event.get("blocker_reason", "Unsupported boundary."),
            "exception_reasons": [sa_event.get("blocker_reason", "Unsupported boundary.")],
            "is_postable": False,
            "can_post": False,
            "can_preview": False,
            "action_href": SETUP_HREF,
            "period_status": getattr(selected_period, "status", None),
            "bridge_candidate_id": None,
            "source_id": None,
            "source_pk": None,
            "source_date": None,
            "source_reference": None,
            "journal_entry": None,
            "reconciliation_state": None,
            "posted_unverified": False,
        }))

    return rows


def build_accounting_bridge_reconciliation(filters: BridgeReconciliationFilters | None = None) -> dict[str, Any]:
    active_filters = filters or BridgeReconciliationFilters()
    selected_financial_year, fy_blockers = _resolve_financial_year(active_filters)
    selected_period, period_blockers = _resolve_period(active_filters, selected_financial_year)
    period_readiness = build_accounting_bridge_posting_period_readiness(
        reference_date=selected_period.start_date if selected_period is not None else None,
        financial_year=selected_financial_year,
        period=selected_period,
    )
    readiness_payload = build_accounting_bridge_readiness_with_returns_damage_credit()
    if readiness_payload:
        period_readiness = {
            **period_readiness,
            **(readiness_payload.get("accounting_period_readiness") or readiness_payload.get("financial_year_readiness") or {}),
        }
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
    rows = [annotate_phase_f_row_actions({"row_type": "bridge_candidate", **row}) for row in candidate_rows]
    if readiness_payload:
        readiness_rows = _build_readiness_event_rows(
            readiness_payload=readiness_payload,
            period_readiness=period_readiness,
            selected_period=selected_period,
            selected_financial_year=selected_financial_year,
            active_filters=active_filters,
        )
        source_model_filter = (getattr(active_filters, "source_model", None) or "").strip()
        existing_event_keys = {r.get("event_key") for r in rows if r.get("row_type") == "bridge_candidate"}
        for r in readiness_rows:
            if source_model_filter:
                # When filtering by source_model, skip readiness event rows (they have
                # source_pk=None and represent global config status, not per-instance rows).
                continue
            if r.get("event_key") not in existing_event_keys or r.get("event_key") == "staff_advance":
                rows.append(r)
    status_counts = Counter(_row_status(row) or "INFO" for row in rows)
    readiness_blockers = _readiness_blockers(
        selected_financial_year=selected_financial_year,
        selected_period=selected_period,
        rows=rows,
        resolver_blockers=[*fy_blockers, *period_blockers],
    )
    candidate_summary = summarize_candidate_statuses(rows)
    summary = {
        "source_count": len(rows),
        "ready_unposted_count": status_counts.get("READY_UNPOSTED", 0),
        "blocked_count": sum(count for status, count in status_counts.items() if status.startswith("BLOCKED") or status in {"UNSUPPORTED_SOURCE", "UNSUPPORTED"}),
        "posted_count": status_counts.get("POSTED", 0),
        "reconciled_count": status_counts.get("RECONCILED", 0),
        "exception_count": status_counts.get("EXCEPTION", 0),
        "unsupported_count": status_counts.get("UNSUPPORTED_SOURCE", 0) + status_counts.get("UNSUPPORTED", 0),
        "blocked_by_mapping_count": status_counts.get("BLOCKED_BY_MAPPING", 0),
        "blocked_by_finance_account_count": status_counts.get("BLOCKED_BY_FINANCE_ACCOUNT", 0),
        "blocked_by_period_count": status_counts.get("BLOCKED_BY_PERIOD", 0),
        "blocked_by_numbering_count": status_counts.get("BLOCKED_BY_NUMBERING", 0),
        "blocked_by_approval_count": status_counts.get("BLOCKED_BY_APPROVAL", 0),
        "unposted_bridge_item_count": status_counts.get("READY_UNPOSTED", 0),
        "posted_unreconciled_count": status_counts.get("POSTED", 0),
        "posted_unverified_count": sum(1 for row in rows if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED" or _row_status(row) == "POSTED_UNVERIFIED"),
        "reconciliation_exception_count": status_counts.get("EXCEPTION", 0),
        "ready_unposted_by_event": {key: value.get("READY_UNPOSTED", 0) for key, value in _event_counts(rows).items() if value.get("READY_UNPOSTED", 0)},
        "blocked_by_mapping_by_event": {key: value.get("BLOCKED_BY_MAPPING", 0) for key, value in _event_counts(rows).items() if value.get("BLOCKED_BY_MAPPING", 0)},
        "status_counts_by_event": _event_counts(rows),
        "blocking_groups": _blocking_groups(rows),
        "unsupported_source_count": status_counts.get("UNSUPPORTED_SOURCE", 0),
        **candidate_summary,
    }
    phase_f_control_tower = _phase_f_control_tower(rows, period_readiness, readiness_blockers)
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
        "financial_year_readiness": period_readiness,
        "accounting_period_readiness": period_readiness,
        "phase_f_control_tower": phase_f_control_tower,
        "production_accounting_validation": production_validation,
        "canonical_statuses": list(CANONICAL_STATUSES),
        "results": rows,
    }
