# First-Run Business Operating Setup (SUBIDHA CORE)

This document describes the canonical “first run” setup flow after a controlled business reset, using the existing SUBIDHA CORE modules (Branch Control, Accounting, Inventory, Subscriptions) plus the additive Business Profile.

This is designed to be:
- operationally practical for a real shop
- financially safe (no EMI/ledger logic changes)
- auditable
- backward compatible
- future-ready for RENT/LEASE without forcing those modules today

## When to use this flow

Use this flow when you want to start fresh (demo → real operations, or data clean slate) while preserving only the chosen admin login.

## Entry point in the UI

After logging in as an ADMIN, go to:
- `Admin → Settings → Business setup` (`/admin/settings/business-setup`)

This area provides:
- setup overview + readiness status
- a checklist grouped by required/recommended/optional
- a controlled go-live reset panel (dry-run supported)

## Recommended order

### 1) Business profile (required)
Route:
- `/admin/settings/business-setup/profile`

Configure:
- business name (legal name)
- trade name (optional)
- address and contact
- invoice/receipt prefixes (optional, if you use prefix-based series)

Notes:
- Only one active profile is allowed at a time (enforced by validation).

### 2) Branch setup (required)
Routes:
- Branches: `/admin/branches`
- Counters: `/admin/counters`

Configure:
- at least one active branch
- mark exactly one branch as the primary branch
- at least one active counter mapped to a finance account

Why it matters:
- branch/counter mapping is used for real operational flows (collections, receipts, and branch-level reporting).

### 3) Accounting setup (required)
Routes:
- Chart & finance accounts: `/admin/accounting/chart-of-accounts`
- Books: `/admin/accounting/books`
- Periods: `/admin/accounting/periods` (recommended)

Minimum setup:
- create chart accounts (ASSET/INCOME/EXPENSE as needed)
- create finance accounts:
  - at least one CASH finance account
  - at least one BANK or UPI finance account

Important:
- The accounting workspace is kept separate from the EMI payment ledger and does not rewrite historical EMI semantics.

### 4) Products (required)
Route:
- `/admin/products`

Configure:
- at least one active product before onboarding customers/subscriptions.

### 5) Lucky Plan batches (recommended)
Route:
- `/admin/batches`

Configure:
- at least one batch when you’re ready to onboard Lucky Plan subscriptions.

### 6) Staff and internal users (recommended)
Routes:
- Internal user list: `/admin/settings/users`
- Create internal user: `/admin/settings/users/create`

Recommended:
- at least one CASHIER user for daily collections
- keep ADMIN users limited to reduce operational risk

### 7) Inventory readiness (optional)
Route:
- `/admin/inventory`

Only configure if you plan to track:
- stock locations
- inventory items
- stock movements for deliveries/returns/purchases

## Readiness indicator

The system computes readiness from real existing data and shows:
- **Required** items (go-live blockers)
- **Recommended** items (strongly suggested for clean operations)
- **Optional** items (only if you use those modules)

See:
- `/admin/settings/business-setup/checklist`

