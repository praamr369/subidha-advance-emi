# Contract Amendment Workflow

Status: Phase 1 request/review, Phase 2 UI, Phase 3 customer corrections, Phase 4 same-price product reference correction, product recontract preview, Phase 6A preview snapshot persistence, Phase 6B customer consent, Phase 6C admin decision recording, Phase 6D schedule preview-line persistence, Phase 6E financial impact preview evidence, Phase 6F.2 accounting posting evidence, Phase 6F.3 reconciliation bridge evidence, and Phase 6F.4 backend execution are implemented on `update`.

## Scope

Contract amendments support EMI Subscription and Rent / Lease contracts. Direct Sale corrections stay in their existing billing, return, exchange, refund, cancellation, and invoice workflows.

## Phase 1 — Request and review foundation

Customer and partner users can request amendments for allowed linked contracts. Admin users can inspect, mark under review, approve, or reject. Approval records decision values but does not automatically mutate financial or operational records.

## Phase 2 — Role-scoped UI

Customer, partner, and admin amendment screens show request and review state. Customer and partner screens do not expose implementation or recontract preview controls.

The subscription lifecycle page is not an implementation surface. Its Contract Amendments panel is read-only and links to `/admin/contract-amendments/{id}` for review, preview, and guarded detail-page actions.

## Phase 3 — Low-risk implementation

Implemented only:

- `CONTACT_CORRECTION`: updates `Customer.phone`
- `ADDRESS_CHANGE`: updates `Customer.address` and `Customer.city`

This is admin-only, approval-required, audited, and idempotent.

## Phase 4 — Same-price product reference correction

The existing `PRODUCT_CHANGE` enum remains for compatibility, but current implementation is only `PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY`.

It can update only `Subscription.product` when the target product base price equals the locked contract total. It does not recalculate price, EMI, tenure, payment, receipt, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

Different-price target products are handled by the product recontract workflow.

## Product recontract preview

Admin users can preview the financial impact of a true product recontract without applying it:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/
```

Impact types:

```text
UPGRADE_EXTRA_PAYABLE
DOWNGRADE_CREDIT_REQUIRED
SAME_PRICE_REFERENCE_CORRECTION
```

The preview does not mutate source records.

## Phase 6A — Product recontract preview snapshot persistence

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/save/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract-events/
```

The save endpoint recalculates the preview on the backend and stores a `ContractRecontractEvent` snapshot. Prior active preview events for the same amendment are marked `SUPERSEDED`; retained history remains available through the events endpoint.

## Phase 6B — Customer consent for saved preview snapshots

```text
POST /api/v1/customer/contract-amendments/{id}/product-recontract/consent/
```

Allowed decisions are `ACCEPTED` and `REJECTED`, with an optional note. Consent is recorded on the latest active `PREVIEWED` `ContractRecontractEvent` only.

## Phase 6C — Admin approval/rejection for customer-accepted previews

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/admin-decision/
```

Allowed decisions are `APPROVED` and `REJECTED`, with an optional note. This stores admin approval evidence only and does not mutate source records.

## Phase 6D — Future EMI schedule preview lines

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/schedule-preview/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract/schedule-preview/
```

This creates preview evidence only (`ContractRecontractScheduleLine`). Real EMI rows and all financial/accounting/reconciliation source records remain unchanged.

## Phase 6E — Accounting/reconciliation impact preview evidence

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
```

This creates additive evidence (`ContractRecontractFinancialImpactPreview`) only. No journal posting occurs. No finance account balances are mutated. No reconciliation items or settlement records are created.

## Phase 6F.2 — Durable accounting posting evidence only

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/accounting-posting/
```

This posts a real `JournalEntry` through the accounting bridge and links it with `AccountingBridgePosting` using purpose `CONTRACT_RECONTRACT_ACCOUNTING_ADJUSTMENT`. It is prerequisite accounting evidence only. It does not execute the product change, mutate subscription terms, rewrite EMI rows, create payments, create receipts, create settlement allocations, or touch inventory, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

## Phase 6F.3 — Durable reconciliation bridge evidence only

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/reconciliation-bridge/
```

This creates `ReconciliationRun`, `ReconciliationItem`, `ReconciliationEvidence`, and `FinancialSourceLifecycleEvent` records. The reconciliation item links the recontract event, financial impact preview, accounting bridge posting, posted journal entry, expected adjustment amount, and actual posted amount.

The expected amount must equal the posted journal amount. Variance returns a controlled error.

## Phase 6F.4 — Final backend execution after evidence verification

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/
```

The endpoint is admin-only and executes only after all preview, consent, approval, accounting, and reconciliation evidence gates pass.

Execution mutates only:

- `Subscription.product`
- `Subscription.total_amount`
- `Subscription.monthly_amount`
- `Subscription.tenure_months`
- pending `Emi.amount`
- pending `Emi.due_date`
- `ContractRecontractEvent.metadata` execution snapshot

Execution does not mutate historical payments, receipts, paid/waived/cancelled EMI rows, accounting postings, reconciliation evidence, settlement/day-close records, lucky ID, batch, waiver/lucky draw, inventory, delivery, commission, payout, rent/lease demand, or deposit records.

## Admin API inventory

```text
GET  /api/v1/admin/contract-amendments/
GET  /api/v1/admin/contract-amendments/{id}/
POST /api/v1/admin/contract-amendments/{id}/review/
POST /api/v1/admin/contract-amendments/{id}/approve/
POST /api/v1/admin/contract-amendments/{id}/reject/
POST /api/v1/admin/contract-amendments/{id}/implement/
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/save/
POST /api/v1/admin/contract-amendments/{id}/product-recontract/admin-decision/
POST /api/v1/admin/contract-amendments/{id}/product-recontract/schedule-preview/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract/schedule-preview/
POST /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
POST /api/v1/admin/contract-amendments/{id}/product-recontract/accounting-posting/
POST /api/v1/admin/contract-amendments/{id}/product-recontract/reconciliation-bridge/
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract-events/
```

## Deferred phases

Frontend execution UI, typed confirmation, printable addendum, customer ledger statement, and RC failure-injection hardening remain deferred after backend Phase 6F.4.
