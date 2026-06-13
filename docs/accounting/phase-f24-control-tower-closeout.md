# Phase F24 — Control-Tower Closeout and Readiness Hardening

Phase F24 is read-only readiness, diagnostics, summary visibility, documentation, and regression coverage for the completed Phase F controlled bridge posting work.

F24 does not add a new accounting source model, posting source, journal posting path, reconciliation posting path, or business workflow. It does not auto-post, auto-reconcile, auto-close accounting periods, or mutate source records.

## Source Inventory Matrix

| Phase | Domain | Source model | Event keys | Accounting shape | Owner | Boundary |
|---|---|---|---|---|---|---|
| F1 | Cash/receipt/payment | `Payment` | `subscription_emi_payment`, `advance_emi_collection` | Dr finance account chart account, Cr customer receivable / EMI income | `subscriptions.Payment` | `ADVANCE_ALLOCATION` payment rows remain excluded from F1. |
| F2 | Cash/receipt/payment | `ReceiptDocument` | `direct_sale_receipt`, `customer_advance`, `customer_refund`, `refund_customer_credit` | Receipt-specific cash/bank/UPI settlement against receivable or customer credit | `billing.ReceiptDocument` | `ReceiptDocument.customer_advance` remains separate from F20. |
| F3 | Billing/invoice/returns | `BillingInvoice` | `direct_sale_invoice`, `direct_sale_outstanding` | Dr customer receivable, Cr direct sale income / tax when applicable | `billing.BillingInvoice` | Invoice posting only. |
| F4 | Billing/invoice/returns | `BillingCreditNote`, `DirectSaleReturn` | `credit_note_issue`, `sales_return`, `customer_credit_adjustment`, `direct_sale_return` | Dr return/customer credit account, Cr customer receivable | Billing return models | Return/credit-note paths remain separate from refund sources. |
| F5 | Billing/invoice/returns | `BillingDebitNote` | `debit_note_issue`, `customer_debit_adjustment`, `damage_recovery`, `additional_receivable_adjustment` | Dr customer receivable, Cr adjustment/damage recovery income | `billing.BillingDebitNote` | Debit-note only. |
| F6 | Purchase/vendor | `PurchaseBill` | `purchase_bill_accrual`, `purchase_bill` | Dr inventory/expense/input tax, Cr vendor payable | `inventory.PurchaseBill` | Purchase accrual only. |
| F7 | Purchase/vendor | `VendorPayment` | `vendor_payment`, `vendor_payment_settlement` | Dr vendor payable, Cr finance account | `inventory.VendorPayment` | Vendor payment settlement only. |
| F8 | Inventory/COGS | `StockLedger` | `stock_ledger_inventory_movement`, `inventory_movement` | Inventory movement between mapped stock accounts | `inventory.StockLedger` | Inventory movement only. |
| F9 | Inventory/COGS | `StockLedger` | `cogs_stockout`, `deferred_cogs` | Dr COGS, Cr inventory asset | `inventory.StockLedger` | COGS/stock-out only. |
| F10 | Commission/payout | `Commission` | `commission_accrual`, `partner_commission_accrual`, `sales_commission_accrual` | Dr commission expense, Cr commission payable | `subscriptions.Commission` | Accrual only. |
| F11 | Commission/payout | `CommissionPayoutBatch` | `commission_payout`, `commission_settlement`, `partner_commission_payout`, `commission_payable_settlement` | Dr commission payable, Cr payout finance account | `subscriptions.CommissionPayoutBatch` | Payout batch only. |
| F12 | Payroll/salary | `SalarySheet` | `salary_accrual`, `payroll_accrual` | Dr salary expense, Cr salary payable | HR salary sheet | Salary accrual only. |
| F13 | Payroll/salary | `SalaryPayment` | `salary_payment`, `payroll_payment` | Dr salary payable, Cr finance account | HR salary payment | Salary payment only. |
| F14 | Rent/lease | `RentLeaseBillingDemand` | `rent_monthly_revenue`, `lease_monthly_revenue`, `rent_invoice_revenue`, `lease_invoice_revenue`, `rent_lease_invoice_revenue` | Dr customer receivable, Cr rent/lease income / tax when applicable | `subscriptions.RentLeaseBillingDemand` | Revenue demand only. |
| F15B | Rent/lease | `RentLeaseCollection` | `rent_lease_collection_source_contract` | Source contract only | `subscriptions.RentLeaseCollection` | Deferred to F15C for settlement posting. |
| F15C | Rent/lease | `RentLeaseCollection` | `rent_lease_collection_settlement`, `rent_lease_monthly_collection` | Dr finance account, Cr customer receivable / settlement account | `subscriptions.RentLeaseCollection` | Settlement only; separate from F14 revenue. |
| F16 | Security deposit | `RentLeaseDepositTransaction` | `security_deposit_source_contract` | Source contract only | `subscriptions.RentLeaseDepositTransaction` | Deferred to F17/F18 for receipt/refund posting. |
| F17 | Security deposit | `RentLeaseDepositTransaction` | `security_deposit_receipt`, `rent_security_deposit_receipt`, `lease_security_deposit_receipt` | Dr finance account, Cr security deposit liability | `subscriptions.RentLeaseDepositTransaction` | Receipt only. |
| F18 | Security deposit | `RentLeaseDepositTransaction` | `security_deposit_refund`, `rent_security_deposit_refund`, `lease_security_deposit_refund` | Dr security deposit liability, Cr finance account | `subscriptions.RentLeaseDepositTransaction` | Refund only. |
| F19 | Customer advance | `CustomerAdvance` | `customer_advance_source_contract` | Source-contract hardening only | `subscriptions.CustomerAdvance` | Deferred to F20 for receipt posting. |
| F20 | Customer advance | `CustomerAdvance` | `customer_advance_receipt`, `customer_advance` | Dr finance account, Cr customer advance liability | `subscriptions.CustomerAdvance` | Separate from F2 `ReceiptDocument.customer_advance`. |
| F21 | Customer advance | `CustomerAdvanceAllocation` | `customer_advance_application`, `advance_application` | Dr customer advance liability, Cr customer receivable | `subscriptions.CustomerAdvanceAllocation` | Linked `Payment` rows stay excluded from F1. |
| F22 | Customer advance | `CustomerAdvanceRefund` | `customer_advance_refund_source_contract` | Source-contract hardening only | `subscriptions.CustomerAdvanceRefund` | Deferred to F23 for refund posting. |
| F23 | Customer advance | `CustomerAdvanceRefund` | `customer_advance_refund` | Dr customer advance liability, Cr finance account | `subscriptions.CustomerAdvanceRefund` | Separate from F2/F18/customer-credit refund paths. |
| Deferred | Payroll/salary | `StaffAdvance` | `staff_advance` | Unsupported boundary | HR/payroll | StaffAdvance remains unsupported and non-postable. |

## Readiness States

The F24 control-tower exposes these read-only states:

- `READY_FOR_CONTROLLED_POSTING`: at least one source has ready unposted candidates, mappings/numbering/periods are available, and there is no system-level blocker.
- `ACTION_REQUIRED`: mapping, finance-account, numbering, or period blockers exist.
- `POSTED_UNVERIFIED_EXISTS`: bridge postings exist and explicit reconciliation verification is pending.
- `RECONCILIATION_EXCEPTIONS`: amount mismatch, duplicate posting, unbalanced journal, source-link missing, or unsupported-source diagnostics exist.
- `NO_CANDIDATES`: no concrete source candidates currently exist.
- `UNSUPPORTED_ONLY`: only unsupported, skipped, or deferred rows exist.

Readiness never creates `JournalEntry`, `AccountingBridgePosting`, or source records. Existing reconciliation diagnostics remain the only permitted diagnostic mechanism.

## Operational Rules

- Posting remains explicit, admin-only, row-level, idempotent, period-gated, numbering-gated, and mapping-gated.
- F24 does not create post-all behavior.
- F24 does not create fake post buttons for abstract, blocked, unsupported, skipped, or deferred rows.
- F24 does not mutate `Payment`, `ReceiptDocument`, `BillingInvoice`, `BillingCreditNote`, `BillingDebitNote`, `PurchaseBill`, `VendorPayment`, `StockLedger`, `Commission`, `CommissionPayoutBatch`, `SalarySheet`, `SalaryPayment`, `RentLeaseBillingDemand`, `RentLeaseCollection`, `RentLeaseDepositTransaction`, `CustomerAdvance`, `CustomerAdvanceAllocation`, `CustomerAdvanceRefund`, `Subscription`, `Emi`, customer, partner, finance-account, or chart-account records.
- F24 does not auto-post, auto-reconcile, or auto-close accounting periods.
- F24 does not weaken duplicate source/event detection or idempotency checks.

## Remaining Future Work

The recommended next step after F24 is a production accounting operational validation pass: run the bridge cockpit against real onboarding data, verify setup links and blocked rows with accounting staff, confirm reconciliation diagnostics, and then proceed to release-candidate freeze or manual data onboarding checklist.
