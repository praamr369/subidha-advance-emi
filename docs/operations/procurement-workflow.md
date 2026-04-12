# Procurement Workflow

This guide covers the additive supplier, purchase, expense, and stock-inward workflow in SUBIDHA CORE.

## Scope

This workflow is for:

- vendor and supplier master governance
- purchase-bill drafting, approval, and posting
- stock inward from vendor purchases
- expense vouchers that should flow into accounting through controlled posting
- raw-material procurement readiness that can now feed controlled manufacturing jobs

This workflow is not:

- a replacement for billing documents
- a replacement for payment truth
- a shortcut to manual journal posting
- a manufacturing module

## Core routes

- `/admin/accounting/vendors`
- `/admin/accounting/purchase-bills`
- `/admin/accounting/expenses`
- `/admin/inventory/items`
- `/admin/inventory/ledger`
- `/admin/accounting/books/purchase`
- `/admin/accounting/bridges`

## Vendor master rule

Use the vendor register before posting procurement or expense documents.

Operators should capture:

- vendor legal name
- phone and email if available
- address
- GSTIN when applicable
- state code and state name
- active or inactive operating state

Do not overload customer, partner, or billing-party records to represent suppliers.

## Purchase-bill workflow

1. Maintain the vendor in `/admin/accounting/vendors`.
2. Confirm each procured item already has a product-backed inventory profile.
3. Mark raw-material capable items through inventory item governance when needed.
4. Create the purchase bill as `DRAFT` in `/admin/accounting/purchase-bills`.
5. Add item lines with quantity, unit cost, and tax values.
6. Review the computed bill totals instead of hand-editing totals outside the line set.
7. Approve the bill when the draft is operationally frozen.
8. Post the approved bill only when stock should be received and accounting should recognize the purchase.

Posting results:

- stock inward is written into the inventory ledger
- purchase-side accounting is written through the controlled posting service
- source trace remains linked to the purchase bill

Guardrails:

- do not edit posted purchase bills
- do not mutate stock by editing product or inventory master pages
- do not create manual journals to bypass purchase posting

## Expense voucher workflow

Use `/admin/accounting/expenses` for non-stock operating expenses.

Recommended order:

1. Select the vendor only when the expense came from an external supplier or service provider.
2. Select the correct expense account and finance account.
3. Save the voucher in draft if review is still pending.
4. Approve the voucher before posting.
5. Post only through the expense workflow so the journal remains source-traceable.

Expense vouchers are not purchase bills. If goods should increase stock, use the purchase-bill workflow instead.

## Raw-material readiness

Raw-material readiness in this pass is intentionally limited to procurement and stock control.

Supported now:

- vendor-linked purchase of raw-material items
- raw-material inventory profiles through `InventoryItem.stock_item_type`
- stock inward through purchase posting
- inventory and accounting traceability for inwarded raw materials

Deferred:
- advanced procurement contracts
- supplier scheduling or MRP planning
- manufacturing planning automation beyond manual BOM and production-job release

## Procurement to manufacturing handoff

When purchased items will be consumed in production:

1. Maintain the raw-material inventory profile and stock item type correctly.
2. Receive raw material through the purchase-bill posting flow first.
3. Review the stock ledger and valuation posture.
4. Use the manufacturing BOM and production job only after the raw stock is physically available.

Guardrails:

- Procurement remains the source of raw-material inward.
- Manufacturing remains the source of raw-material consumption and FG receipt.
- Do not use expense vouchers or stock adjustments to simulate production input.

## End-of-day review

At the end of the day:

1. Review posted purchase bills.
2. Review the stock ledger for vendor inward rows.
3. Review purchase book and trial balance.
4. Review expense vouchers posted that day.
5. Review bridge traces if any dependent accounting bridge action was required.
