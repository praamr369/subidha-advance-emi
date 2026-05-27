# Contract Amendment Implementation Plan

Status: **Implemented through Phase 6F.4 backend execution on `update`; frontend execution UI remains deferred.**

## Principle

Implement one controlled phase at a time. Final source mutation is allowed only after accounting and reconciliation evidence are both durable, linked, and verified in the execution transaction.

## Implemented phases

### Phase 1 — Backend foundation

Status: **Implemented**

Customer and partner users can request amendments for allowed contracts. Admin users can review, approve, and reject requests. Approval records decision values but does not automatically mutate financial or operational records.

### Phase 2 — UI only

Status: **Implemented**

Customer, partner, and admin routes expose role-scoped amendment registers and detail pages. Customer and partner screens do not expose implementation controls.

### Phase 3 — Low-risk implementation only

Status: **Implemented**

Implemented source fields:

- `ADDRESS_CHANGE`: `Customer.address`, `Customer.city`
- `CONTACT_CORRECTION`: `Customer.phone`

No subscriptions, EMI rows, payments, receipts, journals, waivers, lucky draw records, rent/lease demands, deposits, inventory, stock, reconciliation records, commission records, or payout records are touched.

### Phase 4 — Same-price product reference correction only

Status: **Implemented**

The existing `PRODUCT_CHANGE` enum remains for compatibility, but implementation behavior is only `PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY`.

Implemented behavior:

- Updates only `Subscription.product`.
- Requires admin approval.
- Blocks different-price target products from same-price source mutation.

### Product recontract preview

Status: **Implemented**

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/
```

Backend-calculated and read-only. It returns old/new product, old/new contract total, price difference, amount already paid, old/proposed remaining balance, current/proposed EMI, pending EMI count, effective date preview, impact type, and warnings.

### Phase 6A — Product recontract snapshot persistence

Status: **Implemented**

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/save/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract-events/
```

`ContractRecontractEvent` persists backend-calculated preview snapshots without mutating source records.

### Phase 6B — Customer consent

Status: **Implemented**

```text
POST /api/v1/customer/contract-amendments/{id}/product-recontract/consent/
```

Consent is recorded only on the saved `ContractRecontractEvent` snapshot. It is required before admin approval. It does not mutate source records.

### Phase 6C — Admin approval workflow

Status: **Implemented**

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/admin-decision/
```

This records `APPROVED` or `REJECTED` only. It does not mutate source records.

### Phase 6D — Future EMI schedule preview

Status: **Implemented**

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/schedule-preview/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract/schedule-preview/
```

`ContractRecontractScheduleLine` persists preview-only future EMI lines. Real EMI rows are unchanged.

### Phase 6E — Accounting and reconciliation impact preview

Status: **Implemented**

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
```

`ContractRecontractFinancialImpactPreview` persists backend-generated impact preview evidence. It does not post journals, create reconciliation items, create settlements, or mutate source records.

### Phase 6F.1 — Posting integration design

Status: **Implemented as documentation**

```text
docs/architecture/product-recontract-posting-integration-design.md
```

### Phase 6F.2 — Durable accounting posting bridge

Status: **Implemented**

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/accounting-posting/
```

Implemented behavior:

- validates preview, consent, approval, schedule preview, and financial impact preview gates
- uses existing `AccountingBridgePosting` / `JournalEntry` bridge
- stores bridge and journal references on recontract event metadata
- rejects duplicate accounting posting
- creates prerequisite accounting evidence only

No subscription, EMI, payment, receipt, finance account balance, settlement/day-close, inventory, delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand, or deposit records are mutated.

### Phase 6F.3 — Durable reconciliation bridge

Status: **Implemented**

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/reconciliation-bridge/
```

Implemented behavior:

- requires preview, consent, approval, schedule preview, financial impact preview, and posted accounting bridge evidence
- creates `ReconciliationRun`, `ReconciliationItem`, `ReconciliationEvidence`, and `FinancialSourceLifecycleEvent`
- links recontract event, financial impact preview, accounting bridge posting, posted journal entry, expected amount, and posted amount
- blocks on variance between expected and posted amount
- rejects duplicate reconciliation bridge evidence
- creates prerequisite reconciliation evidence only

No subscription, EMI, payment, receipt, finance account balance, settlement/day-close, inventory, delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand, or deposit records are mutated.

### Phase 6F.4 — Final backend execution with evidence verification

Status: **Implemented**

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/
```

Implemented behavior:

- runs inside `transaction.atomic()`
- locks amendment, event, subscription, schedule preview lines, pending EMIs, accounting evidence, and reconciliation item where practical
- verifies posted accounting bridge amount equals expected financial impact amount
- verifies reconciliation bridge evidence exists, is linked, is matched, and has zero variance
- mutates only approved subscription and pending EMI fields from preview lines
- records execution in `ContractRecontractEvent.metadata` because the existing status enum has no `EXECUTED`
- emits `CONTRACT_RECONTRACT_EXECUTED` audit metadata through `CONTRACT_AMENDMENT_IMPLEMENTED`

Mutated fields only:

- `Subscription.product`
- `Subscription.total_amount`
- `Subscription.monthly_amount`
- `Subscription.tenure_months`
- pending `Emi.amount`
- pending `Emi.due_date`
- `ContractRecontractEvent.metadata`

Preserved records:

- historical payments
- receipts
- paid/waived/cancelled EMI rows
- accounting postings and journals
- reconciliation evidence
- settlement/day-close records
- finance account balances
- lucky ID and batch
- waiver/lucky draw records
- inventory/stock and delivery records
- commission/payout records
- rent/lease demand and deposit records

## Deferred phases

### Phase 6F.5 — RC hardening and UI readiness

Status: **Deferred**

Required before production rollout:

- failure injection tests
- period/posting-lock tests
- duplicate/idempotency tests
- operational conflict tests
- customer ledger/account-statement tests
- printable addendum tests
- audit export checks
- frontend typed-confirmation execution UI, if approved

## Frontend rule

No broad frontend execution button is added in Phase 6F.4. Admin may show accounting/reconciliation/execution evidence read-only. Any future execution UI must show all gates and require typed confirmation.
