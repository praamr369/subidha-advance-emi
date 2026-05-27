# Contract Amendment Workflow

Status: **Implemented through Phase 6F.6 RC hardening on `update`.**

## Scope

Contract amendments support EMI Subscription and Rent / Lease contracts. Direct Sale corrections stay in their existing billing, return, exchange, refund, cancellation, and invoice workflows.

## Phase 1 — Request and review foundation

Customer and partner users can request amendments for allowed contracts. Admin users can inspect, mark under review, approve, or reject. Approval records decision values but does not automatically mutate financial or operational records.

## Phase 2 — Role-scoped UI

Customer, partner, and admin routes expose role-scoped amendment registers and detail pages. Customer and partner screens do not expose implementation controls.

The subscription lifecycle page is not an implementation surface. Its Contract Amendments panel is read-only and should link to `/admin/contract-amendments/{id}` only.

## Phase 3 — Low-risk implementation only

Implemented source fields:

- `ADDRESS_CHANGE`: `Customer.address`, `Customer.city`
- `CONTACT_CORRECTION`: `Customer.phone`

No subscription, EMI, payment, receipt, journal, waiver, lucky draw, rent/lease demand, deposit, inventory, stock, reconciliation, commission, payout, or delivery records are touched.

## Phase 4 — Same-price product reference correction only

The existing `PRODUCT_CHANGE` enum remains for compatibility, but generic implementation behavior is only `PRODUCT_REFERENCE_CORRECTION_SAME_PRICE_ONLY`.

It can update only `Subscription.product` when the target product base price equals the locked contract total. Different-price target products are handled by product recontract.

## Product recontract workflow

Product recontract is the controlled path for true financial product changes.

Implemented chain:

1. Phase 6A — saved backend preview snapshot.
2. Phase 6B — customer consent.
3. Phase 6C — admin decision.
4. Phase 6D — future EMI schedule preview lines.
5. Phase 6E — accounting/reconciliation impact preview.
6. Phase 6F.2 — durable accounting bridge posting.
7. Phase 6F.3 — durable reconciliation bridge.
8. Phase 6F.4 — backend execution after evidence verification.
9. Phase 6F.5 — admin typed execution UI.
10. Phase 6F.6 — RC hardening, executed-state visibility, read-only reporting, and post-execution blockers.

## Product recontract endpoints

```text
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/
POST /api/v1/admin/contract-amendments/{id}/product-recontract-preview/save/
POST /api/v1/customer/contract-amendments/{id}/product-recontract/consent/
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

## Execution behavior

Execution is admin-only and evidence-gated. It mutates only:

- `Subscription.product`
- `Subscription.total_amount`
- `Subscription.monthly_amount`
- `Subscription.tenure_months`
- `Subscription.product_snapshot`
- `Subscription.pricing_snapshot`
- pending `Emi.amount`
- pending `Emi.due_date`
- `ContractRecontractEvent.metadata`

Execution does not mutate historical payments, receipts, paid/waived/cancelled EMI rows, accounting postings, reconciliation evidence, settlement/day-close records, lucky ID, batch, waiver/lucky draw, inventory, delivery, commission, payout, rent/lease demand, or deposit records.

## Phase 6F.6 read-only reporting fields

Admin/customer detail payloads expose:

```text
workflow_flags
execution_ready
execution_block_reason
executed
executed_at
executed_by
execution_status
execution_snapshot
accounting_bridge_posting_id
journal_entry_id
reconciliation_item_id
reconciliation_run_id
reconciliation_evidence_ids
schedule_line_ids
old_monthly_amount
new_monthly_amount
```

## Post-execution blockers

After execution, the following actions are blocked/read-only:

- preview generation
- preview snapshot save
- customer consent
- admin decision
- schedule preview generation
- financial impact preview generation
- accounting posting
- reconciliation bridge creation
- duplicate execution

## UI rules

Admin amendment detail may show executed-state evidence and typed execution controls only before execution and only when all evidence exists.

Customer amendment detail may show only a safe read-only executed summary:

```text
This recontract updated future contract terms after approval. Previous payments and receipts remain unchanged.
```

Partner, cashier, and vendor users must never see execution controls.

Subscription lifecycle pages must not expose apply/execute actions. They may link to amendment detail only.

## Print and addendum policy

Current subscription/contract print views should use current executed subscription truth. Historical pre-recontract values remain in recontract event metadata.

Printable recontract addendum remains future Phase 6G.

Rollback/reversal remains a future controlled workflow and is not exposed.
