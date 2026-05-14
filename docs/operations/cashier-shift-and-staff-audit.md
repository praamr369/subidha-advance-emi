# Cashier Shift And Staff Audit

## Current operational contract
There is no dedicated cashier shift entity yet. Current accountability is enforced through:
- branch assignment controls (`branch_control`)
- cash counter assignment (`CashCounter.assigned_user`)
- cashier collection endpoints and persisted payment/receipt attribution
- audit and business event logs

## Cashier guardrails in code
- Cashier collection endpoints are limited to cashier/admin role gates.
- Branch and counter access are validated before payment or direct-sale collection writes.
- Counter-to-finance-account and branch consistency are validated before posting.

## What is attributable today
- EMI collection: operator (`collected_by`), branch, counter, finance account, payment reference.
- Direct-sale collection: receipt creator plus branch/counter/finance-account context.
- Cashier payment history APIs are branch-scoped for assigned cashier visibility.

## Staff audit operation checklist
1. Verify counter assignment for cashier before shift start.
2. Verify cashier collections include branch/counter attribution.
3. Review day-level cashier payment history in cashier/admin views.
4. Review audit logs for reversals/voids/refunds/approvals.
5. Confirm no collection was posted through cross-branch finance account mismatch.

## Proposed future additive shift controls (not yet implemented)
- Shift open with opening cash declaration.
- Shift close with expected-vs-actual variance capture.
- Supervisor close approval with immutable close event record.
