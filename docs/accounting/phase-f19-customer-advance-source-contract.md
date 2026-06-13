# Phase F19 — Customer Advance Source Contract Audit / Hardening

Scope: source-contract audit and hardening only. F19 does not add controlled accounting bridge posting.

## Decision summary

Customer advance handling is split across two existing source paths:

| Workflow | Current concrete source | Current bridge support | F19 decision |
|---|---|---|---|
| Manual / unapplied receipt document | `billing.ReceiptDocument` | Yes, Phase F2 event `customer_advance` | Keep F2 path. Do not duplicate in F20. |
| Operational unapplied customer advance | `subscriptions.CustomerAdvance` | Legacy immediate finance posting existed before F19 | Harden as source evidence. Controlled bridge deferred to F20. |
| Advance application to EMI receivable | `subscriptions.CustomerAdvanceAllocation` plus linked `Payment` | Legacy immediate finance posting existed before F19 | Harden as source evidence. Controlled bridge deferred to F21. |
| Customer advance refund | No dedicated `CustomerAdvanceRefund` source found | No safe source-backed bridge in F19 | Defer. F22 requires a concrete refund source contract. |

## Existing F2 behavior

Phase F2 already classifies `ReceiptDocument` as customer advance when:

- `receipt_type=RETAIL_RECEIPT`
- no direct sale link
- no billing invoice link
- `source_type` is `MANUAL`, `OTHER`, or blank

F2 source model/event:

```text
source_model = ReceiptDocument
event_key = customer_advance
```

F19 must not add a second posting path for this same source.

## F19 hardening

F19 changes the operational `CustomerAdvance` service path to preserve source evidence and defer accounting bridge posting.

`CustomerAdvance` evidence includes:

- customer
- finance account
- branch / cash counter where available
- amount
- unapplied amount
- payment method
- reference number
- payment date
- status
- collected by
- created timestamp
- allocation metadata snapshot

F19 adds service-level idempotency protection using:

- unique `reference_no`
- metadata key `source_idempotency_key`

Repeated same evidence returns the same `CustomerAdvance` row. A duplicate reference/idempotency key with mismatched amount, customer, method, date, branch, or finance account is rejected.

F19 also marks the source metadata:

```json
{
  "source_contract_phase": "F19",
  "accounting_bridge_posting_deferred": true,
  "future_bridge_phase": "F20_CUSTOMER_ADVANCE_RECEIPT"
}
```

## Application source

`CustomerAdvanceAllocation` remains the concrete application source for allocation to EMI receivable.

The linked `Payment` is still created by the existing operational workflow to preserve EMI schedule behavior, but its metadata marks it as an advance application, not fresh cash collection:

```json
{
  "collection_mode": "ADVANCE_ALLOCATION",
  "source_contract_phase": "F19",
  "accounting_bridge_posting_deferred": true,
  "future_bridge_phase": "F21_CUSTOMER_ADVANCE_APPLICATION"
}
```

F21 must not post this as normal cash collection. F21 accounting shape should be:

```text
Dr Customer Advance Liability
Cr Customer Receivable / Invoice Receivable
```

## Phase F19.1 closeout

F19.1 closes the remaining source-contract gaps before F20:

- cashier advance collection API accepts `idempotency_key`
- cashier advance collection passes the key to `CustomerAdvanceService.collect_unapplied_advance`
- cashier API response exposes source metadata for operator/audit visibility
- `ADVANCE_ALLOCATION` linked `Payment` rows are guarded from F1 Payment bridge preview/post
- bridge candidate lists surface those linked payments as skipped/not-applicable with this reason: `Customer advance application payments are handled by F21, not F1 payment collection.`
- F2 `ReceiptDocument.customer_advance` remains unchanged and separate

F19.1 still creates no accounting bridge posting. It does not create `JournalEntry`, `AccountingBridgePosting`, or bridge `ReconciliationItem` rows.

## Refund source gap

No dedicated customer advance refund source contract was finalized in F19.

`billing.CustomerRefund` exists for customer refund workflows, but it is tied to direct-sale return/customer credit posture and is not proven as a customer-advance refund source.

F22 should only start after either:

1. a concrete `CustomerAdvanceRefund` / `CustomerAdvanceTransaction` source is added, or
2. an existing refund model is hardened and explicitly linked to customer advance balance.

## Separation rules

Customer advance source evidence must remain separate from:

- `RentLeaseDepositTransaction`
- `RentLeaseCollection`
- `RentLeaseBillingDemand`
- EMI payment collection
- direct-sale receipt
- security deposit receipt/refund
- vendor payment
- salary payment
- commission payout
- StaffAdvance

## F20/F21/F22 plan

F20 — customer advance receipt bridge:

```text
Dr Cash / Bank / FinanceAccount
Cr Customer Advance Liability
```

F20 must not duplicate the existing F2 `ReceiptDocument.customer_advance` bridge path.

F21 — customer advance application bridge:

```text
Dr Customer Advance Liability
Cr Customer Receivable / Invoice Receivable
```

F21 must use `CustomerAdvanceAllocation`/advance-application evidence and must not post linked `Payment` rows as F1 cash collection.

F22 — customer advance refund bridge:

```text
Dr Customer Advance Liability
Cr Cash / Bank / FinanceAccount
```

F22 requires a concrete customer-advance refund source contract before posting.

## Safety boundary

F19/F19.1 does not create:

- `JournalEntry`
- `AccountingBridgePosting`
- bridge-created `ReconciliationItem`
- auto-post
- auto-reconcile
- period close

F19/F19.1 does not classify security deposits, rent/lease monthly collection, direct-sale receipts, EMI payment collection, salary payment, vendor payment, commission payout, or StaffAdvance as customer advance.

## Required regression

```bash
.venv/bin/python manage.py test tests.accounting.test_customer_advance_source_contract_phase_f19 --verbosity=1
.venv/bin/python manage.py test tests.accounting.test_accounting_bridge_candidate_posting_phase_f tests.accounting.test_accounting_bridge_receiptdocument_posting_phase_f2 tests.accounting.test_customer_advance_source_contract_phase_f19 --verbosity=1
.venv/bin/python manage.py test tests.accounting tests.reconciliation tests.subscriptions --verbosity=1
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
cd frontend
npm run typecheck
npm run lint
npm run build:smoke
```
