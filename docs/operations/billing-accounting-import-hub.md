# Billing, Accounting, and Import Hub Notes

## Billing contract mirror

- Subscription, EMI, Payment, and delivery records remain the live Lucky Plan source of truth.
- Billing mirrors contract state through `BillingProfile`, `BillingInstallmentMirror`, and `BillingSyncEvent`.
- Admin users can manually refresh a billing contract mirror from the billing contracts workspace.
- EMI billing document approval/posting remains delivery-gated.

## Direct-sale and billing document flow

- Direct retail sale now starts from the separate `/admin/billing/direct-sales` workspace.
- Direct sale creates an operational source record plus a linked billing invoice draft; it does not reuse Lucky Plan subscription tables.
- Direct sale, billing invoice, and receipt documents may now carry additive branch and counter context without changing their underlying commercial truth.
- Product, SKU, unit, and inventory profile references are reused from product master and inventory master data.
- Final direct-sale invoice posting remains delivery-gated when `delivery_required` is enabled on the direct sale.
- Inventory stock moves only when the billing invoice is posted, not when direct-sale or billing drafts are edited.
- Receipts, credit notes, and debit notes remain separate additive documents under `/admin/billing/register` and `/admin/billing/receipts`.
- Returns and after-sales cases may now orchestrate credit and debit note posting from `/admin/service-desk/cases/{id}`, but the underlying billing note documents remain the financial source of truth.

## Accounting bridge provenance

- Bridge-generated accounting entries stay traceable through `AccountingBridgePosting`.
- Journal entries now also keep additive `voucher_type`, `source_type`, and `source_reference` fields for register and book drill-down.
- Branch and counter context now flows into bridge trace metadata from payment, billing, and branch-linked operational sources when present.
- Bridge runs remain admin-only and idempotent.
- Operational payment and EMI records are not rewritten by accounting bridge flows.

Current controlled bridge coverage:

- Billing invoice, receipt, credit-note, and debit-note posting already creates accounting journals from the billing services.
- Inventory purchase-bill and stock-adjustment posting creates accounting journals from the inventory stock service.
- Payment collection and payment reversal bridges stay separate from payment truth.
- EMI receipt posting stays separate from payment truth and lands in finance-account books.
- Winner waiver events now post a separate waiver reserve journal from the audited waiver event.
- Commission settlement now posts expense-to-payable accrual journals.
- Finalized payout batches can post payable-to-finance-account payout journals when a finance account is assigned on the batch.
- Posted salary sheets and salary payments now generate explicit payroll accrual and payroll payout journals through salary services.
- Posted purchase bills continue to generate stock inward plus accounting recognition from one controlled service path.
- Expense vouchers continue to post into accounting through their own document workflow rather than manual journal shortcuts.
- Posted return credit notes and service debit notes continue to create accounting entries from the billing note posting path; service desk only coordinates when those documents should be posted.

Operator note:

- Payout batches should capture the real cash, bank, or UPI finance account before finalization when possible.
- If a payout batch has no finance account, the accounting payout bridge will skip it instead of guessing the book.

## Procurement and workforce governance

- Vendor master now lives in `/admin/accounting/vendors`.
- Purchase-bill drafting and posting lives in `/admin/accounting/purchase-bills`.
- Expense vouchers remain separate from purchase bills; use expenses for non-stock operating costs.
- Staff master and compensation components live in `/admin/accounting/staff`.
- Attendance calendar and overtime capture live in `/admin/accounting/attendance`.
- Leave type and leave request control live in `/admin/accounting/leave`.
- Salary-sheet accrual, payslip-ready detail, and salary payment live in `/admin/accounting/salary`.
- Staff expense claims and reimbursements live in `/admin/accounting/expense-claims`.
- Employee payable and reimbursement posture is reviewed in `/admin/accounting/staff-ledger`.
- Branch-safe collection and finance governance now starts from `/admin/branches`, `/admin/counters`, and `/admin/branch-reporting`.

Control rules:

- Purchase bills affect inventory and accounting together only when posted.
- Salary payment is blocked until the salary sheet has been posted.
- Expense-claim reimbursement payment is blocked until the claim accrual has been posted.
- Closed payroll periods block new attendance, leave, claim, and salary-draft activity inside the locked range.
- Workforce records do not replace authentication users or role permissions.
- Attendance remains operational source data, but payroll auto-generation can now reuse overtime and unpaid-leave inputs from controlled workforce services.

## Branch and counter governance

- Branches are a shared governance layer, not a replacement for billing, inventory, or accounting modules.
- Counters map cashier operations to one branch and one finance account.
- Stock locations can now carry explicit branch ownership.
- Branch reporting derives from payment, direct sale, subscription, inventory, and workforce truth rather than duplicate summary tables.

## Import hub

Current live import flows:

- Product catalog import: `/admin/products/import`
- Opening stock import: `/admin/inventory/opening-stock`
- Chart of accounts CSV import: `/admin/settings/imports`
- Vendor master CSV import: `/admin/settings/imports`
- Staff master CSV import: `/admin/settings/imports`
- Branch master CSV import: `/admin/settings/imports`
- Counter / cash-desk CSV import: `/admin/settings/imports`

Safety notes:

- Imports are additive and audit-friendly.
- Supported rollout imports now follow validate/preview/post discipline:
  `validate_vendor_import_csv`, `validate_employee_import_csv`, `validate_branch_import_csv`, `validate_counter_import_csv`, plus the existing customer/product validators.
- Finance-account opening-balance bulk import is intentionally deferred until a posting-safe policy is approved.
- Inventory opening stock import is already a controlled stock-ledger workflow under `/admin/inventory/opening-stock`.
- Master-data imports must not be used to bypass payment, EMI, reconciliation, or audit controls.
- Procurement, expense, and payroll source events must not be bulk-imported as fake journal history without an approved posting policy.
- Bulk subscription import remains intentionally unsupported because it would bypass contract, EMI, and reconciliation safeguards.
