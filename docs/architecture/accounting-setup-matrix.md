# Accounting Setup Matrix

Branch: `update`

Status: **Accounting setup profile separation implemented with frontend compatibility matrix**

## Purpose

Accounting setup must be operator-proof. Admin users must clearly see the difference between money destinations, ledger posting rules, and the ledger structure itself.

```text
Finance Accounts are where money is received or paid.
Posting Profiles decide which ledger accounts are debited and credited.
Chart of Accounts is the ledger structure.
```

## Separation model

### Business Finance Accounts

Business Finance Accounts are operational accounts such as:

```text
Cash desks
Bank accounts
UPI accounts
Payment gateway settlement accounts
```

These may become selectable in collection workflows only when they pass collection readiness.

### System Posting Profiles

System Posting Profiles are diagnostic ledger configuration rows. They are not money destinations.

```text
Ledger posting profiles (system)
```

This row must always be treated as:

```text
diagnostic_only = true
system_posting_profile = true
operational_collection_account = false
collection_ready = false
selectable_for_collection = false
```

Operator copy:

```text
System posting profile diagnostic only; not a customer collection destination.
```

### Chart of Accounts

Chart of Accounts controls the ledger structure. Collection finance accounts must map only to active posting-enabled leaf ASSET accounts.

A group/control/non-posting account may exist for reporting structure, but it must not receive customer collections directly.

## Operational collection readiness rule

A Finance Account is selectable for collection only when all of the following are true:

```text
finance account is active
finance account is operational, not diagnostic
mapped COA exists
mapped COA is active
mapped COA allows manual posting
mapped COA has no children / is leaf
mapped COA account type is ASSET
finance account kind is compatible with collection method
```

Blocked operator copy:

```text
Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account.
```

## Posting profile readiness matrix

The setup matrix tracks these module posting profiles:

| Key | Label | Notes |
| --- | --- | --- |
| `emi_collection` | EMI Collection | Advance EMI posting readiness. |
| `direct_sale_collection` | Direct Sale Collection | Retail/direct-sale collection readiness. |
| `customer_advance` | Customer Advance | Advance/unearned customer money posture. |
| `rent_lease_collection` | Rent / Lease Collection | Deferred until approved collection route exists. |
| `security_deposit` | Security Deposit | Deposit liability posture; no fake collection action. |
| `refund_customer_credit` | Refund / Customer Credit | Refund/customer credit posting posture. |
| `commission_payout` | Commission Payout | Partner commission payout posture. |
| `vendor_payment` | Vendor Payment | Vendor/payables settlement posture. |
| `purchase_inventory` | Purchase / Inventory | Inventory purchase posting posture. |
| `reconciliation_clearing` | Reconciliation Clearing | Clearing/reconciliation posture. |

Each item should expose:

```text
key
label
status: READY | BLOCKED | PARTIAL | DEFERRED
required_debit_account
required_credit_account
configured_debit_account
configured_credit_account
blockers[]
recommended_action
implemented
```

## Repair workflow

Guided repair is allowed only for operational collection accounts.

Allowed repair actions:

```text
create or reuse a posting-enabled leaf ASSET COA
remap the selected FinanceAccount to that leaf account
```

Repair must not:

```text
post payments
create receipts
rewrite journals
mutate settlements
mutate reconciliations
mutate day-close records
mutate subscriptions, EMIs, demands, deposits, inventory, delivery, commissions, payouts, lucky IDs, batches, or amendments
silently repair without explicit confirmation
```

Required operator warning:

```text
This will not post payments, create receipts, rewrite journals, settlements, reconciliations, or day-close records.
```

## Multiple account support

Multiple active accounts are valid:

```text
multiple CASH accounts
multiple BANK accounts
multiple UPI accounts
```

Setup health may warn that multiple accounts exist, but it must not block solely because more than one account of a kind is active.

Apply Suggested Default must preserve multiple active accounts and must not deactivate, remap, or merge them.

## API surfaces

Read surfaces used by the current UI:

```text
GET /api/v1/admin/accounting/setup/readiness/
GET /api/v1/admin/accounting/setup-health/
GET /api/v1/admin/collections/control-center/
GET /api/v1/cashier/collections/control-center/
```

Guided repair surfaces:

```text
GET  /api/v1/admin/accounting/mapping-suggestions/repair/
POST /api/v1/admin/accounting/mapping-suggestions/repair/
```

A backend matrix service exists for the richer matrix contract. Route exposure for a dedicated `/admin/accounting/setup/matrix/` endpoint should be finalized in a follow-up after local route validation. The frontend currently builds a compatibility matrix from the routed readiness payload.

## Existing data impact

No migration is required.

Existing payments, receipts, journals, settlements, reconciliations, day-close records, subscriptions, EMIs, demands, deposits, inventory, delivery, commissions, payouts, lucky IDs, batches, and amendments are not rewritten.

## Financial integrity impact

Payment posting, journal posting, and reconciliation semantics are unchanged.

The change only makes readiness and setup UI stricter and clearer for operators.

## Auditability impact

Repair execution is explicit and per-account. It reports repaired/skipped/failed outcomes and records an audit event for a remapped finance account.

Readiness, setup pages, and control-center pages are read-mostly and do not create financial records.
