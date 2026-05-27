# Contract Amendment Implementation Plan

Status: **Implemented through Phase 6F.3 on `update`; final product recontract source mutation remains blocked**

## Principle

Implement one controlled phase at a time. Do not move to final source mutation until accounting and reconciliation evidence are both durable, linked, and tested.

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
- Blocks different-price target products from source mutation.

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
- keeps final source mutation blocked

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
- keeps final source mutation blocked

No subscription, EMI, payment, receipt, finance account balance, settlement/day-close, inventory, delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand, or deposit records are mutated.

## Deferred phases

### Phase 6F.4 — Final product recontract source mutation with evidence verification

Status: **Deferred**

Only after Phase 6F.2 and Phase 6F.3 evidence exists and tests pass:

- run inside one transaction
- lock amendment, event, subscription, financial preview, schedule preview lines, accounting evidence, reconciliation evidence, and pending EMIs
- verify posted accounting bridge amount equals expected amount
- verify reconciliation bridge evidence exists and is linked
- mutate only approved subscription and pending EMI fields from preview lines
- preserve all historical payments, receipts, paid EMIs, waivers, draw evidence, settlement/day-close records, inventory records, delivery records, commission/payout records, rent/lease demand records, and deposit records
- mark immutable completion snapshot

### Phase 6F.5 — RC hardening

Status: **Deferred**

Required before production rollout:

- failure injection tests
- period/posting-lock tests
- duplicate/idempotency tests
- operational conflict tests
- customer ledger/account-statement tests
- printable addendum tests
- audit export checks
- frontend read-only evidence display tests

## Frontend rule

Admin may show accounting and reconciliation evidence read-only. Do not add final source-mutation controls until Phase 6F.4 is implemented and backend readiness is explicit.
