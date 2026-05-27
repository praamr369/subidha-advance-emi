# Product Recontract Posting Integration Design

Status: **Phase 6F.1 design only**

Branch: `update`

This document defines the required accounting and reconciliation posting design for real product upgrade/downgrade execution. It does not enable execution and does not mutate `Subscription`, `Emi`, `Payment`, `ReceiptDocument`, `JournalEntry`, `FinanceAccount`, `MoneyMovement`, `Settlement`, `ReconciliationItem`, `Inventory`, `Delivery`, `Commission`, `Payout`, `Waiver`, `LuckyDraw`, `LuckyId`, `Batch`, rent/lease demand, or deposit records.

## 1. Current Repository Facts

Confirmed from the current code:

- `backend/subscriptions/services/product_recontract_preview_service.py` persists preview, consent, admin approval, schedule preview, financial impact preview, and a blocked execution gate.
- `execute_product_recontract_event()` validates gates inside `transaction.atomic()`, locks amendment/event/subscription/pending EMI rows, then returns controlled 400 before source mutation.
- `backend/subscriptions/services/product_recontract_accounting_service.py` currently returns `PREVIEW_LINKED` metadata only and explicitly does not post journals.
- `backend/subscriptions/services/product_recontract_reconciliation_service.py` currently returns `PREVIEW_LINKED` snapshot evidence only and does not create durable reconciliation records for execution.
- `backend/api/v1/tests_contract_recontract_execution.py` asserts execution stays blocked and that payments, receipts, paid EMIs, journals, reconciliation runs/items/evidence, and subscription state remain unchanged.
- `Subscription.total_paid()` is ledger-backed through `FinancialLedger`; `Subscription.remaining_contract_amount()` subtracts ledger-backed paid amount and `waived_amount`.
- `ReceiptDocument` links one-to-one to `Payment` and requires posted journal evidence for posted/void states.
- Accounting already has `post_bridge_entry()` with idempotent `AccountingBridgePosting`, `JournalEntry`, `JournalEntryGroup`, accounting period checks, and posting-lock checks.
- Accounting setup exposes canonical accounts such as `CUSTOMER_RECEIVABLE`, `CUSTOMER_ADVANCE_UNEARNED_REVENUE`, and `SALES_REVENUE`.
- Reconciliation already has `ReconciliationRun`, `ReconciliationItem`, `ReconciliationEvidence`, and `FinancialSourceLifecycleEvent`.
- Settlement/day-close reconciliation is check-oriented and must not be mutated by recontract execution.

## 2. Business Accounting Meaning

Product recontract is a contract value amendment, not a cash collection.

- Upgrade creates additional receivable / contract increase.
- Downgrade creates receivable reduction, customer credit liability, or refund eligibility depending on paid and unpaid balance.
- Amount already paid remains preserved.
- Historical `Payment`, `ReceiptDocument`, `FinancialLedger`, paid `Emi`, posted journal, waiver, draw, settlement, and day-close evidence is never rewritten.
- Paid EMIs remain immutable.
- Pending/future EMIs adjust only inside the future execution service after posting gates pass.
- No receipt is created at recontract execution because no cash is received at that moment.
- Actual future collections continue through the existing payment/receipt/finance posting workflow.

## 3. Posting Events

Future execution should create explicit event evidence using these event types:

- `PRODUCT_RECONTRACT_UPGRADE_RECEIVABLE`
- `PRODUCT_RECONTRACT_DOWNGRADE_CREDIT`
- `PRODUCT_RECONTRACT_EMI_SCHEDULE_ADJUSTMENT`
- `PRODUCT_RECONTRACT_EXECUTED`
- `PRODUCT_RECONTRACT_REVERSAL` for future reversal support only

Recommended mapping:

| Event type | Purpose | Source record |
| --- | --- | --- |
| `PRODUCT_RECONTRACT_UPGRADE_RECEIVABLE` | Durable accounting evidence for additional receivable | `ContractRecontractPostingRecord` or `ContractRecontractEvent` |
| `PRODUCT_RECONTRACT_DOWNGRADE_CREDIT` | Durable accounting evidence for receivable reduction/customer credit | `ContractRecontractPostingRecord` or `ContractRecontractEvent` |
| `PRODUCT_RECONTRACT_EMI_SCHEDULE_ADJUSTMENT` | Durable evidence that pending EMI rows were replaced from preview | `ContractRecontractReconciliationRecord` or schedule-line execution metadata |
| `PRODUCT_RECONTRACT_EXECUTED` | Final orchestration event after all mutations succeed | `ContractRecontractEvent` |
| `PRODUCT_RECONTRACT_REVERSAL` | Future compensating flow; not part of initial execution enablement | future reversal record |

## 4. Upgrade Accounting Proposal

For upgrade:

```text
Dr Customer Receivable / Contract Receivable
Cr Product Recontract Revenue Adjustment / Contract Increase
Amount = price_difference
```

Rules:

- Use positive `price_difference`.
- Post through `accounting.services.bridge_posting_service.post_bridge_entry()`.
- Use `JournalEntryType.SYSTEM_BRIDGE`.
- Use source identity tied to the durable recontract posting record, not to a payment.
- Use `CUSTOMER_RECEIVABLE` / legacy `ACCOUNTS_RECEIVABLE` for the debit.
- Add a dedicated posting profile or canonical chart account for `PRODUCT_RECONTRACT_REVENUE_ADJUSTMENT` if existing `SALES_REVENUE` is too broad for audit reporting.
- No cash, bank, UPI, finance account balance, `MoneyMovement`, settlement allocation, payment, or receipt row is created.
- Future cash collection reduces receivable through existing payment collection posting.

## 5. Downgrade Accounting Proposal

Policy:

- First reduce unpaid receivable if unpaid balance exists.
- If paid amount exceeds the new contract total after waiver treatment, create customer credit liability for the overpaid portion.
- Refund is not automatic. Refund must run through a separate controlled refund workflow with its own approval, payment instrument, receipt/refund document, journal, and reconciliation evidence.
- Historical receipts are never rewritten or partially voided to make downgrade math look simpler.

For receivable reduction only:

```text
Dr Product Recontract Revenue Adjustment / Contract Decrease
Cr Customer Receivable / Contract Receivable
Amount = receivable_reduction_amount
```

For overpaid customer credit:

```text
Dr Product Recontract Revenue Adjustment / Contract Decrease
Cr Customer Credit / Customer Advance Liability
Amount = customer_credit_amount
```

If one downgrade has both unpaid receivable reduction and overpaid credit, post them as separate lines or separate bridge purposes with clear metadata:

- `receivable_reduction_amount`
- `customer_credit_amount`
- `refund_eligible_amount`
- `refund_created = false`

The existing `CUSTOMER_ADVANCE_UNEARNED_REVENUE` account can represent customer credit if business accepts that semantic. If not, add a dedicated posting profile/chart account such as `CUSTOMER_CREDIT_LIABILITY`.

## 6. EMI and Payment Rules

- Paid EMIs stay unchanged.
- Paid receipts stay unchanged.
- Posted journals and bridge rows for historical payments stay unchanged.
- Payment allocation history remains preserved.
- Pending EMIs are replaced only by the future execution service, using persisted `ContractRecontractScheduleLine` rows as source of truth.
- Future collections use the new pending EMI values.
- EMI schedule changes must not create `Payment` or `ReceiptDocument` rows.
- Waived EMI rows remain distinguishable from paid EMI rows and are not retroactively recalculated during recontract execution.

## 7. Ledger and Customer Account Impact

Customer ledger/account views should show a chronological, explainable story:

1. Original contract total and product snapshot.
2. Payments already received, with original payment/receipt references.
3. Waiver history, if any, separately from payments.
4. Product recontract adjustment:
   - upgrade: additional receivable
   - downgrade: receivable reduction and/or customer credit
5. New remaining balance.
6. Future EMI schedule generated from persisted schedule preview lines.

The ledger should not present recontract adjustment as cash. It should be labeled as a contract amendment adjustment and linked to the recontract event, posting record, journal entry, and reconciliation record.

## 8. Reconciliation Rules

Future execution must create durable reconciliation evidence.

Required behavior:

- Execution creates a `FinancialSourceLifecycleEvent` or equivalent durable source event for the recontract adjustment.
- Execution creates or queues a reconciliation item/record that links:
  - recontract event
  - financial impact preview
  - accounting bridge posting
  - posted journal entry
  - subscription
  - expected adjustment amount
  - actual posted amount
- Adjustment amount must reconcile exactly against accounting posting.
- Old payments remain reconciled as-is.
- No settlement, settlement allocation, bank line, UPI line, cashier day-close, or day-close status is mutated.
- Settlement/day-close checks should remain unaffected because recontract execution has no cash movement.
- If accounting posting succeeds but reconciliation evidence creation fails inside the transaction, execution must roll back before subscription/EMI mutation.

Recommended reconciliation statuses:

- `MATCHED` when expected adjustment equals posted journal amount and all links are present.
- `NEEDS_REVIEW` when posted but manual policy review is required, for example downgrade overpayment credit.
- `AMOUNT_MISMATCH`, `MISSING_LEDGER`, or `MISSING_SOURCE` only from later reconciliation runners when evidence is incomplete.

## 9. Service Boundaries

Future service responsibilities:

- `product_recontract_accounting_service.py`
  - validates posting profile/chart-account readiness
  - validates accounting period and posting lock
  - creates durable posting record
  - posts bridge journal through accounting services only
  - stores journal/bridge references
  - never mutates `Subscription`, `Emi`, `Payment`, `ReceiptDocument`, or finance account balances directly

- `product_recontract_reconciliation_service.py`
  - creates durable reconciliation/lifecycle evidence
  - links to accounting posting evidence
  - validates expected vs actual adjustment amount
  - never mutates settlement/day-close/payment/receipt history

- `product_recontract_execution_service.py`
  - orchestrates row locks and eligibility gates
  - calls accounting and reconciliation services before source mutation
  - updates only approved subscription and pending EMI fields after posting evidence can succeed
  - emits final audit/business events
  - remains idempotent

- UI
  - never posts journals directly
  - never creates reconciliation records directly
  - never calculates authoritative financial impact
  - only calls backend preview/consent/approval/execution endpoints

## 10. Required Backend Models or Fields

The existing `ContractRecontractEvent.metadata` can hold preview references, but execution-grade posting needs stronger durable evidence than metadata-only JSON.

Recommended additive model: `ContractRecontractPostingRecord`

Suggested fields:

- `event`: FK `ContractRecontractEvent`, `PROTECT`
- `financial_preview`: FK `ContractRecontractFinancialImpactPreview`, `PROTECT`
- `posting_event_type`: enum using posting events above
- `impact_type`
- `posting_status`: `PENDING`, `POSTED`, `VOIDED`, `FAILED`
- `amount`
- `receivable_reduction_amount`
- `customer_credit_amount`
- `entry_date`
- `accounting_bridge_posting`: FK `AccountingBridgePosting`, nullable, `PROTECT`
- `journal_entry`: FK `JournalEntry`, nullable, `PROTECT`
- `journal_group`: FK `JournalEntryGroup`, nullable, `PROTECT`
- `idempotency_key`: unique
- `posted_by`, `posted_at`
- `voided_by`, `voided_at`, `void_reason`
- `metadata`
- timestamps

Recommended additive model: `ContractRecontractReconciliationRecord`

Suggested fields:

- `event`: FK `ContractRecontractEvent`, `PROTECT`
- `posting_record`: FK `ContractRecontractPostingRecord`, `PROTECT`
- `financial_source_lifecycle_event`: FK `FinancialSourceLifecycleEvent`, nullable, `PROTECT`
- `reconciliation_run`: FK `ReconciliationRun`, nullable, `PROTECT`
- `reconciliation_item`: FK `ReconciliationItem`, nullable, `PROTECT`
- `status`: `PENDING`, `MATCHED`, `NEEDS_REVIEW`, `FAILED`, `VOIDED`
- `expected_amount`
- `actual_amount`
- `amount_delta`
- `metadata`
- timestamps

Acceptable minimal alternative:

- Use `ContractRecontractEvent.metadata` only for non-authoritative snapshots.
- Still create `AccountingBridgePosting`, `JournalEntry`, and `FinancialSourceLifecycleEvent`.
- This is weaker for audit querying and should be temporary only.

## 11. Execution Gate Checklist

Execution may run only if all gates pass:

- Saved `ContractRecontractEvent` preview exists.
- Latest event status is `PREVIEWED`.
- Customer consent is `ACCEPTED`.
- Admin approval is `APPROVED`.
- Schedule preview lines exist and are current.
- Financial impact preview exists.
- Accounting preview status is `PREVIEWED`.
- Reconciliation preview status is `PREVIEWED`.
- Posting profile is available.
- Required chart accounts are active, leaf/posting-ready, and mapped to the posting profile.
- Finance account mapping is ready if a future branch of the flow ever touches a real settlement instrument. Normal recontract execution should not require cash/bank/UPI finance account movement.
- Accounting period is open.
- Posting date has no posting lock.
- Subscription, amendment, event, preview, and pending EMI rows are locked.
- Pending EMI IDs still match schedule preview line `original_emi_id` values.
- No blocking cancellation, return, reversal, refund, payment dispute, operational cancellation, or in-flight payment collection exists for the subscription.
- No executed posting record already exists for the event/idempotency key.
- No later saved/superseding recontract event exists for the same amendment.
- No rent/lease demand or deposit mutation is required.
- No lucky ID, batch, lucky draw, waiver, commission, payout, delivery, inventory, or settlement mutation is required.

## 12. Failure and Rollback Rules

- If journal posting fails, no subscription or EMI mutation may occur.
- If reconciliation evidence creation fails, no subscription or EMI mutation may occur.
- If EMI mutation fails after posting/reconciliation creation, rollback everything in the same transaction.
- If a future integration cannot keep all records in the same transaction, it must create an explicit compensating void/reversal through accounting and reconciliation services before returning failure.
- Execution must be idempotent by event and posting purpose/idempotency key.
- Retrying execution after a transient failure must not create duplicate journals, duplicate bridge postings, duplicate reconciliation items, duplicate lifecycle events, or duplicate EMI mutations.
- A posted recontract should not be deleted. Future reversal must be explicit and should use `PRODUCT_RECONTRACT_REVERSAL`.

Recommended transaction order:

1. Lock amendment, event, subscription, latest financial preview, schedule preview lines, and pending EMIs.
2. Revalidate all gates.
3. Create or lock `ContractRecontractPostingRecord` by idempotency key.
4. Post accounting bridge journal.
5. Create reconciliation/lifecycle evidence.
6. Mutate subscription and pending EMIs from schedule preview.
7. Mark event executed and write execution snapshot.
8. Emit audit/business events.

## 13. Test Plan

Backend tests to add before enabling execution:

- Upgrade posting creates durable posting record, accounting bridge posting, posted journal, and journal lines.
- Upgrade journal debits customer receivable and credits recontract revenue/contract increase for `price_difference`.
- Downgrade with unpaid balance creates receivable reduction evidence.
- Downgrade with overpayment creates customer credit liability evidence.
- Downgrade does not create refund payment or receipt.
- Accounting failure rolls back execution and leaves subscription/EMI/payment/receipt state unchanged.
- Reconciliation failure rolls back execution and leaves subscription/EMI/payment/receipt state unchanged.
- EMI mutation failure rolls back or compensates journal/reconciliation evidence through services.
- Paid EMIs and posted receipts remain unchanged.
- Historical `Payment` and `FinancialLedger` rows remain unchanged.
- Pending EMIs update only from persisted schedule preview lines.
- Customer ledger/account view shows old contract, payments, recontract adjustment, new remaining balance, and future schedule.
- Day close, settlement allocation, bank line, UPI line, and cashier close records remain unchanged.
- No direct `FinanceAccount` balance mutation occurs outside accounting service boundaries.
- Duplicate execution request is idempotent and does not duplicate journals/reconciliation evidence.
- Accounting period lock blocks execution before mutation.
- Posting lock blocks execution before mutation.
- Missing posting profile/chart account blocks execution before mutation.
- Blocking cancellation/reversal/dispute blocks execution before mutation.

Frontend/e2e tests when UI execution is later exposed:

- Admin cannot see execution control until backend readiness says execution-enabled.
- Backend error messages are surfaced clearly.
- No customer/partner execution control exists.
- Post-execution detail shows adjustment evidence without presenting it as cash received.

## 14. Rollout Plan

- Phase 6F.1: posting integration design. Documentation only. Execution remains blocked.
- Phase 6F.2: durable accounting posting preview-to-record bridge. Add posting record model, posting profile/account readiness checks, and bridge journal creation tests. Execution remains blocked.
- Phase 6F.3: durable reconciliation queue/lifecycle integration. Add reconciliation record model/service and exact amount matching tests. Execution remains blocked.
- Phase 6F.4: enable blocked execution only when accounting and reconciliation posting integration can complete in one transaction with subscription/pending EMI mutation. No frontend button until backend execution is production-ready.
- Phase 6F.5: full RC hardening, including idempotency, failure injection tests, period-lock tests, operational conflict tests, ledger view tests, and audit export checks.

## 15. API Contract Impact

Current API contract remains unchanged in Phase 6F.1.

Future implementation may add read-only response fields for:

- posting readiness
- posting record ID
- journal entry ID / entry number
- accounting bridge posting ID
- reconciliation record ID
- lifecycle event number
- execution snapshot

The existing blocked execution endpoint must continue returning controlled 400 until all required backend posting and reconciliation services are implemented and tested.

## 16. Migration Needs

Phase 6F.1 requires no migration.

Future phases should use additive migrations only:

- add `ContractRecontractPostingRecord`
- add `ContractRecontractReconciliationRecord`
- optionally add posting profile/chart account keys for recontract revenue adjustment and customer credit liability
- optionally add `EXECUTED` / `REVERSED` statuses to recontract event status after compatibility review

No destructive migration is required.

## 17. Deployment Notes

- Do not enable execution by configuration flag until production chart accounts and posting profiles are ready.
- Run accounting setup/readiness checks before rollout.
- Run migration and backfill only for additive records.
- Keep frontend execution controls hidden until backend execution readiness is explicit.
- Preserve existing blocked endpoint behavior until Phase 6F.4.
