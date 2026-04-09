# Admin Enterprise Workspace

This guide explains how admin users should navigate SUBIDHA CORE as one enterprise workspace while the system transitions away from third-party ERP usage.

## Start from the admin dashboard

Primary route:
- `/admin`

Use the dashboard for:
- overdue EMI follow-up
- flagged reconciliation attention
- pending delivery actions
- pending support issues
- commission and payout actions
- onboarding handoff

The dashboard is not a second source of financial truth. It is a routing workspace into the canonical operational pages.

## Canonical sidebar sections

### Control Center
- `/admin`
- `/admin/analytics`
- `/admin/reports`
- `/admin/support-requests`

### Sales & Onboarding
- `/admin/leads`
- `/admin/subscription-requests`
- `/admin/customers`
- `/admin/subscriptions`

### Collections & EMI
- `/admin/collections`
- `/admin/payments`
- `/admin/emis`
- `/admin/reminders`
- `/admin/reconciliation`

### Fulfillment
- `/admin/deliveries`
- `/admin/lucky-ids`
- `/admin/lucky-draws`

### Catalog & Inventory
- `/admin/products`
- `/admin/inventory`
- `/admin/inventory/locations`
- `/admin/inventory/items`
- `/admin/inventory/adjustments`
- `/admin/batches`

### Partner Finance
- `/admin/partners`
- `/admin/finance/commissions`
- `/admin/finance/reconciliation`
- `/admin/finance/commissions/settled`
- `/admin/finance/payout-batches`

### Billing & Accounting
- `/admin/billing`
- `/admin/billing/register`
- `/admin/billing/direct-sales`
- `/admin/billing/contracts`
- `/admin/accounting`
- `/admin/accounting/books`
- `/admin/accounting/bridges`

### Governance
- `/admin/audit-logs`
- `/admin/settings`

## Compatibility paths

Some older paths still exist so imported links, bookmarks, and compatibility helpers do not break.

Examples:
- `/admin/lucky-draw`
- `/admin/finance/commisions`
- `/admin/partners/commisions`
- `/admin/partner/commisions`
- `/admin/emi/overdue`

These are compatibility-only. Daily navigation should use the canonical sidebar routes.

## Shared master-data rule for operators

When staff need to change master data:

1. Start at product master first.
2. Maintain category, subcategory, and unit masters from `/admin/products/masters`.
3. Keep SKU and product code at the individual product level.
4. Extend into inventory only for stock-tracked items by preparing the inventory profile from the product workspace.
5. Use direct sales for non-EMI retail orders and keep them separate from Lucky Plan subscriptions.
6. Use billing contracts and documents as mirrors, not contract truth.
7. Use accounting masters and bridges for books, not for direct operational editing.
8. Assign a real finance account on payout batches before finalization when partner payout should appear in cash, bank, or UPI books.

This keeps one source of truth per domain and prevents ERP-style duplication drift.

## Product master operator workflow

Use the product area in this order:

1. `/admin/products/masters`
   - add or review category, subcategory, and unit masters
2. `/admin/products/create` or `/admin/products/{id}/edit`
   - create or update product code, SKU, price, description, and plan capability flags
3. `/admin/products/{id}`
   - prepare the inventory profile only when the product should participate in stock workflows
4. `/admin/inventory/locations`
   - maintain store, warehouse, and showroom stock locations for daily operations
5. `/admin/inventory/items`
   - govern stock-facing profile fields such as default location, reorder level, stock item type, and delivery bridge participation
6. `/admin/products/import`
   - bulk import product rows only after master values are approved

Guardrails:
- Product base price remains the contract total; this workflow does not redefine EMI pricing.
- CSV import extends product master metadata safely and must not create a second financial truth.
- Inventory preparation is catalog-to-stock setup only; it does not post stock or billing events.
- Inventory adjustments and opening stock remain explicit operational stock postings, not catalog edits.
