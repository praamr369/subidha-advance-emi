# Invoice and Receipt Active Visibility

## Core Rule
- `VOID`, `REVERSED`, `CANCELLED`, and `CREDITED_FULLY` invoices are history-only.
- `VOID`, `REVERSED`, and `CANCELLED` receipts are history-only.
- History rows remain visible in registers and audit timelines.

## Active Invoice Balance
- Active Invoice Balance excludes:
  - void/reversed/cancelled/credited-fully invoices
  - draft invoices
- Active Invoice Balance uses only collectible invoice rows.

## Active Collections
- Window Collections use active receipts only.
- Active receipt count excludes voided/reversed/cancelled receipts.
- Cash/UPI/Bank method split is computed from active receipts only.

## Register and Detail Behavior
- Invoice register keeps history rows visible with status badges.
- History-only invoices show no active collect action.
- Invoice detail banner explains when a document is history-only.
- PDF/print preview must not imply active due for history-only invoices.

## No Deletion Policy
- No invoice, receipt, payment, journal, direct-sale, or audit rows are deleted to implement visibility rules.
