# Phase F25 - Production Accounting Operational Validation

## Purpose

Phase F25 validates production-like accounting operations after Phase F1-F24 bridge posting and readiness work. It is a read-only operational validation layer for source inventory, setup blockers, operator next actions, and reconciliation posture.

F25 does not add posting behavior. It does not create journals, bridge postings, reconciliation rows, source records, or period close actions.

## Preconditions

Run before F25 validation or release:

```bash
cd backend
source .venv/bin/activate
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py test tests.accounting.test_phase_f_control_tower_closeout_phase_f24 --verbosity=1
.venv/bin/python manage.py test tests.accounting tests.reconciliation tests.subscriptions --verbosity=1
cd ../frontend
npm run typecheck
npm run lint
npm run build:smoke
```

## No-Post Rules

- Validation is read-only.
- Posting remains explicit, admin-only, idempotent, period-gated, numbering-gated, and reconciliation-controlled.
- Validation must not create `JournalEntry`.
- Validation must not create `AccountingBridgePosting`.
- Validation must not create `ReconciliationItem` outside existing approved diagnostics.
- Validation must not mutate Payment, EMI, receipt, invoice, customer advance, rent/lease, deposit, stock, commission, payout, payroll, or source workflow records.
- Validation must not auto-post, auto-reconcile, or auto-close periods.
- Unsupported and abstract rows remain non-postable.

## Production Accounting Workflow Matrix

| Domain | Workflow | Source model | Event key | Expected accounting shape | Operator | Bridge ownership | Expected status/action | Reconciliation posture | Validation test |
|---|---|---|---|---|---|---|---|---|---|
| EMI / subscription | EMI payment collection | Payment | subscription_emi_payment | Dr FinanceAccount chart account, Cr customer receivable / EMI income | cashier/admin | F1 Payment bridge | READY_UNPOSTED or setup blocker; bridge posting link | Posted rows require operator verification before reconciled | test_emi_subscription_workflows_and_advance_allocation_boundary |
| EMI / subscription | EMI receipt | ReceiptDocument | direct_sale_receipt | Receipt evidence; EMI cash accounting remains F1 Payment-owned | cashier/admin | F2 receipt evidence / F1 Payment posting | READY_UNPOSTED or setup blocker | Receipt evidence reviewed separately from EMI payment posting | test_emi_subscription_workflows_and_advance_allocation_boundary |
| EMI / subscription | Winner waiver future-only | WinnerHistory | future_emi_waiver | Non-cash benefit; future EMI waiver only | admin/system | Lucky draw/waiver service | validation only; lucky draw link | Waived EMI remains distinct from paid EMI | test_emi_subscription_workflows_and_advance_allocation_boundary |
| EMI / subscription | ADVANCE_ALLOCATION Payment excluded | Payment | ADVANCE_ALLOCATION | Advance allocation is not F1 cash collection | system/admin | F21 CustomerAdvanceAllocation owns application | excluded from F1 | No F1 reconciliation credit for advance allocation | test_emi_subscription_workflows_and_advance_allocation_boundary |
| Direct sale / billing | Direct-sale invoice | BillingInvoice | direct_sale_invoice | Dr customer receivable, Cr direct sale income/output tax | admin/system | F3 BillingInvoice bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Direct sale / billing | Direct-sale receipt | ReceiptDocument | direct_sale_receipt | Dr finance account, Cr direct sale/customer receivable | cashier/admin | F2 ReceiptDocument bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Direct sale / billing | Credit note | BillingCreditNote | credit_note_issue | Dr sales return/customer credit, Cr customer receivable | admin | F4 BillingCreditNote bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Direct sale / billing | Debit note | BillingDebitNote | debit_note_issue | Dr customer receivable, Cr damage recovery/adjustment income | admin | F5 BillingDebitNote bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Direct sale / billing | Direct-sale return | DirectSaleReturn | direct_sale_return | Dr sales return/inventory-adjusted return, Cr customer receivable | admin/system | F4 DirectSaleReturn bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Purchase / vendor | Purchase bill | PurchaseBill | purchase_bill_accrual | Dr inventory/expense/input tax, Cr vendor payable | admin/system | F6 PurchaseBill bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Purchase / vendor | Vendor payment | VendorPayment | vendor_payment | Dr vendor payable, Cr concrete finance account | admin | F7 VendorPayment bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Inventory / COGS | Stock receive | StockLedger | stock_ledger_inventory_movement | Inventory movement between mapped stock accounts | system/admin | F8 StockLedger bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Inventory / COGS | Stock adjustment | StockLedger | inventory_movement | Inventory movement between mapped stock accounts | system/admin | F8 StockLedger bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Inventory / COGS | Stock-out / COGS | StockLedger | cogs_stockout | Dr COGS, Cr inventory asset | system/admin | F9 StockLedger COGS bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Commission / payout | Commission accrual | Commission | commission_accrual | Dr commission expense, Cr commission payable | system/admin | F10 Commission bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Commission / payout | Commission payout | CommissionPayoutBatch | partner_commission_payout | Dr commission payable, Cr payout finance account | admin | F11 CommissionPayoutBatch bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Payroll | Salary accrual | SalarySheet | salary_accrual | Dr salary expense, Cr salary payable | admin/system | F12 SalarySheet bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Payroll | Salary payment | SalaryPayment | salary_payment | Dr salary payable, Cr finance account | admin | F13 SalaryPayment bridge | bridge posting link or blocker | Verify before reconciled | test_matrix_includes_all_required_operational_workflows |
| Rent/lease | Rent/lease revenue | RentLeaseBillingDemand | rent_monthly_revenue | Dr customer receivable, Cr rent/lease income/output tax | system/admin | F14 revenue bridge | bridge posting link or blocker | Separate from collection settlement | test_rent_lease_and_security_deposit_separation |
| Rent/lease | Rent/lease collection settlement | RentLeaseCollection | rent_lease_collection_settlement | Dr finance account, Cr customer receivable/settlement | cashier/admin | F15C collection bridge | bridge posting link or blocker | Separate from revenue demand | test_rent_lease_and_security_deposit_separation |
| Rent/lease | Security deposit receipt | RentLeaseDepositTransaction | security_deposit_receipt | Dr finance account, Cr security deposit liability | cashier/admin | F17 deposit receipt bridge | bridge posting link or blocker | Liability, not income | test_rent_lease_and_security_deposit_separation |
| Rent/lease | Security deposit refund | RentLeaseDepositTransaction | security_deposit_refund | Dr security deposit liability, Cr finance account | admin | F18 deposit refund bridge | bridge posting link or blocker | Separate from receipt and revenue | test_rent_lease_and_security_deposit_separation |
| Customer advance | ReceiptDocument.customer_advance | ReceiptDocument | customer_advance | F2 receipt evidence | cashier/admin | F2 ReceiptDocument bridge | bridge posting link or blocker | Separate from F20 concrete advance receipt | test_customer_advance_phase_separation |
| Customer advance | CustomerAdvance receipt | CustomerAdvance | customer_advance_receipt | Dr finance account, Cr customer advance liability | cashier/admin | F20 CustomerAdvance bridge | bridge posting link or blocker | Liability until applied | test_customer_advance_phase_separation |
| Customer advance | CustomerAdvanceAllocation application | CustomerAdvanceAllocation | customer_advance_application | Dr customer advance liability, Cr customer receivable | admin/system | F21 allocation bridge | bridge posting link or blocker | Not F1 cash collection | test_customer_advance_phase_separation |
| Customer advance | CustomerAdvanceRefund refund | CustomerAdvanceRefund | customer_advance_refund | Dr customer advance liability, Cr finance account | admin | F23 refund bridge | bridge posting link or blocker | Separate from F22 source hardening | test_customer_advance_phase_separation |
| Control tower | Source inventory and blockers | PhaseFControlTower | source_inventory / blockers | Read-only source inventory and setup routing | admin/system | F24/F25 validation payload | mapping, finance account, numbering, period, bridge posting, reconciliation links | Posted-unverified is not reconciled | test_control_tower_validation_surfaces_and_no_mutation_contract |
| Control tower | Unsupported boundary | StaffAdvance | staff_advance | Unsupported; no controlled bridge posting source | admin/system | Unsupported boundary | visible but non-postable | Never reconciled by validation | test_staff_advance_and_unsupported_sources_remain_non_postable |

## Daily Validation Sequence

1. Open Accounting Bridge Reconciliation.
2. Review Production Accounting Validation by domain.
3. Resolve mapping blockers from Mapping Audit.
4. Resolve finance-account blockers from Finance Accounts.
5. Resolve numbering blockers from Document Numbering.
6. Resolve period blockers from Accounting Periods.
7. Preview eligible concrete source rows.
8. Post only explicitly approved admin rows.
9. Run reconciliation checks.
10. Verify posted-unverified rows only after evidence checks pass.

## Month-End Validation Sequence

1. Confirm all periods for the month exist.
2. Confirm the month period is open before posting.
3. Confirm journal numbering is ready.
4. Clear blocked bridge rows or document why they remain blocked.
5. Post only approved READY_UNPOSTED concrete rows.
6. Run reconciliation checks.
7. Verify posted-unverified rows.
8. Confirm unsupported rows are known boundaries, not hidden failures.
9. Close period only through existing period close controls.

## Separation Rules

- Customer advance stays split across F2 ReceiptDocument evidence, F20 CustomerAdvance receipt, F21 CustomerAdvanceAllocation application, and F23 CustomerAdvanceRefund refund.
- Security deposit receipt F17 and refund F18 remain separate. Deposits are liabilities, not income.
- Rent/lease revenue F14 remains separate from rent/lease collection settlement F15C.
- `StaffAdvance` remains unsupported and non-postable.
- `ADVANCE_ALLOCATION` Payment rows remain excluded from F1 Payment collection.

## Release Readiness Decision Checklist

- Preconditions pass.
- Production Accounting Validation payload is present and read-only.
- No validation path creates `JournalEntry` or `AccountingBridgePosting`.
- No source record changes during validation.
- Posted-unverified rows are not counted as reconciled.
- F2/F20/F21/F23 customer advance separation is visible.
- F17/F18 security deposit separation is visible.
- F14/F15C rent/lease separation is visible.
- Unsupported rows are visible and non-postable.
- Operator action links route to existing setup/reconciliation pages.
