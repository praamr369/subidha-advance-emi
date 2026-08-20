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

## EMI tax classification — Advance Purchase (Layaway)

**Legal classification**: Advance Purchase scheme — NOT a loan, NOT hire-purchase.

- Customer pays EMIs as advance installments toward future product delivery.
- **Base price is GST-inclusive** (embedded GST at product's applicable rate).
- **EMI = base_price / tenure_months** — exact division, no rounding overcharge.
- No separate GST line items on EMI receipts (`GST_UNREGISTERED` mode).
- No GST tax invoice issued — only commercial receipts.
- **No interest component** — this is NOT a financing/lending product.
- No processing fee, no late fee, no additional charges beyond the base price.
- Tax point under CGST Act s.13(2): at time of supply (delivery), not at each advance collection.
- All EMI amounts posted to single `EMI_INCOME` (EMI-4000) chart account — no principal/interest split required.
- When/if business registers for GST, the transition plan (`gst-transition-plan.md`) applies prospectively.

### Overcharge prevention guard

- `EMI amount × tenure_months` must equal `base_price` exactly.
- Any attempt to add GST surcharge on top of EMI amount is blocked in `GST_UNREGISTERED` mode.
- This guard is enforced at subscription creation and EMI generation.

## Future-readiness data
- Product tax readiness: `ProductTaxProfile` holds HSN/category/rate/effective windows.
- Party tax readiness: `PartyTaxProfile` holds legal tax identity details.
- Readiness data does not alter current non-GST financial posting behavior.
