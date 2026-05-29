# Contract Amendment Implementation Plan

Status: **Implemented through Phase 8G Amendment Audit Timeline and Decision Sheet Print.**

## Principle

Implement one controlled phase at a time. Final source mutation is allowed only after accounting and reconciliation evidence are both durable, linked, and verified in the backend execution transaction.

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

The existing `PRODUCT_CHANGE` enum remains for compatibility, but generic implementation behavior is only `PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY`.

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
- blocks after recontract execution

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
- blocks after recontract execution

No subscription, EMI, payment, receipt, finance account balance, settlement/day-close, inventory, delivery, commission, payout, waiver, lucky draw, lucky ID, batch, rent/lease demand, or deposit records are mutated.

### Phase 6F.4 — Final backend execution with evidence verification

Status: **Implemented and hardened**

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/
```

Implemented behavior:

- runs inside `transaction.atomic()`
- locks amendment, event, subscription, schedule preview lines, pending EMIs, accounting evidence, and reconciliation item where practical
- verifies posted accounting bridge amount equals expected financial impact amount
- verifies reconciliation bridge evidence exists, is linked, is matched, complete, and has zero variance
- mutates only approved subscription and pending EMI fields from preview lines
- refreshes `Subscription.product_snapshot` and `Subscription.pricing_snapshot` to the executed authoritative state
- preserves prior product/pricing snapshots inside `ContractRecontractEvent.metadata.before_subscription`
- records execution in `ContractRecontractEvent.metadata` because the existing status enum has no `EXECUTED`
- emits `CONTRACT_RECONTRACT_EXECUTED` audit metadata through `CONTRACT_AMENDMENT_IMPLEMENTED`

Mutated fields only:

- `Subscription.product`
- `Subscription.total_amount`
- `Subscription.monthly_amount`
- `Subscription.tenure_months`
- `Subscription.product_snapshot`
- `Subscription.pricing_snapshot`
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

### Phase 6F.5 — Admin typed execution UI

Status: **Implemented**

Implemented behavior:

- admin-only execution panel on amendment detail
- appears only when backend evidence references are complete
- requires exact typed confirmation `EXECUTE RECONTRACT`
- posts only to `/admin/contract-amendments/{id}/product-recontract/execute/`
- hides execution button after success
- exposes read-only execution summary
- no customer, partner, cashier, or vendor execution control

### Phase 6F.6 — RC hardening and executed-state visibility

Status: **Implemented**

Implemented behavior:

- exposes `workflow_flags`, `execution_ready`, and `execution_block_reason`
- exposes old/new monthly amount aliases for reporting
- exposes execution evidence references on admin/customer detail payloads
- shows customer read-only executed summary
- blocks preview/save/consent/admin-decision/schedule/financial/accounting/reconciliation actions after execution
- keeps duplicate execution blocked
- documents current subscription print truth and future printable addendum policy

No new backend mutation logic was added. No rollback or reversal behavior was added.

### Phase 6G — Printable recontract addendum and ledger statement

Status: **Implemented**

Implemented behavior:

- admin print route `/admin/contract-amendments/{id}/recontract-addendum/print`
- customer read-only print route `/customer/contract-amendments/{id}/recontract-addendum/print`
- route builders `buildAdminProductRecontractAddendumPrintRoute(id)` and `buildCustomerProductRecontractAddendumPrintRoute(id)`
- admin/customer amendment detail links shown only when latest product recontract evidence has `executed=true`
- branded Product Recontract Addendum using Business Setup print branding fallback behavior
- old/new product, total, EMI, tenure, paid amount, remaining balance, and effective date display
- pending EMI schedule impact from approved schedule preview lines
- accounting bridge/journal reference display with the statement that accounting evidence was created before execution
- reconciliation run/item/evidence display with the statement that reconciliation evidence was linked before execution
- customer-facing ledger statement showing previous contract total, payments already received, preserved paid amount, new contract total, new remaining balance, and future EMI payable
- protection statements confirming historical payments, receipts, paid EMI rows, lucky ID, batch, waiver/draw, settlement/day-close, stock/delivery, commission/payout, and rent/lease demand/deposit records remain unchanged
- signature blocks and audit footer

Phase 6G is printable addendum only. It reuses executed recontract evidence and existing amendment detail read payloads. No source records mutate. No backend mutation behavior, execution logic, rollback, or reversal was added.

Historical payments and receipts remain unchanged. The ledger statement explicitly does not create payment, receipt, refund, or settlement.

### Phase 8A — Contract Amendment Workflow Stabilization Audit and UI De-duplication

Status: **Implemented**

Implemented behavior:
- Introduces `workflow_capability` on backend serializers.
- Evaluates capability matrix based on amendment type (PRODUCT_RECONTRACT, SAME_PRICE_PRODUCT_REFERENCE, NON_FINANCIAL, LUCKY_ID_BATCH_PREVIEW, RENT_LEASE_PREVIEW, BLOCKED).
- Admin UI conditionally renders type-specific workflow sections (Decision, Product recontract, Direct guarded implementation, Blocked/future workflow).
- Removes generic JSON operator UI for product recontract.
- Ensures legacy apply endpoint gracefully rejects blocked amendments without a 500 error.
- Maintains strict customer/partner read-only behavior.
- Retains existing backend compatibility.

### Phase 8D — Lucky ID / Batch Amendment Preview-Only Workflow

Status: **Implemented**

Implemented behavior:
- Extends workflow capabilities: Lucky ID and Batch changes are classified as `LUCKY_ID_BATCH_PREVIEW`.
- Backend preview endpoint returns current vs requested states without mutating core tables.
- Frontend read-only UI panel surfaces requested changes, availability checks, conflicts, and block reasons.
- Blocks explicit execution logic since changes impact draw eligibility and audit workflows.

### Phase 8E — Rent / Lease Amendment Preview-Only Workflow

Status: **Implemented**

Implemented behavior:
- Extends workflow capabilities: Rent/Lease amendments are classified as `RENT_LEASE_PREVIEW`.
- Backend preview endpoint returns current vs requested states without mutating core tables.
- Frontend read-only UI panel surfaces requested changes, and risk analysis for demand schedule, deposits, accounting, and reconciliation.
- Blocks explicit execution logic since changes require a dedicated accounting and reconciliation workflow.

### Phase 8F — Deposit / Security Amendment Preview-Only Workflow

Status: **Implemented**

Implemented behavior:
- Extends workflow capabilities: Deposit adjustments are classified as `DEPOSIT_SECURITY_PREVIEW`.
- Backend preview endpoint returns current vs requested states without mutating core tables.
- Frontend read-only UI panel surfaces requested changes, risk analysis for refund/deduction mismatches, accounting, and reconciliation.
- Blocks explicit execution logic since changes require a dedicated liability, accounting, and reconciliation workflow.

### Phase 8G — Amendment Audit Timeline + Printable Decision Sheet

Status: **Implemented**

Implemented behavior:
- Exposes `audit_timeline` array and `decision_sheet_summary` payload on backend serializers.
- Frontend admin UI renders the read-only **Amendment Audit Timeline** panel.
- Frontend customer/partner UI renders a simplified read-only audit timeline (admin events filtered out).
- Exposes admin print route `/admin/contract-amendments/{id}/decision-sheet/print`.
- Branded Contract Amendment Decision Sheet displays the audit timeline context, approval decision, preview evidence block, and protection statement.
- No mutation logic is executed.


## Deferred phases

### Phase 6H — Product recontract evidence reporting and RC hardening

Status: **Implemented**

Implemented behavior:

- admin route `/admin/contract-amendments/recontract-report`
- admin-only read endpoint `GET /api/v1/admin/contract-amendments/recontract-report/`
- report rows for amendment, subscription, customer, old/new product, contract totals, price difference, customer consent, admin approval, schedule preview, financial impact preview, accounting bridge, reconciliation bridge, execution state, execution timestamp, journal entry, reconciliation run/item, and addendum print eligibility
- safe filters for execution state, customer consent, admin approval, product, customer search, and created date range
- KPI strip for total previews, customer accepted, admin approved, accounting posted, reconciliation linked, executed, and blockers
- evidence status badges and amendment detail links
- addendum print links only for executed rows
- loading, error, empty, and filtered-empty states
- customer/partner navigation remains free of the admin report link

Phase 6H is read-only reporting and release-candidate hardening only. No mutation, reversal, rollback, posting shortcut, reconciliation shortcut, or execution shortcut was added. Product recontract execution gates remain unchanged.

Historical payments, receipts, paid EMIs, accounting, reconciliation, day-close, lucky ID, batch, waiver/draw, inventory, delivery, commission, payout, rent/lease demand, and deposit records remain immutable from this phase.

### Future controlled reversal workflow

Status: **Deferred**

Any reversal/rollback must be a separate controlled workflow with explicit accounting, reconciliation, audit, approval, and customer communication design. It is not exposed in Phase 6F.6.

## Frontend rule

Admin may show execution controls only before execution and only when all backend evidence exists. Customer, partner, cashier, and vendor users must never see execution controls. Subscription lifecycle pages must not expose apply/execute actions; they may link to amendment detail only.
