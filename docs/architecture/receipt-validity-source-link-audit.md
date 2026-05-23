# Receipt Validity Source-Link Audit

Status: **AUDIT ONLY**
Scope: document the current `ReceiptDocument` lifecycle, current explicit settlement/cashier evidence, and the missing invalidation source-link contract required before receipt-based day-close or settlement checks can be deterministic.

## 1) Objective

This audit identifies the current authoritative and inferred receipt validity signals across:

- `billing.ReceiptDocument`
- `subscriptions.Payment`
- cashier day-close / cash counter evidence
- settlement evidence via `JournalEntry` and `AccountingBridgePosting`
- refund / cancellation / reversal flows that affect receipt status

The goal is to separate:

- current deterministic source-link evidence
- where receipt validity is inferred rather than explicit
- where additive schema/work is required before receipts can be relied on in settlement/day-close reconciliation

## 2) Receipt lifecycle overview

A `ReceiptDocument` is currently a lifecycle object with the following canonical states:

- `DRAFT`
- `POSTED`
- `VOID`
- `CANCELLED` (supported by the model/status enum, but not observed in the current receipt void service path)

The current active proof path for a posted receipt is:

- `ReceiptDocument.status = POSTED`
- `ReceiptDocument.posted_journal_entry` is required when status is `POSTED` or `VOID`
- `ReceiptDocument.payment` links the receipt to a `subscriptions.Payment` when the receipt is an EMI payment receipt
- `ReceiptDocument.billing_invoice` or `ReceiptDocument.direct_sale` link the receipt to the underlying sale document when applicable
- `ReceiptDocument.finance_account` and optional `ReceiptDocument.cash_counter` / `ReceiptDocument.branch` provide the settlement trace

### 2.1 Receipt issuance and posting

In the current codebase, receipts are posted through billing service paths such as:

- `backend/billing/services/billing_service.py:create_manual_receipt()`
- `backend/billing/services/billing_service.py:generate_emi_payment_receipt()`

These paths create a `ReceiptDocument` with `status = POSTED` and a linked `posted_journal_entry` via an accounting bridge posting.

### 2.2 Receipt invalidation and voiding

The current receipt invalidation flow observable in code is:

- `backend/billing/services/billing_service.py:void_receipt_document()`
  - posts a reversal journal entry
  - sets `ReceiptDocument.status = VOID`

Key observation:

- the receipt remains linked to its original `posted_journal_entry`
- no dedicated receipt invalidation event or record is created during this void path
- the only evidence of invalidation is therefore derived from `ReceiptDocument.status` and the reversal journal behavior, not from a first-class source-link contract

## 3) Current explicit source-link evidence for receipts

The audit confirms these explicit links are present and code-backed:

- `ReceiptDocument.payment` (OneToOne to `subscriptions.Payment`, nullable)
- `ReceiptDocument.billing_invoice` (FK to `billing.BillingInvoice`, nullable)
- `ReceiptDocument.direct_sale` (FK to `billing.DirectSale`, nullable)
- `ReceiptDocument.posted_journal_entry` (OneToOne to `accounting.JournalEntry`)
- `ReceiptDocument.finance_account` (FK to `accounting.FinanceAccount`)
- optional `ReceiptDocument.cash_counter` / `ReceiptDocument.branch`

These links make the receipt a valid candidate for settlement and cashier evidence only when its lifecycle state is known.

## 4) Receipt invalidation gap

The current system lacks a deterministic, first-class receipt invalidation source-link contract.

### 4.1 Why this matters

- Cashier day-close totals and settlement allocation / matching may need to exclude invalidated receipts.
- `ReceiptDocument.status = VOID` is a domain state, but it is not a documented proof contract for settlement or cash evidence.
- The original `ReceiptDocument.posted_journal_entry` remains set after voiding, so journal existence alone does not prove the receipt is still active.
- A receipt void can therefore be misinterpreted as an active receipt if reconciliation logic looks only at posted journal evidence.

### 4.2 Existing partial design leverages

- `subscriptions.OperationalCancellation` already carries `SourceType.EMI_PAYMENT` for payment reversals, and it has a defined explicit invalidation contract for EMI payments.
- `OperationalCancellation.SourceType.BILLING_RECEIPT` exists as a logical extension point, but the current receipt void service does not populate it.

This suggests a natural additive design path: either

- reuse `OperationalCancellation` for receipt invalidation events, or
- introduce a dedicated `ReceiptDocumentInvalidation` / generic `DocumentLifecycleEvent` table for receipt lifecycle transitions.

## 5) Design guidance for explicit receipt invalidation

The future design should preserve these principles:

- keep the receipt invalidation signal additive and audit-only first
- do not rely on `ReceiptDocument.status` alone for settlement or day-close proofs
- preserve backward compatibility for existing receipt records and journals
- make the invalidation evidence queryable without requiring inference from reversal journal descriptions
- use explicit FKs or event links rather than free-text / memo inference
- if possible, align receipt invalidation design with `OperationalCancellation` to reuse existing cancellation semantics

### 5.1 Candidate explicit contract elements

A future additive contract should include:

- `receipt_document_id` / `ReceiptDocument` FK
- `event_type` enum: `ISSUED`, `POSTED`, `VOIDED`, `CANCELLED`, `REFUNDED`, `SUPERSEDED`, `REGENERATED`
- optional `source_type` / `source_id` to tie the invalidation event to a `Payment`, `CustomerRefund`, `JournalEntry`, or `OperationalCancellation`
- `posted_journal_entry_id` or `reversal_journal_entry_id` when a reversal is posted
- `created_by` / `created_at`
- `reason` / `metadata`

### 5.2 Minimal explicit link use cases

- `ReceiptDocument` remains active if there is no invalidation event and `status=POSTED`
- `ReceiptDocument` is invalidated if an explicit invalidation event exists with `event_type=VOIDED` or `CANCELLED`
- cashier day-close / settlement checks may exclude `ReceiptDocument` only when an invalidation event exists or when the receipt state is deterministically active

## 6) Implications for settlement and cashier reconciliation

Receipt invalidation evidence is required before the system can safely use receipts as authoritative settlement evidence in:

- bank statement / UPI settlement allocations
- cashier day-close exclusions and variance calculations
- control tower checks that distinguish active vs invalidated receipts

Without an explicit receipt invalidation contract, the safest current design is to use receipts only for amount/journal matching and to defer any rules that rely on receipt activity state.

## 7) Impact on existing data

This audit is read-only. No model or migration changes are applied.

The findings show that:

- `Receipts` currently rely on `status` + journal reversal inference for invalidation
- an explicit invalidation source-link contract is missing for deterministic settlement and cashier use
- future schema should be additive, backward-compatible, and explicit rather than inferring invalidation from existing posted journals or receipt status alone

## 6) Additive lifecycle event design recommendation

The recommended path is a generic `FinancialSourceLifecycleEvent` layer that treats receipt validity the same way as payment and money movement validity.

Key recommendation:
- do not rely on `ReceiptDocument.status = POSTED` or `posted_journal_entry` presence as proof of an active receipt.
- create explicit `VOIDED`, `CANCELLED`, `REFUNDED`, and `SUPERSEDED` lifecycle events for receipts.
- preserve existing receipt generation and posting behavior.
- keep events append-only and audit-only for the first implementation.

See also:
- `docs/architecture/financial-source-lifecycle-event-design.md`
- `docs/roadmap/financial-source-lifecycle-event-implementation-plan.md`
