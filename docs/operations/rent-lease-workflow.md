# Rent/Lease Workflow (Current Operations)

## Contract onboarding
1. Admin creates RENT/LEASE contract through admin contract APIs.
2. System creates subscription + profile + contract reference.
3. System creates possession tracking row (pending handover).

## Billing and deposit
1. System can generate monthly rent/lease demand rows.
2. Security deposit demand is generated and tracked separately.
3. Deposit collection, deduction, refund-approval, and refund-record are handled through dedicated services and admin finance endpoints.

## Collection operations
- Unified receivable search includes rent/lease references.
- Current collection action for rent/lease in unified cashier/admin flow is **view-only** with explicit disabled reason.
- EMI and direct-sale collection remain active via their existing audited flows.

## Asset safety control
- Direct sale is blocked when the product has active (non-closed) rent/lease possession records.

## Role scope
- Admin and cashier can query receivables through scoped endpoints.
- Customer APIs only expose customer-owned records.
