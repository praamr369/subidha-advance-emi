# Pre-Live Inventory Warehouse Setup

## Goal
Resolve Dry Run Control Center blocker `STOCK_NEED_WORKFLOW_READINESS` by creating at least one active warehouse/stock location through approved admin flows.

## Scope and safety
- This is an operator setup workflow.
- Do not create fake products, fake stock, or backdated financial rows.
- Do not alter EMI, payment, lucky draw, commission, payout, reconciliation, or accounting history behavior.
- Keep inventory onboarding explicit and auditable.

## Why the blocker appears
The dry-run check blocks when there is no active `Warehouse` record.

Blocking condition (backend):
- `Warehouse.objects.filter(is_active=True).exists()` is false.

Result shown in Dry Run Control Center:
- `No active warehouse configured`
- `Purchase/stock needs require at least one warehouse.`

## Where to fix from UI
From Dry Run Control Center result row:
- Click `Open` on the stock-need readiness row.
- Target route: `/admin/inventory/locations`

You can also navigate manually:
1. `Admin`
2. `Inventory`
3. `Stock Locations`

## Operator steps: create warehouse/stock location
1. Open `/admin/inventory/locations` as an admin user.
2. In `Create Location` form, fill:
- `Location Code` (example: `MAIN-WH`)
- `Location Name` (example: `Main Warehouse`)
- `Location Type` = `Warehouse`
- `Branch` (optional, choose if branch-controlled inventory is active)
- Keep `Location is active for daily stock operations` checked
- Optional `Notes`
3. Click `Create Location`.
4. Verify the new row appears in `Location Register` with:
- Type = `WAREHOUSE`
- Status = `Active`

## Verification after setup
1. Go to `Dry Run Control Center` (`/admin/settings/business-setup/dry-runs`).
2. Run `STOCK_NEED_WORKFLOW_READINESS` (or full pre-live dry run).
3. Expected result:
- No `BLOCKED` for missing warehouse.
- Check is `PASS` if no non-terminal stock needs exist, or `WARNING` if operational stock needs are open.

## Access control
- Warehouse/stock-location create/edit is admin-only.
- Non-admin users are denied by API permission checks.

## Operational note
Creating a location/warehouse only establishes inventory master setup. It does not post opening stock. Use the opening-stock workflow separately before go-live stock operations.
