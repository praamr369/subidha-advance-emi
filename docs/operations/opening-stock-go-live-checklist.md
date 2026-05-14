# Opening Stock Go-Live Checklist

## Goal
Load opening stock through controlled, auditable inventory flows before live stock movement and delivery operations.

## Preconditions
1. At least one active warehouse/stock location exists (`/admin/inventory/locations`).
2. Inventory items are configured for products that require stock tracking.
3. Opening quantities and unit costs are approved by operations/finance owners.

## Route
- Opening stock workspace: `/admin/inventory/opening-stock`

## Checklist
1. Prepare source data
- Ensure each row has a valid item identifier (SKU/product mapping).
- Ensure each row has a valid location code (warehouse/stock location).
- Confirm `quantity` and `unit_cost` are correct.
- Confirm effective date policy for go-live baseline.

2. Preview first (no posting)
- Upload/import via opening-stock UI preview controls.
- Resolve all validation errors before posting.
- Reconcile row counts and totals with approved source sheet.

3. Post opening stock
- Execute posting only after preview is clean.
- Confirm batch summary shows posted rows and no unresolved failures.

4. Post-check verification
- Validate stock visibility in stock-on-hand/ledger views.
- Validate no unexpected negative quantities for initialized items.
- Re-run Dry Run Control Center inventory-related checks.

5. Corrections
- Do not edit posted opening rows in place.
- Use correction/adjustment flow so history remains append-only and auditable.

## Guardrails
- Do not set opening unit cost from selling/base price by assumption.
- Do not bypass opening-stock workflow with direct DB edits.
- Do not use fake stock quantities to satisfy readiness checks.

## Go-live sign-off evidence
Capture and archive:
- Location setup confirmation (warehouse active)
- Opening stock preview result
- Opening stock post summary
- Stock ledger verification snapshot
- Dry-run result after setup
