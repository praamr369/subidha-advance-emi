# Non-GST First-Stage Business Rules

## Current compliance posture
- Business tax mode is `GST_UNREGISTERED` by default.
- Direct sale documents are treated as `COMMERCIAL_INVOICE`.
- Advance EMI receipts are treated as non-GST commercial receipts.
- Rent and lease receipts are treated as non-GST receipts.

## Non-GST document behavior
- GST tax invoice creation is blocked while active mode is `GST_UNREGISTERED`.
- Seller GSTIN is not printed in non-GST snapshots.
- `CGST`, `SGST`, and `IGST` are stored as zero in non-GST snapshots.
- Existing invoices/receipts keep historical tax snapshot values; no retroactive rewrite.

## Purchase behavior in non-GST mode
- Supplier tax from purchase bills can be captured for costing visibility.
- Input GST claim (`ITC`) is blocked while `GST_UNREGISTERED`.
- Supplier GST flows into landed cost under inventory/purchase posting.

## Restricted controls
- Compliance tax profile setup is admin-only.
- Cashier, partner, and customer roles cannot manage compliance tax profile.
- `/api/v1` prefix and existing operational contracts remain unchanged.

## Future-readiness data
- Product tax readiness: `ProductTaxProfile` holds HSN/category/rate/effective windows.
- Party tax readiness: `PartyTaxProfile` holds legal tax identity details.
- Readiness data does not alter current non-GST financial posting behavior.
