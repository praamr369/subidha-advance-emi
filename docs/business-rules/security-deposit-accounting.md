# Security Deposit Accounting (Current Code)

This is the current behavior in code, not a speculative design.

## Source-of-truth records
- Deposit demand and balances: `RentLeaseBillingDemand` (`SECURITY_DEPOSIT` demand type).
- Deposit movement trail: `RentLeaseDepositTransaction`.
- Contract profile snapshots:
  - `RentSubscriptionProfile`
  - `LeaseSubscriptionProfile`

## Financial posture in current code
- Security deposit is tracked separately from monthly rent/lease demand rows.
- Deposit collected amount, held amount, refundable amount, and deducted amount are stored explicitly.
- Refund and deduction actions are append-only transaction events and auditable.

## Accounting bridge status
- Sync boundary service exists:
  - `subscriptions.services.rent_lease_finance_sync_service`
- Current status: deferred bridge logging (`ACCOUNTING_SYNC_SKIPPED`) unless/ until full posting bridge is enabled.
- This preserves source record authority and auditability without fake journal posting.

## Auditability controls
- Deposit demand create, collect, deduction, refund approval, and refund record operations all emit audit events.
- Deduction requires a non-empty reason.
