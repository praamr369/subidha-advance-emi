# Billing, Accounting, and Import Hub Notes

## Billing contract mirror

- Subscription, EMI, Payment, and delivery records remain the live Lucky Plan source of truth.
- Billing mirrors contract state through `BillingProfile`, `BillingInstallmentMirror`, and `BillingSyncEvent`.
- Admin users can manually refresh a billing contract mirror from the billing contracts workspace.
- EMI billing document approval/posting remains delivery-gated.

## Direct-sale and billing document flow

- Direct retail sale now starts from the separate `/admin/billing/direct-sales` workspace.
- Direct sale creates an operational source record plus a linked billing invoice draft; it does not reuse Lucky Plan subscription tables.
- Product, SKU, unit, and inventory profile references are reused from product master and inventory master data.
- Final direct-sale invoice posting remains delivery-gated when `delivery_required` is enabled on the direct sale.
- Inventory stock moves only when the billing invoice is posted, not when direct-sale or billing drafts are edited.
- Receipts, credit notes, and debit notes remain separate additive documents under `/admin/billing/register` and `/admin/billing/receipts`.

## Accounting bridge provenance

- Bridge-generated accounting entries stay traceable through `AccountingBridgePosting`.
- Journal entries now also keep additive `voucher_type`, `source_type`, and `source_reference` fields for register and book drill-down.
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

Operator note:

- Payout batches should capture the real cash, bank, or UPI finance account before finalization when possible.
- If a payout batch has no finance account, the accounting payout bridge will skip it instead of guessing the book.

## Import hub

Current live import flows:

- Product catalog import: `/admin/products/import`
- Opening stock import: `/admin/inventory/opening-stock`
- Chart of accounts CSV import: `/admin/settings/imports`
- Vendor master CSV import: `/admin/settings/imports`

Safety notes:

- Imports are additive and audit-friendly.
- Finance-account opening-balance bulk import is intentionally deferred until a posting-safe policy is approved.
- Inventory opening stock import is already a controlled stock-ledger workflow under `/admin/inventory/opening-stock`.
- Master-data imports must not be used to bypass payment, EMI, reconciliation, or audit controls.
