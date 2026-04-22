# Supplier Ledger Workflow

## Goal

Use the existing vendor, purchase-bill, settlement, inventory, and finance-account structures as one operational payable workflow.

## Operational flow

1. Maintain supplier master data from `Admin > Inventory & Supplier Purchases > Suppliers`.
2. Record procurement through `Purchase Bills`.
3. Post approved purchase bills so stock and accounting stay aligned.
4. Review payable posture from the supplier operational summary.
5. Create and post settlements from `Supplier Settlements`.

## What stays connected

- supplier master
- purchase bill history
- settlement history
- outstanding payable summary
- payable timeline
- linked finance accounts
- inventory-linked purchase posting

## Controls

- Purchase bills remain the payable source document.
- Settlements remain separate payment records against vendor liabilities.
- Posted purchase bills and posted settlements continue to drive the payable summary.
- Supplier payables stay inside the same accounting-safe system instead of a separate ERP module.

## Navigation

Supplier workflow entry points now sit together under `Inventory & Supplier Purchases` so procurement, inventory, and payables are reachable from one business rail.

The finance control center also surfaces supplier payable posture so admin can review customer dues and supplier liabilities from one connected operational layer without creating a second payable system.
