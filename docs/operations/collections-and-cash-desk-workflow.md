# Collections And Cash Desk Workflow

## Goal

Give admin and cashier users one clear collection workspace while preserving separate posting paths for:

- subscription sale collections
- direct-sale receivable collections

The finance control center is a review layer for these flows. It does not replace the collection posting pages.

## Admin workflow

- `Admin > Collections & Cash Desk > Collections Workspace` is the monitoring surface.
- `Admin > Finance & Ledger Control > Finance Control Center` gives a finance-first review of receivables, payables, recent collections, and reconciliation-sensitive items.
- `Collect Subscription Payment` stays on the subscription path.
- `Collect Direct-Sale Balance` stays on the direct-sale receipt path.

## Cashier workflow

- `Cashier > Collection Workflows` now covers both:
  - subscription EMI collection
  - direct-sale balance collection

The cashier chooses the workflow first, then searches within the correct receivable type.

## Controls

- Cashier direct-sale collection posts retail receipt updates only.
- Cashier subscription collection posts EMI-safe payment allocation only.
- Admin finance review can open both workflows, but cannot collapse them into one shared posting form.
- Finance-account and counter controls remain enforced by the existing backend services.
- Receipt history and outstanding balances remain auditable after collection.

## Daily close implications

Admin collections review should reconcile:

- subscription collections
- direct-sale collections
- finance-account totals
- receipt history
- open receivables still pending follow-up
