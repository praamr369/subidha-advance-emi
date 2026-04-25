# Daily Shop Workflows (Production)

Desktop-first operational sequence for daily retail execution.

## 1. Opening checks (before first customer)

1. Confirm backend health and login surfaces are reachable.
2. Confirm Admin and Cashier users can sign in.
3. Confirm active selling batch is `OPEN` and lucky IDs are available.
4. Confirm assigned counters/cash desks are active for live cashiers.

## 2. Customer onboarding workflow

1. Search customer by phone before create/import.
2. Create customer manually for immediate controlled credentials **or** use CSV import for preload.
3. If imported via CSV, plan immediate password-reset handoff for portal access.
4. Confirm KYC status workflow ownership (PENDING → VERIFIED/REJECTED) in admin.

## 3. Product onboarding workflow

1. Create/edit or CSV import product masters.
2. Validate `base_price` carefully (financial contract driver for Lucky Plan EMI).
3. After import, verify `is_active`, `is_emi_enabled`, `is_rent_enabled`, `is_lease_enabled` flags.
4. Confirm SKU/UOM/category metadata for operational reporting and billing readability.

## 4. Batch and lucky-ID readiness workflow

1. Create batch with correct duration/start/draw-day.
2. Generate/verify lucky IDs before sales opening.
3. Keep sales to operationally ready `OPEN` batch only.
4. Re-check available lucky slots before peak sales window.

## 5. Subscription sale workflow (Lucky Plan EMI)

1. Select existing customer.
2. Select product.
3. Select batch (EMI required).
4. Select lucky ID or allow auto-assignment.
5. Confirm tenure equals batch duration.
6. Submit subscription.
7. Verify generated EMI schedule before collecting first payment.

## 6. Collection workflow (cashier/admin)

1. Search collectible EMI by phone/subscription.
2. Reconfirm customer + EMI row + amount.
3. Collect payment in canonical flow only.
4. Verify receipt and payment history record.
5. For mistakes, escalate to admin reversal; never delete/edit posted money rows directly.

## 7. Day-close workflow

1. Review today’s collections and exceptions.
2. Review pending reversals/approvals.
3. Review reconciliation alerts and unresolved mismatches.
4. Confirm branch/counter cash posture is operationally closed.
