# Contract Amendment Product Recontract Execution Design

Status: execution design only. Phase 6A preview snapshot persistence, Phase 6B customer consent, Phase 6C admin approval/rejection, Phase 6D schedule preview-line persistence, and Phase 6E accounting/reconciliation impact preview evidence are implemented, but no execution endpoint, mutation service, or frontend execution control is implemented.

Branch: `update`

## 1. Business Meaning

Product recontract is not a simple product reference correction.

Current Phase 4 `PRODUCT_CHANGE` implementation is only same-price product reference correction. It may correct `Subscription.product` when the locked contract value remains unchanged.

True product recontract means the customer moves from Product A to Product B with changed financial terms from an approved effective date. The target product may have a higher or lower contract value. That creates extra payable, customer credit, refund eligibility, receivable reduction, future EMI schedule changes, accounting impact, reconciliation impact, approval evidence, and a printable contract addendum.

Historical payments, receipts, ledger rows, waived EMI history, lucky draw history, and posted accounting evidence must not be rewritten. Previous EMI/payment history remains auditable. Future EMI obligations may change only through a controlled execution workflow.

## 2. Non-Goals

This design does not implement:

- immediate product recontract execution
- legacy apply behavior for financial product change
- silent `Subscription.product` overwrite when price changes
- historical receipt rewrite
- historical payment rewrite
- historical EMI paid/waived row rewrite
- lucky ID or batch change
- waiver rewrite
- inventory or stock transfer
- delivery mutation
- commission or payout mutation
- rent/lease deposit mutation
- rent/lease demand mutation
- accounting posting from preview
- reconciliation row creation from preview
- frontend execution button

## 3. Current Repository Facts

Confirmed from the current codebase:

- `backend/subscriptions/services/contract_amendment_service.py` implements Phase 3 contact/address corrections and Phase 4 same-price product reference correction only.
- `backend/subscriptions/services/product_recontract_preview_service.py` is admin-only preview support and explicitly does not mutate source records.
- `backend/subscriptions/models_contract_amendment.py` extends the legacy `ContractAmendment` table additively and keeps `PRODUCT_CHANGE` as a compatibility enum.
- `backend/api/v1/views/contract_amendments.py` exposes only the existing admin preview endpoint for product recontract impact.
- `Subscription.total_paid()` is backed by `FinancialLedger` EMI payment rows minus payment reversal rows.
- `Subscription.remaining_contract_amount()` subtracts ledger-backed paid amount and `Subscription.waived_amount`.
- `EMI` rows are unique by `(subscription, month_no)` and cannot exceed `Subscription.tenure_months`.
- `Payment` rows are protected records linked to customer, subscription, optional EMI, branch/counter, finance account, and collection metadata.
- `billing.ReceiptDocument` can link one-to-one to `Payment`; posted or void receipts require a posted journal entry and use immutable-status guards.
- `LuckyDraw` records winner subscription, winner lucky ID, waiver count, waiver amount, and `FUTURE_EMI_ONLY` default scope.
- Accounting has `AccountingPeriod`, `PostingLock`, `JournalEntry`, `JournalEntryGroup`, and idempotent `AccountingBridgePosting` support.
- Reconciliation has `ReconciliationRun`, `ReconciliationItem`, `ReconciliationEvidence`, and `FinancialSourceLifecycleEvent`.
- Rent/lease profiles and billing demands exist, but true EMI product recontract execution must not mutate rent/lease deposits or demands.

## 4. Required Future Data Model

All future schema changes should be additive.

### ContractRecontractEvent

Recommended primary event table:

- `amendment`: OneToOneField or ForeignKey to `ContractAmendment`, `PROTECT`
- `subscription`: ForeignKey to `Subscription`, `PROTECT`
- `old_product`: ForeignKey to `Product`, `PROTECT`, related name for old product usage
- `new_product`: ForeignKey to `Product`, `PROTECT`, related name for new product usage
- `old_contract_total`: Decimal
- `new_contract_total`: Decimal
- `price_difference`: Decimal, signed
- `amount_already_paid`: Decimal
- `old_remaining_balance`: Decimal
- `new_remaining_balance`: Decimal
- `effective_date`: Date
- `current_tenure_months`: Positive integer
- `new_tenure_months`: Positive integer
- `current_monthly_amount`: Decimal
- `new_monthly_amount`: Decimal
- `impact_type`: enum
  - `UPGRADE_EXTRA_PAYABLE`
  - `DOWNGRADE_CREDIT_REQUIRED`
  - `SAME_PRICE_REFERENCE_CORRECTION`
- `status`: enum
  - `PREVIEWED`
  - `CUSTOMER_CONFIRMED`
  - `ADMIN_APPROVED`
  - `EXECUTED`
  - `CANCELLED`
  - `REVERSED`
- `preview_snapshot`: JSON
- `old_schedule_snapshot`: JSON
- `new_schedule_preview`: JSON
- `execution_snapshot`: JSON
- `accounting_preview`: JSON
- `reconciliation_preview`: JSON
- `created_by`: ForeignKey user, `PROTECT`
- `approved_by`: ForeignKey user, `PROTECT`, nullable
- `customer_confirmed_at`: DateTime, nullable
- `executed_by`: ForeignKey user, `PROTECT`, nullable
- `executed_at`: DateTime, nullable
- `metadata`: JSON
- `created_at`, `updated_at`

Recommended constraints and indexes:

- one active non-terminal recontract event per amendment
- index `subscription,status`
- index `amendment,status`
- index `effective_date,status`
- check money fields are non-negative except signed `price_difference`
- check `new_tenure_months > 0`
- check `current_tenure_months > 0`
- check `executed_at` and `executed_by` are present when status is `EXECUTED`

Phase 6B implemented the current consent fields additively on `ContractRecontractEvent`: `customer_consent_status`, `customer_consented_by`, `customer_consented_at`, `customer_consent_note`, and `customer_consent_snapshot`. These fields capture customer decision evidence only and do not advance the event to execution.

Phase 6C implemented the current admin decision fields additively on `ContractRecontractEvent`: `admin_approval_status`, `admin_approved_by`, `admin_approved_at`, `admin_approval_note`, and `admin_approval_snapshot`. These fields capture admin approval/rejection evidence only and do not advance the event to execution.

### Optional Child Models

`ContractRecontractScheduleLine`

- stores old/new month number, due date, old amount, new amount, delta amount, old EMI id, resulting EMI id, status expectation, and line metadata
- allows execution to be audited without relying only on JSON snapshots

`ContractRecontractAdjustment`

- stores adjustment type, amount, direction, accounting source reference, reconciliation source reference, and approval state
- adjustment types may include `EXTRA_RECEIVABLE`, `CUSTOMER_CREDIT`, `REFUND_ELIGIBLE`, `RECEIVABLE_REDUCTION`

`ContractRecontractApprovalEvent`

- append-only approval/consent event log
- stores actor, actor role, action, timestamp, IP/user-agent metadata where available, and signed/displayed terms snapshot

## 5. Required Execution Stages

### Stage A - Preview

- Backend calculates old/new product, contract total, paid amount, remaining balance, proposed tenure/EMI, impact type, warnings, accounting preview, and reconciliation preview.
- No source mutation.
- Existing preview endpoint already supports the first read-only impact calculation.
- Phase 6A adds an explicit admin-only save action that persists `ContractRecontractEvent` snapshots as audit evidence. It does not persist during every transient preview call.
- If preview persistence cannot produce a complete READY backend snapshot, it is rejected rather than saved as partial execution evidence.

### Stage B - Customer Consent

- Customer sees old and new product, old and new contract amount, amount already paid, new remaining balance, proposed future EMI/tenure, effective date, credit/refund policy, and warnings.
- Customer accepts or rejects.
- Phase 6B records this decision only against the latest active saved `PREVIEWED` snapshot.
- Customer consent is required before admin approval.
- No subscription, EMI, payment, receipt, accounting, reconciliation, waiver, delivery, stock, commission, payout, rent/lease deposit, or demand mutation.

### Stage C - Admin Approval

- Admin reviews customer consent, preview snapshot, eligibility guards, stale preview check, accounting impact, reconciliation impact, waiver/draw risk, and delivery/inventory notes.
- Phase 6C records `APPROVED` or `REJECTED` only after customer consent is `ACCEPTED`.
- Admin approval records approval evidence only.
- No source mutation.
- Admins cannot consent on behalf of customers or override customer consent.

### Stage D - Execution

Future execution must run in one controlled service using `transaction.atomic`.

Phase 6D only generates `ContractRecontractScheduleLine` preview evidence. It does not execute any source mutation.

Required transaction shape:

- lock `Subscription` with `select_for_update`
- lock `ContractAmendment` and `ContractRecontractEvent`
- re-check eligibility and stale-preview guard
- assert accounting period and posting date are open
- detect reconciliation/payment/delivery/cancellation conflicts
- freeze old schedule up to effective date
- preserve old paid and waived EMI rows
- create or adjust only pending/future EMI obligations from the effective date
- preserve all old `Payment` and `ReceiptDocument` rows
- update `Subscription.product`, `total_amount`, `monthly_amount`, `tenure_months`, and snapshots only through the recontract service
- create adjustment records for extra receivable, credit, or receivable reduction
- post accounting only through existing accounting services
- create reconciliation/lifecycle source events only through reconciliation services
- emit audit/business events
- mark event `EXECUTED` with execution snapshot

Phase 6E adds accounting/reconciliation impact preview evidence only and still does not post journals, mutate finance account balances, or create reconciliation items/settlements.

Execution remains future work after Phase 6E. Future EMI schedule update, accounting/reconciliation integration at posting layer, execution endpoint, and printable addendum generation are not part of preview/consent/approval/evidence phases.

### Stage E - Post-Execution Audit/Reconciliation

- Confirm journal posting references.
- Confirm reconciliation source lifecycle event or queue item.
- Provide a printable recontract agreement/addendum.
- Show before/after terms and immutable references to historical payments, receipts, and EMI rows.

## 6. Financial Rules

Backend formulas:

```text
old_contract_total = current Subscription.total_amount
new_contract_total = target Product.base_price or explicitly approved contract price
amount_already_paid = backend payment truth from Subscription.total_paid()
old_remaining_balance = old_contract_total - amount_already_paid - waived_amount
new_remaining_balance = new_contract_total - amount_already_paid - waived_amount
price_difference = new_contract_total - old_contract_total
```

Rules:

- already paid amount remains preserved
- old receipts remain attached to original payment history
- old paid EMIs remain paid
- old waived EMIs remain historically auditable
- future EMI schedule changes only from effective date
- no historical payment rewrite
- no historical receipt rewrite
- no frontend calculation is authoritative
- waived amount must be explicitly considered and must not be silently recalculated
- all monetary values must be quantized to two decimals in backend services

## 7. Upgrade Behavior

For a higher priced product:

- classify as `UPGRADE_EXTRA_PAYABLE`
- `new_remaining_balance` increases
- future EMI amount may increase or tenure may extend depending approved rule
- extra payable is not a direct payment until collected
- execution creates an approved adjustment/receivable event
- accounting posts only at execution through accounting service
- reconciliation references must tie the contract increase to the resulting ledger/customer account impact

## 8. Downgrade Behavior

For a lower priced product:

- classify as `DOWNGRADE_CREDIT_REQUIRED`
- customer may receive reduced future EMI, customer advance/credit, or refundable amount only if business policy allows
- refund/credit must be separately approved and accounted
- historical receipts remain unchanged
- historical paid EMIs remain unchanged
- if paid amount exceeds new contract total, the excess is not silently deleted; it becomes an approved credit/refund workflow candidate

## 9. EMI Schedule Strategy Options

### Option 1 - Keep Tenure, Recalculate Remaining EMI

Pending/future EMIs are recalculated across the remaining months within existing tenure.

Pros:

- simple operational story
- avoids extending lucky plan batch duration
- easier to compare old and new schedules

Cons:

- monthly EMI may jump sharply for upgrades
- downgrade may create very small remaining EMIs or credit edge cases

### Option 2 - Keep EMI Amount, Extend/Reduce Tenure

Current EMI amount remains stable and tenure is extended or reduced.

Pros:

- customer monthly obligation is more predictable

Cons:

- EMI `month_no` cannot exceed `Subscription.tenure_months`, so tenure must change
- EMI plan tenure currently matches batch duration for EMI subscriptions
- extending tenure may conflict with batch/lucky draw semantics

### Option 3 - Admin Chooses Approved New Tenure/EMI

Admin selects approved new terms within policy and customer consent.

Pros:

- flexible for real shop negotiation
- supports upgrade and downgrade edge cases

Cons:

- higher approval and validation burden
- requires stronger policy configuration and audit evidence

### Recommended First Implementation

Use Option 1 first:

- keep historical paid and waived EMIs unchanged
- recalculate only pending/future EMIs from the effective date
- keep batch/lucky ID unchanged
- store old and new schedule snapshots
- require customer consent and admin approval

Option 2 should remain blocked until EMI tenure vs batch duration policy is explicitly designed. Option 3 can be added later with policy constraints.

## 10. Accounting Impact

Expected accounting events, without implementation:

- upgrade creates additional receivable or contract value increase
- downgrade creates credit liability, customer credit, refund candidate, or receivable reduction depending approved policy
- preview creates no journal posting
- customer consent creates no journal posting
- admin approval creates no journal posting
- execution posts through existing accounting service only
- UI must never create direct journal rows
- accounting service must enforce open accounting period and posting lock checks
- accounting bridge posting should be idempotent by source model, source id, and purpose

Suggested future source metadata:

```text
source_model = ContractRecontractEvent
source_id = event.id
purpose = PRODUCT_RECONTRACT_UPGRADE or PRODUCT_RECONTRACT_DOWNGRADE
source_type = CONTRACT_RECONTRACT
source_reference = amendment.amendment_no
```

## 11. Reconciliation Impact

Preview:

- no reconciliation row
- no lifecycle event
- no source mutation

Execution:

- create a source lifecycle or reconciliation event for the recontract
- adjustment amount must reconcile against ledger/customer account impact
- old payments remain reconciled as-is
- old receipts remain reconciled as-is
- future EMI schedule delta should be traceable to `ContractRecontractEvent`
- reconciliation checks should flag missing accounting event, amount mismatch, stale approval, or orphan schedule adjustment

## 12. Audit Requirements

Must record:

- amendment requested
- preview generated or persisted
- customer consent or rejection
- admin approval or rejection
- execution
- before/after product
- before/after contract amount
- before/after tenure and monthly amount
- schedule snapshots
- accounting references
- reconciliation references
- actor and timestamp for every stage
- stale preview/version checks
- reason and approval notes

Audit evidence should be append-only in spirit. Corrections should use reversal/cancellation records, not silent mutation.

Phase 6A audit evidence records preview snapshots only. It stores `source_record_mutation = false`, supersedes prior active preview events for the same amendment, and records the latest preview event id in amendment metadata for review. Customer consent is recorded in Phase 6B and admin approval/rejection is recorded in Phase 6C; neither phase creates accounting posting, reconciliation, execution, or printable addendum evidence.

## 13. Permission Model

- customer may request a financial product recontract
- partner may request for linked partner contracts if existing partner rules allow
- customer consent is required for financial change
- admin approval is required before execution
- execution is admin-only
- cashier cannot execute
- partner cannot execute
- vendor cannot execute
- frontend route guards must match backend permission classes

## 14. Eligibility Guards

Execution must be blocked if:

- subscription is cancelled, closed, completed, terminated, defaulted, returned, or reversed
- active dispute exists
- active cancellation or return workflow exists
- draw winner or waiver state would be invalidated without explicit policy
- accounting period is closed
- accounting posting lock exists for execution/effective posting date
- reconciliation lock or unresolved high-risk reconciliation conflict exists
- pending delivery, return, cancellation, or possession conflict exists
- target product is inactive
- target product is not compatible with subscription plan mode
- target product would require rent/lease deposit or demand mutation
- preview is stale
- customer has not consented
- admin has not approved
- source amendment is not in the required state
- another active recontract event exists for the same subscription/amendment
- paid/waived/future EMI totals cannot be reconciled before execution

## 15. API Design Proposal

Future endpoints only. Do not implement them until the model, services, tests, accounting, and reconciliation contracts are approved.

The proposal below is shown without the project API prefix, matching the design contract. If implemented under the current API convention, these would be mounted under `/api/v1`.

```text
POST /admin/contract-amendments/:id/product-recontract-preview/
POST /admin/contract-amendments/:id/product-recontract/customer-consent/
POST /admin/contract-amendments/:id/product-recontract/admin-approve/
POST /admin/contract-amendments/:id/product-recontract/execute/
GET  /admin/contract-amendments/:id/product-recontract/
```

`execute` is future-only and must remain absent until Phase 6F.

Customer-facing consent may need a separate role-safe endpoint if customers approve directly:

```text
POST /customer/contract-amendments/:id/product-recontract/consent/
```

All endpoints must return backend-calculated values only. Frontend-provided money values can be treated only as requested/proposed inputs and must be revalidated.

## 16. Frontend Design Proposal

Future UI surfaces:

- amendment detail preview panel showing current preview response and warnings
- customer consent view with old/new product, old/new amount, paid amount, new balance, proposed future EMI, effective date, and consent/reject action
- admin approval panel with customer consent, stale preview status, eligibility guards, accounting preview, reconciliation preview, and required notes
- execution confirmation checklist requiring explicit confirmation that payments/receipts/history will not be rewritten
- post-execution audit panel showing event status, schedule snapshot, accounting references, reconciliation references, and downloadable addendum
- printable recontract addendum with old/new terms, consent timestamp, admin approval timestamp, effective date, schedule summary, and source amendment number

The subscription lifecycle amendment panel must remain read-only and link to controlled amendment detail. It must not expose execute/apply controls.

## 17. Test Plan

Backend tests:

- preview creates no source mutation
- customer consent creates no source mutation
- admin approval creates no source mutation
- execution mutates only approved fields
- historical payments unchanged
- historical receipts unchanged
- paid EMIs unchanged
- waived EMIs unchanged
- future EMI schedule updated from effective date only
- upgrade creates adjustment/accounting/reconciliation source references
- downgrade creates credit/refund/receivable-reduction candidate according to policy
- stale preview blocks execution
- missing customer consent blocks execution
- missing admin approval blocks execution
- closed accounting period blocks execution
- posting lock blocks execution
- terminal subscription blocks execution
- waiver/draw conflict blocks execution unless explicit policy exists
- target inactive product blocks execution
- rent/lease incompatible product blocks execution
- duplicate execution is idempotently blocked

Frontend tests:

- preview panel renders ready and blocked responses
- consent panel displays backend values and blocks acceptance on stale preview
- admin approval checklist displays all guard states
- no execution button appears until all conditions are met
- final confirmation is required before execution
- lifecycle amendment panel remains read-only

## 18. Migration Plan

Likely additive migrations, not created now:

- add `ContractRecontractEvent`
- add `ContractRecontractScheduleLine`
- add `ContractRecontractAdjustment`
- add `ContractRecontractApprovalEvent`
- optionally add source type/enum values for accounting bridge purpose if the accounting model needs stricter choices
- optionally add reconciliation source type/event constants for contract recontract lifecycle evidence
- optionally add document type for printable recontract addendum

No destructive migration is expected. Historical payment, EMI, receipt, ledger, waiver, lucky draw, commission, payout, delivery, inventory, rent/lease demand, and deposit records must remain untouched.

## 19. Rollout Plan

### Phase 6A - Data Model and Preview Snapshot Persistence

Status: implemented.

Goal: add event and snapshot persistence without execution.

Risk level: medium because persisted snapshots become audit evidence.

Tests: model validation, one active preview snapshot per amendment via superseding, preview no mutation.

Implemented endpoints:

```text
POST /api/v1/admin/contract-amendments/:id/product-recontract-preview/save/
GET  /api/v1/admin/contract-amendments/:id/product-recontract-events/
```

Customer consent and admin decision recording are implemented. Future EMI schedule changes, accounting posting, reconciliation, execution endpoint, and printable addendum remain future phases. Full execution remains blocked.

### Phase 6B - Customer Consent UI

Goal: allow customer consent/rejection against persisted backend terms.

Risk level: medium because consent becomes contractual evidence.

Tests: role access, stale preview display, no source mutation.

### Phase 6C - Admin Approval Workflow

Status: implemented.

Goal: allow admin approval/rejection of customer-accepted recontract preview events as decision records only.

Risk level: medium.

Tests: admin-only approval/rejection, approval notes, customer consent required, stale/superseded/cancelled preview blocked, repeated decisions blocked, no source mutation.

### Phase 6D - Future EMI Schedule Adjustment Service

Goal: produce and validate future schedule adjustment without payments/receipts mutation.

Risk level: high because EMI obligations change.

Tests: paid/waived rows preserved, pending rows adjusted only from effective date, totals reconcile.

### Phase 6E - Accounting/Reconciliation Integration

Goal: connect execution source to accounting bridge and reconciliation lifecycle/event records.

Risk level: high because ledger and reconciliation truth are affected.

Tests: open period required, posting lock block, idempotent bridge posting, reconciliation event created.

### Phase 6F - Execution Endpoint

Goal: expose admin-only execution after all guards and downstream services exist.

Risk level: high.

Tests: full execution path, blocked states, duplicate execution, permissions.

### Phase 6G - Printable Recontract Addendum

Goal: produce customer/admin printable agreement evidence.

Risk level: medium.

Tests: document generation, access control, stable values from execution snapshot.

## 20. Deployment Notes

- Current system supports preview only for financial product change.
- Execution is intentionally deferred until the above model and workflow are implemented.
- Do not add execute/apply UI for financial product recontract before Phase 6F.
- Do not wire accounting, reconciliation, EMI mutation, payment mutation, receipt mutation, delivery, stock, commission, payout, waiver, lucky ID, batch, rent/lease deposit, or rent/lease demand mutation before the staged execution service exists.
