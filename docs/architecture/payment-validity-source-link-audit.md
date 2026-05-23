# Payment Validity Source-Link Audit

Status: **AUDIT ONLY**
Scope: identify current authoritative validity signals for cash evidence, cashier day-close, settlement reconciliation, receipts, and reporting. No source logic changes or implementation edits are made in this audit.

## 1) Objective

This document captures the current state of the repository's payment validity signals and their source-link reliability across:

- `subscriptions.Payment`
- `billing.ReceiptDocument`
- cashier day-close totals (`settlements.CashierDayClose` + `compute_system_cash_total`)
- settlement reconciliation evidence (`AccountingBridgePosting`, `JournalEntry`, `MoneyMovement`)
- receipt generation and receipt void behavior

The goal is to separate:

- what is currently authoritative and deterministic
- where explicit validity signals are missing
- where future additive schema work is required before adding reconciliation or day-close checks

## 2) Confirmed authoritative validity signals

### 2.1 Payment invalidation

Current authoritative invalidation signal for EMI payments is:

- `subscriptions.OperationalCancellation` with:
  - `source_type = OperationalCancellation.SourceType.EMI_PAYMENT`
  - `source_id = Payment.id`
  - `cancellation_type = PAYMENT_REVERSAL`

This signal is referenced by the cashier day-close computation in `backend/settlements/services/cashier_day_close_service.py`.

Key observation:

- `Payment` itself has no native `status` enum for reversal or void.
- The system relies on `OperationalCancellation` as the authoritative external evidence that a payment should be excluded from cashier day-close totals.
- This signal is explicit and deterministic for EMI payment reversal flows, but only if `OperationalCancellation` is created consistently.

### 2.2 Receipt validity

Current receipt validity evidence is derived from:

- receipt lifecycle fields on `billing.ReceiptDocument` (status, `posted_journal_entry`, `billing_invoice` / `payment` link)
- `billing.ReceiptDocument.payment` OneToOne relation to `subscriptions.Payment`
- `posted_journal_entry` linking the receipt to accounting evidence

Key observation:

- Receipt voiding or cancellation does not currently appear to generate a dedicated explicit invalidation signal equivalent to `OperationalCancellation`.
- `OperationalCancellation.SourceType.BILLING_RECEIPT` exists as a natural extension point, but current receipt void paths do not populate it.
- Receipt invalidity is therefore inferred from receipt status + journal reversal paths rather than a single deterministic source-link contract.

### 2.3 Cashier day-close totals

The cashier day-close total is computed by `compute_system_cash_total(...)` in `backend/settlements/services/cashier_day_close_service.py`.

The current proof path is:

- filter `Payment` rows by cashier, business date, branch/cash_counter/finance_account, and payment method
- exclude payments that have a matching `OperationalCancellation` with `SourceType.EMI_PAYMENT`

Key observation:

- The current cashier day-close evidence is payment-centric and only excludes explicitly cancelled payments.
- There is no equivalent explicit exclusion for invalidated receipt rows or settlement evidence outside `Payment`.
- Cashier day-close reporting is therefore not currently backed by a generic “valid payment/receipt” signal; it is backed by `OperationalCancellation` for one flow.

### 2.4 Settlement reconciliation evidence

Current deterministic settlement reconciliation evidence is based on explicit source links:

- `subscriptions.Payment` → `accounting.AccountingBridgePosting(source_model="Payment", purpose="PAYMENT_COLLECTION")`
- `AccountingBridgePosting.journal_entry` → posted `JournalEntry`
- `billing.ReceiptDocument.posted_journal_entry` → posted `JournalEntry`
- `accounting.MoneyMovement.posted_journal_entry` → posted `JournalEntry`

Current implemented reconciliation checks intentionally avoid inference and use only these explicit links.

Key observation:

- Settlement checks are deterministic only when supported by explicit linking via bridge postings and posted journals.
- There is no explicit proof today that a posted journal entry means a payment has reached final settlement; it only proves accounting posting evidence.
- Cashier day-close mismatch checks are deferred because there is no explicit `CashierDayClose`-to-transaction linking contract in the existing source models.

## 3) Gap inventory

### 3.1 Payment reversal/invalidity gap

Confirmed gap:

- only EMI payment reversals currently emit a deterministic invalidation signal (`OperationalCancellation`).
- no generic `Payment.status` or `Payment.is_valid/invalid` field exists.
- future reconciliation or reporting needs a first-class validity flag or an explicit cancellation/link contract to avoid inference.

### 3.2 Receipt invalidation gap

Confirmed gap:

- receipt voiding and direct-sale receipt invalidation are not backed by a dedicated explicit invalidation model or signal.
- `ReceiptDocument.status` and journal reversal are usable for read-only checks, but they are not a single trusted source of truth for settlement or cashier-close exclusion.

### 3.3 Cashier day-close evidence gap

Confirmed gap:

- `CashierDayClose` currently stores snapshot values and variance, but the underlying `system_cash_total` calculation is dependent on payment filtering only.
- there is no explicit audited link from a day-close to the set of transactions it intends to cover.
- this creates a gap for day-close mismatch reconciliation and for stable manual approvals.

### 3.4 Settlement matching gap

Confirmed gap:

- external bank/UPI settlement matching is intentionally deferred until explicit evidence ingestion and allocation linking exist.
- `SettlementAllocation` is the designed future contract, but current source models do not yet make payment-to-bank/upi matching provably deterministic.

## 4) Current authoritative source-link contracts

The audit confirms the following production-grade source-link contracts:

- `Payment` → `AccountingBridgePosting(source_model=Payment, source_id=payment.id, purpose=PAYMENT_COLLECTION)`
- `Payment` → `AccountingBridgePosting(... purpose=PAYMENT_REVERSAL)` for reversal evidence
- `Payment` → `ReceiptDocument.payment` (OneToOne)
- `ReceiptDocument` → `posted_journal_entry` (OneToOne)
- `MoneyMovement` → `posted_journal_entry` (OneToOne)
- `AccountingBridgePosting` → `journal_entry` (OneToOne)

The following are currently weak or missing explicit validity signals:

- `receipt` invalidation evidence for voided receipts or direct-sale receipt cancellations
- `CashierDayClose` transaction coverage linking
- `Payment.method` ↔ `FinanceAccount.kind` strict settlement contract
- per-payment settlement completion evidence outside accounting posting

## 5) Future additive design guidance

To harden payment validity without changing existing posting or receipt behaviors, the future design should preserve these principles:

- preserve backward compatibility for existing data and workflows
- keep new signals additive and audit-only at first
- avoid inferring invalidity from non-authoritative metadata
- prefer explicit links or status enums over soft inference
- continue using `OperationalCancellation` as source evidence where it is already authoritative; consider extending it for `SourceType.BILLING_RECEIPT` receipt invalidation events
- add explicit invalidation signals for receipts if receipt voiding is expected to affect day-close/settlement totals
- add a stable `CashierDayClose` linking mechanism before implementing cashier mismatch checks
- use `SettlementAllocation` as the eventual explicit proof contract for external bank/UPI match evidence

### 5.1 Minimal additive schema proposals

These proposals are documentation-only and additive.

- `Payment.validity_status` enum
  - values: `ACTIVE`, `REVERSED`, `VOIDED`, `PENDING_REVIEW`
  - derive from `OperationalCancellation` but store as a first-class field for easier reporting and faster day-close queries

- `ReceiptDocument.invalidated_by` generic FK or `ReceiptInvalidation` model
  - track receipt void/cancellation as explicit evidence
  - allow cashier day-close and settlement rules to exclude invalid receipts deterministically

- `CashierDayClose.covered_payments` / `CashierDayClose.covered_receipts`
  - optional serialized audit field or explicit allocation link table
  - preserve current snapshot totals while making the covered transaction set explicit for future reconciliation

- `SettlementAllocation` evidence table
  - already designed in Phase L0/L2
  - should be extended to support `CashierDayClose` proof and receipt invalidation evidence as needed

## 6) Impact on existing data

This audit is read-only. No model or migration changes are applied.

The findings identify current reliance on `OperationalCancellation` for payment invalidation and the missing equivalent explicit receipt invalidation signal. Any future schema change should prioritize additive, backward-compatible audit records rather than rewriting existing payment/receipt posting behavior.
