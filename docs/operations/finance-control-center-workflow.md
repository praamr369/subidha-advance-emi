# Finance Control Center Workflow

## Goal

Give admin one finance-first control surface that shows:

- customer receivables
- supplier payables
- direct-sale unpaid recovery
- subscription overdue posture
- payment method and finance-account mix
- reconciliation-sensitive queues

This page is a visibility and routing layer. It does not replace existing posting services.

## What the page uses

- admin analytics summary for receivables, overdue EMI, payment-method mix, direct-sale posture, and reconciliation flags
- admin payment register for recent collection visibility
- direct-sale billing register for unpaid retail bills
- vendor operational summary for supplier payable visibility
- purchase-bill, finance-account, and chart-of-account counts for accounting readiness

## Operating rules

- Direct Sale remains separate from Subscription Sale.
- Direct-sale recovery still posts through the direct-sale collection path.
- Subscription collections still post through EMI-safe collection paths.
- Supplier payable review still depends on purchase bills and vendor settlements.
- Reconciliation queues still route to the existing flagged review pages.

## Daily usage

1. Review customer receivables and overdue EMI pressure.
2. Review direct-sale unpaid queue and open controlled collection flow when needed.
3. Review recent collections and payment-method mix.
4. Review supplier payables and purchase-bill obligations.
5. Route flagged items into reconciliation instead of mutating payment history directly.
