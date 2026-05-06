# Unified Outstanding Ledger

## Purpose
`/admin/outstandings` is the read-only control center for collectible dues across:
- Advance EMI subscription installments
- Rent installments
- Lease installments
- Direct sale outstanding balances
- Standalone billing invoices (only invoices not linked to subscription or direct sale)

This surface is additive and does not post payments.

## Backend endpoints
- `GET /api/v1/admin/outstandings/`
- `GET /api/v1/admin/outstandings/export.csv`

Both endpoints are admin-only.

## Filter contract
- `state=all|overdue|due_today|upcoming|not_due`
- `operation=all|advance_emi|rent|lease|direct_sale|billing_invoice`
- `q`
- `customer`
- `from_date`
- `to_date`
- `age_bucket=current|1_7|8_15|16_30|31_60|60_plus`
- `min_amount`
- `max_amount`
- `ordering`
- `page`
- `page_size`

## Double-count guardrails
- Direct-sale receivable rows come only from `DirectSale.balance_total > 0`.
- Standalone invoice rows come only from `BillingInvoice` where `subscription IS NULL` and `direct_sale IS NULL`.
- Subscription/rent/lease receivable rows come from pending EMI schedule rows.

## Collection routing
Row action links route operators to existing safe pages (for example `/admin/finance/collect`) with context query parameters. Posting is not performed by this ledger page.

## Linked navigation updates
- `/admin/emis/overdue` now routes operators to the unified page for advance EMI overdue tracking:
  - `/admin/outstandings?operation=advance_emi&state=overdue`
- `/admin/reports/overdue` includes the same unified handoff.

## Financial integrity and auditability
- No changes were made to EMI calculation logic.
- No changes were made to payment posting, reversal, waiver, reconciliation, commission, payout, or draw logic.
- Endpoint behavior is read-only and returns normalized operational rows and aggregates for traceability.
