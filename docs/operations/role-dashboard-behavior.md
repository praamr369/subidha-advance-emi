# Role Dashboard Behavior

This document defines role-safe dashboard behavior for SUBIDHA CORE.

## Admin Dashboard

- Operates as command center for collections, outstandings, delivery, returns, support, and reconciliation.
- Can expose reversal, reconciliation, inventory control, and admin workflows.
- Uses queue and summary cards sourced from real endpoints only.
- Active KPI cards must exclude cancelled/reversed/void/archived rows where endpoint filtering supports it.

## Cashier Dashboard

- Focuses on collection operations:
  - collect payment
  - collect direct sale balance
  - payment history
- Must not expose admin reversal control, system setup, or draw governance actions.
- Reversed/returned direct-sale rows must display not-collectible copy and hide payment-gateway actions.

## Customer Dashboard

- Focuses on self-service records:
  - contracts
  - payment history
  - delivery and support requests
  - documents and notifications
- Must not show admin accounting, reconciliation, or internal operations actions.

## Partner Dashboard

- Focuses on partner-owned operations:
  - customers
  - subscriptions
  - commissions
  - payouts
  - notifications
- Must not expose reversal center, accounting admin controls, or platform setup actions.

## Vendor Dashboard

- Focuses on vendor-only operations:
  - quote requests
  - purchase orders
  - ledger/outstanding
  - products and documents
  - notifications
- Must not expose customer/admin financial control pages.

## Shared Guardrails

- Role-specific notification endpoints should be used for bell and notification center.
- Sidebar groups and quick actions must remain role-scoped.
- Any unavailable module should render a safe empty/help state, not mock operational data.
- Do not expose admin-only routes to cashier/customer/partner/vendor via sidebar, dashboard cards, or quick actions.
- Vendor dashboard may show a safe shell if modules are not yet implemented; no fabricated operational metrics.
