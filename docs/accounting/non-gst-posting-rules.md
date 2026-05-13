# Non-GST Posting Rules

## Scope
These rules apply when active `BusinessTaxProfile.mode = GST_UNREGISTERED`.

## Sales and receivables
- Direct-sale commercial invoice posting continues through existing receivable + revenue entries.
- GST output postings are blocked for GST-mode invoices while unregistered.
- Non-GST snapshots retain zero tax components.

## Purchase and inventory
- Purchase bill supplier tax may be captured on lines.
- Input GST posting is blocked while unregistered.
- Supplier tax amount is absorbed into inventory/landed cost where applicable.

## Rent/lease and deposits
- Rent/lease monthly demand receipts are non-GST snapshots.
- Security deposits remain liability, not income.
- Deposit deductions/refunds keep existing liability-control posting behavior.

## Lucky Plan finance integrity
- EMI posting logic is unchanged.
- Lucky waiver accounting remains waiver expense + receivable reduction behavior.
- Commission, payout, and reconciliation flows remain unchanged.

## Auditability
- No destructive mutation of payment/invoice/receipt/journal history.
- Snapshot JSON fields preserve the tax posture present at document creation time.
