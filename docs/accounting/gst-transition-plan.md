# GST Transition Plan (Additive)

## Objective
Move from `GST_UNREGISTERED` to GST-registered mode without rewriting historical documents.

## Step 1: Readiness baseline
- Confirm product and party tax readiness masters are sufficiently populated.
- Confirm turnover and alert reports with finance + CA review.

## Step 2: Effective profile activation
- Activate a new `BusinessTaxProfile` with:
  - mode: `GST_REGULAR` or `GST_COMPOSITION`
  - GSTIN
  - effective date
- Previous active profile is deactivated and retained historically.

## Step 3: Operational cutover
- New documents use the new active profile snapshot.
- Historical invoices/receipts remain untouched.
- No retroactive tax recalculation of closed documents.

## Step 4: Controls and visibility
- Keep compliance controls admin-only.
- Verify role-based surfaces after activation.
- Re-validate invoice/receipt templates and reporting fields.

## Step 5: Verification and audit
- Validate journal behavior for first post-transition day.
- Validate receivable/payable reconciliation around the boundary date.
- Archive a dated activation note for CA/legal audit trail.

## Step 6: Follow-up
- Keep threshold alerts configurable and reviewed periodically.
- Review interstate and service-income tracking quality for return filing readiness.
