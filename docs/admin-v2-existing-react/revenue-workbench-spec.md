# Revenue Workbench Specification

## Route

`/admin/revenue`

## Tabs

- Sales Desk
- Direct Sale
- Lucky Plan
- Subscriptions
- Rent / Lease
- EMIs
- Payments
- Receipts
- Billing
- Outstanding
- Settlements
- Counters
- Customer Advances

## Domain boundaries

- Direct Sale remains separate from EMI subscriptions.
- Lucky Plan continues to require backend-controlled customer, batch, Lucky ID,
  schedule, collection, draw, and waiver workflows.
- Rent and lease demands and deposits remain separate from EMI semantics.
- payments, receipts, invoices, settlements, customer advances, and
  outstanding totals remain backend-authoritative.

## Dangerous actions

Posting, reversal, refund, receipt, invoice, settlement, draw, waiver, deposit,
and accounting actions must use existing backend preview, confirmation,
permission, and audit contracts.

## Phase 1 state

The query-driven route shell exists. Each tab links to the current live
operational route; no data or action logic has been duplicated.
