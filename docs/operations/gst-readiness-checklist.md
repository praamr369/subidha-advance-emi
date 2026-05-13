# GST Readiness Checklist

## 1) Pre-activation data readiness
- Validate active `BusinessTaxProfile` mode and effective dates.
- Complete `ProductTaxProfile` coverage for active products.
- Ensure supplier/customer/partner/vendor `PartyTaxProfile` coverage as required.
- Review missing HSN, legal name, GSTIN, PAN, and state details.

## 2) Turnover and threshold review
- Review aggregate turnover summary.
- Review direct-sale, rent, lease, and service turnover summaries.
- Review supplier GST paid but non-claimable totals.
- Confirm configured alert thresholds are business-approved.

## 3) Activation prerequisites
- `GST_REGULAR` or `GST_COMPOSITION` activation requires:
  - GSTIN
  - effective date
- Activation creates a new effective profile; historical profiles remain preserved.

## 4) Activation safety checks
- Confirm open operational invoices/receipts are reviewed before mode switch.
- Confirm accounting team is ready for GST posting changes.
- Confirm CA/legal sign-off for date, regime, and return obligations.

## 5) Post-activation validation
- New documents should use the newly active tax profile.
- Old documents must retain prior tax snapshots.
- Reconciliation and audit exports should be revalidated for the switch period.

## 6) Rollback posture
- Do not delete historical profiles.
- If business needs reversal, activate a new effective profile instead of editing history.
- Preserve immutable audit trail for every profile switch.
