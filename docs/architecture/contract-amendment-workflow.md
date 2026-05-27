# Contract Amendment Workflow

Status: Phase 1 request/review, Phase 2 UI, Phase 3 customer corrections, Phase 4 same-price product reference correction, product recontract preview, Phase 6A preview snapshot persistence, Phase 6B customer consent, Phase 6C admin decision recording, Phase 6D schedule preview-line persistence, and Phase 6E financial impact preview evidence are implemented on `update`. Phase 6F exposes a guarded admin endpoint but returns a controlled 400 until real accounting and reconciliation posting integration exists.

## Scope

Contract amendments support EMI Subscription and Rent / Lease contracts. Direct Sale corrections stay in their existing billing, return, exchange, refund, cancellation, and invoice workflows.

## Phase 1 — Request and review foundation

Customer and partner users can request amendments for allowed linked contracts. Admin users can inspect, mark under review, approve, or reject. Approval records decision values but does not automatically mutate financial or operational records.

## Phase 2 — Role-scoped UI

Customer, partner, and admin amendment screens show request and review state. Customer and partner screens do not expose implementation or recontract preview controls.

The subscription lifecycle page is not an implementation surface. Its Contract Amendments panel is read-only and links to `/admin/contract-amendments/{id}` for review, preview, and any guarded detail-page action. Apply/execute wording is forbidden in the lifecycle amendment panel.

## Phase 3 — Low-risk implementation

Implemented only:

- `CONTACT_CORRECTION`: updates `Customer.phone`
- `ADDRESS_CHANGE`: updates `Customer.address` and `Customer.city`

This is admin-only, approval-required, audited, and idempotent.

## Phase 4 — Same-price product reference correction

The existing `PRODUCT_CHANGE` enum remains for compatibility, but current implementation is only `PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY`.

It can update only `Subscription.product` when the target product base price equals the locked contract total. It does not recalculate price, EMI, tenure, payment, receipt, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

Different-price target products are blocked from implementation with a financial recontract message.

## Product recontract preview

Admin users can preview the financial impact of a true product recontract without applying it:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/
```

The preview is backend-calculated. It returns old/new product, old/new contract total, price difference, amount already paid, old/proposed remaining balance, current/proposed EMI, pending EMI count, impact type, effective date preview, warnings, and `source_record_mutation = false`.

Impact types:

```text
UPGRADE_EXTRA_PAYABLE
DOWNGRADE_CREDIT_REQUIRED
SAME_PRICE_REFERENCE_CORRECTION
```

The preview does not mutate source records. Accounting and reconciliation posting are future work.

## Phase 6A — Product recontract preview snapshot persistence

Admin users can explicitly persist backend-calculated preview evidence:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/save/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract-events/
```

The save endpoint recalculates the preview on the backend and stores a `ContractRecontractEvent` snapshot. Prior active preview events for the same amendment are marked `SUPERSEDED`; retained history remains available through the events endpoint. Amendment metadata stores the latest preview event id for review convenience.

Phase 6A is audit evidence only. It does not change the real contract, EMI schedule, payments, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records. Customer consent, admin decision recording, future EMI schedule change, accounting posting, reconciliation, execution endpoint, and printable addendum are handled in later phases.

Product upgrade/downgrade remains preview-only and future-recontract work. It must not be applied from the subscription lifecycle page.

## Phase 6B — Customer consent for saved preview snapshots

Customer users can view the latest active saved product recontract preview summary on their own amendment detail and record a consent decision:

```text
POST /api/v1/customer/contract-amendments/{id}/product-recontract/consent/
```

Allowed decisions are `ACCEPTED` and `REJECTED`, with an optional note. Consent is recorded on the latest active `PREVIEWED` `ContractRecontractEvent` only. A second consent attempt for the same snapshot is rejected. Superseded or cancelled snapshots cannot receive consent.

Phase 6B is consent evidence only. It does not mutate `Subscription.product`, contract totals, monthly EMI, tenure, EMI rows, payments, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

Admin amendment detail shows customer consent status read-only. Admins cannot override or submit customer consent in this phase. Customer consent is required before admin approval.

## Phase 6C — Admin approval/rejection for customer-accepted previews

Admin users can record a decision for the latest active saved product recontract preview only after the customer consent status is `ACCEPTED`:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/admin-decision/
```

Allowed decisions are `APPROVED` and `REJECTED`, with an optional note. The endpoint rejects missing saved previews, pending customer consent, customer rejection, superseded/cancelled previews, and second admin decision attempts.

Phase 6C is decision evidence only. It stores admin approval status, actor, timestamp, note, and approval snapshot on `ContractRecontractEvent`. It does not mutate `Subscription.product`, contract totals, monthly EMI, tenure, EMI rows, payments, receipts, accounting, reconciliation, stock, delivery, commission, payout, waiver, lucky ID, batch, rent/lease demand, or deposit records.

No execution endpoint or execution button exists in Phase 6C. Future EMI schedule update, accounting/reconciliation integration, execution endpoint, and printable addendum remain future phases.

## Phase 6D — Future EMI schedule preview lines

Admin can generate backend schedule preview lines only after customer `ACCEPTED` and admin `APPROVED` on the latest `PREVIEWED` recontract event:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/schedule-preview/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract/schedule-preview/
```

This creates preview evidence only (`ContractRecontractScheduleLine`). Real EMI rows and all financial/accounting/reconciliation source records remain unchanged. Execution remains a future phase.

## Phase 6E — Accounting/reconciliation impact preview evidence

Admin can generate accounting/reconciliation impact preview evidence only after customer `ACCEPTED`, admin `APPROVED`, and schedule preview lines exist:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
GET  /api/v1/admin/contract-amendments/{id}/product-recontract/financial-impact-preview/
```

This creates additive evidence (`ContractRecontractFinancialImpactPreview`) only. No journal posting occurs. No finance account balances are mutated. No reconciliation items or settlements are created. Execution remains future work.

## Phase 6F — Product recontract execution endpoint blocked

Admin endpoint:

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/
```

The endpoint is present for route stability and gate testing, but execution is not enabled. It runs inside `transaction.atomic()`, locks the amendment, latest recontract event, subscription, financial preview, and pending EMI rows, then enforces the execution gates:

- latest event status is `PREVIEWED`
- customer consent is `ACCEPTED`
- admin approval is `APPROVED`
- schedule preview lines exist and map exactly to current pending EMI rows
- latest financial impact preview exists with accounting and reconciliation statuses `PREVIEWED`
- event is not already marked executed in metadata

After those checks, the endpoint returns:

```text
Product recontract execution requires accounting and reconciliation posting integration and is not enabled yet.
```

No source mutation occurs. It does not change `Subscription.product`, `Subscription.total_amount`, `Subscription.monthly_amount`, EMI rows, payments, receipts, journals, reconciliation runs/items/evidence, lucky ID, batch, waiver, commission, payout, inventory, stock, delivery, rent/lease demand, or deposit records.

## Product recontract execution design

Current system supports preview, customer consent, admin decision evidence, schedule preview evidence, financial impact preview evidence, and a blocked execution endpoint for financial product change. Real execution is intentionally deferred until product recontract accounting posting and reconciliation posting/queue integration are implemented.

The future execution design is documented in:

```text
docs/architecture/contract-amendment-product-recontract-execution-design.md
```

Financial product recontract execution must preserve historical payments, receipts, paid EMIs, waived EMIs, lucky draw evidence, accounting journals, reconciliation evidence, commission/payout records, delivery records, inventory records, rent/lease demands, and deposit records.

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
POST /api/v1/admin/contract-amendments/{id}/product-recontract/execute/   # blocked until accounting/reconciliation posting integration
GET  /api/v1/admin/contract-amendments/{id}/product-recontract-events/
```

## Customer API inventory

```text
GET  /api/v1/customer/contract-amendments/
GET  /api/v1/customer/contract-amendments/{id}/
POST /api/v1/customer/contract-amendments/{id}/product-recontract/consent/
```

Legacy apply remains routed through the guarded service:

```text
POST /api/v1/admin/contracts/amendments/{id}/apply/
```

## Deferred phases

True product recontract execution requires later phases covering price difference execution rules, paid amount allocation, receipt/payment treatment, durable accounting entries, durable reconciliation evidence or queue items, printable addendum, and audit trail. The current execute endpoint is blocked to prevent contract/EMI mutation without accounting and reconciliation truth.

Phase 5 lucky ID / batch work must wait until financial product-change semantics are settled.
