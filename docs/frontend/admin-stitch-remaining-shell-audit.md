# Admin Stitch Remaining Shell Audit (Accounting, Finance, Reconciliation, Inventory, Products)

Date: 2026-05-19
Scope: frontend route-shell consistency only for admin accounting/finance/reconciliation/inventory/products surfaces.

Guardrails applied:
- Frontend-only
- No backend/API/model/contract changes
- No fake data/actions
- Keep existing route guards and route behavior
- Convert only where shell swap is safe and non-operationally-destructive

## Classification legend
- convert now: safe shell-only wrapper improvement
- keep as-is: already strong/specialized operational layout
- keep temporarily: legacy/redirect/compatibility surface
- needs later decision: thin/placeholder/unclear workflow that needs product/ops decision

## Stitch references used
- `accounting_control_center_refined`
- `accounting_books_ledgers`
- `financial_audit_payout_hub`
- `financial_reconciliation_workspace`
- `inventory_operations_workspace`
- `product_catalog_management`
- `product_import_workspace`
- `purchase_quote_management`
- `day_end_reconciliation_*` reconciliation references

## Accounting routes

### convert now
- none

### keep as-is
- `/admin/accounting`
- `/admin/accounting/assets`
- `/admin/accounting/attendance`
- `/admin/accounting/audit-control`
- `/admin/accounting/books`
- `/admin/accounting/books/bank`
- `/admin/accounting/books/cash`
- `/admin/accounting/books/purchase`
- `/admin/accounting/books/sales`
- `/admin/accounting/books/upi`
- `/admin/accounting/bridges`
- `/admin/accounting/control-center`
- `/admin/accounting/depreciation`
- `/admin/accounting/expense-claims`
- `/admin/accounting/expenses`
- `/admin/accounting/exports`
- `/admin/accounting/exports/itr-pack`
- `/admin/accounting/gst`
- `/admin/accounting/gst/credit-notes`
- `/admin/accounting/gst/debit-notes`
- `/admin/accounting/gst/tax-invoices`
- `/admin/accounting/journals`
- `/admin/accounting/leave`
- `/admin/accounting/periods`
- `/admin/accounting/purchase-bills`
- `/admin/accounting/reconciliation`
- `/admin/accounting/reports/balance-sheet`
- `/admin/accounting/reports/profit-loss`
- `/admin/accounting/reports/trial-balance`
- `/admin/accounting/salary`
- `/admin/accounting/salary/[id]`
- `/admin/accounting/setup`
- `/admin/accounting/staff`
- `/admin/accounting/staff-ledger`
- `/admin/accounting/vendor-settlements`
- `/admin/accounting/vendors`

Rationale: existing pages are operationally dense (registers/forms/tables/audit-sensitive controls) and already aligned with accounting-centric posture. Shell rewrites here are not purely cosmetic and risk regressions in high-consequence workflows.

### keep temporarily
- `/admin/accounting/finance-accounts` (canonical redirect compatibility)
- `/admin/accounting/journal-entries` (canonical redirect compatibility)
- `/admin/accounting/posting-profiles` (canonical redirect compatibility)

### needs later decision
- `/admin/accounting/chart-of-accounts`

Rationale: route currently mixes setup concerns and register semantics; likely needs explicit ops decision on final lane ownership vs accounting setup/posting profile surfaces before deeper shell normalization.

## Finance routes

### convert now
- `/admin/finance/workspace`

Rationale: route used `OperationsWorkspaceShell` while sibling workspace routes already use `AdminWorkspaceFamilyShell`; conversion is shell-level only and keeps loader/actions untouched.

### keep as-is
- `/admin/finance`
- `/admin/finance/commissions`
- `/admin/finance/commissions/settled`
- `/admin/finance/deposits`
- `/admin/finance/payout-batches`
- `/admin/finance/payout-batches/[id]`
- `/admin/finance/reversal-control`
- `/admin/finance/reversal-control/[id]`
- `/admin/finance/reversal-reconciliation`

Rationale: these are already specialized posting/reversal/payout/reconciliation operational compositions with real data states.

### keep temporarily
- `/admin/finance/collect` (delegates to canonical payment collection page)
- `/admin/finance/reconciliation` (delegates to canonical reconciliation page)
- `/admin/finance/commisions` (typo-route canonical redirect compatibility)

### needs later decision
- none

## Reconciliation routes

### convert now
- none

### keep as-is
- `/admin/reconciliation`

Rationale: strong reconciliation workspace with variance/posting controls; avoid shell churn.

### keep temporarily
- none

### needs later decision
- none

## Inventory routes

### convert now
- none

### keep as-is
- `/admin/inventory`
- `/admin/inventory/adjustments`
- `/admin/inventory/categories`
- `/admin/inventory/demand-planning`
- `/admin/inventory/godowns`
- `/admin/inventory/items`
- `/admin/inventory/items/new`
- `/admin/inventory/ledger`
- `/admin/inventory/locations`
- `/admin/inventory/low-stock`
- `/admin/inventory/movements`
- `/admin/inventory/opening-stock`
- `/admin/inventory/profiles`
- `/admin/inventory/profiles/[id]`
- `/admin/inventory/purchase-needs`
- `/admin/inventory/readiness`
- `/admin/inventory/stock-needs`
- `/admin/inventory/stock-on-hand`
- `/admin/inventory/valuation`
- `/admin/inventory/workspace`

Rationale: stock-ledger/movement-oriented pages already have operational composition and mostly consistent workspace/register posture.

### keep temporarily
- `/admin/inventory/items/[id]` (alias to profile detail for compatibility)
- `/admin/inventory/items/[id]/edit` (legacy redirect-like compatibility behavior)

### needs later decision
- none

## Products routes

### convert now
- none

### keep as-is
- `/admin/products`
- `/admin/products/[id]`
- `/admin/products/[id]/edit`
- `/admin/products/create`
- `/admin/products/import`
- `/admin/products/masters`
- `/admin/products/workspace`

Rationale: catalog/control and import operations are already implemented with strong operational layouts and family-shell alignment where appropriate.

### keep temporarily
- none

### needs later decision
- none

## Summary counts
- convert now: 1
- keep as-is: 68
- keep temporarily: 8
- needs later decision: 1

## Changes applied in this pass
- Converted `/admin/finance/workspace` to `AdminWorkspaceFamilyShell` for family consistency.
- No business logic, service wiring, endpoint, or payload handling changes.
