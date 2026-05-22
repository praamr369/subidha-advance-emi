# Cash / Bank / UPI Settlement — Source-Link Audit (Pre-Reconciliation)

Status: **AUDIT COMPLETE + READY CHECKS IMPLEMENTED (2026-05-22)**  
Scope: **Cash / Bank / UPI settlement reconciliation (deterministic checks only)** — additive detection only; no auto-correction; no source-record mutation.

This document records **confirmed (code-backed)** source-link patterns and the check classification used to implement **deterministic, low-noise** cash/bank/UPI settlement reconciliation.

Non-goals (explicit):
- Do not change payment posting, receipt generation, accounting posting, cashier closing behavior, finance account behavior, or cash/bank/UPI behavior.
- Do not mutate `Payment`, `ReceiptDocument`, `JournalEntry`, `FinanceAccount`, `MoneyMovement`, `CashCounter`, or any other source records.
- Do not infer missing links from free-text references.
- Do not implement settlement batch inference, external bank statement matching, or cashier day-close mismatch in this phase.

Implementation reference (backend):
- `backend/reconciliation/services/cash_bank_upi_reconciliation.py` (registered in `backend/reconciliation/services/reconciliation_runner.py`)

## 1) Executive summary

### What is deterministic today (high confidence)

The repo already contains **explicit links** that make several settlement-adjacent checks deterministic:

- **Payment → settlement instrument** via `subscriptions.Payment.finance_account` (FK) and `subscriptions.Payment.method` (enum).
- **Payment → cashier trace** via `subscriptions.Payment.collected_by` (FK) + `branch` + `cash_counter` (FKs).
- **Payment → posted accounting journal** via `accounting.AccountingBridgePosting(source_model="Payment", purpose="PAYMENT_COLLECTION")` (unique) → `journal_entry` (OneToOne).
- **ReceiptDocument → settlement instrument** via `billing.ReceiptDocument.finance_account` (FK) and optional `cash_counter` (FK) + `branch` (FK).
- **ReceiptDocument → posted accounting journal** via `billing.ReceiptDocument.posted_journal_entry` (OneToOne), created through an `AccountingBridgePosting(source_model="ReceiptDocument", purpose=<receipt_type>)`.
- **FinanceAccount transfers (“settlement moves”)** via `accounting.MoneyMovement(from_finance_account, to_finance_account)` (explicit FKs) with `posted_journal_entry` (OneToOne) when posted.

### What is not deterministic today (or is intentionally not linkable)

- There is **no explicit model** that links a bank/UPI “settlement batch” to the set of `Payment` rows it settles.
- There is **no explicit cashier day-close / cash closing** record in the audited models/services that can be linked to `Payment` rows (only reporting-style books).
- Account-level “pending settlement” in `ReconciliationOverviewService` is deterministic as an **aggregated operational metric**, but it is **not** a per-payment settlement proof.

Planned additive solution (design) and Phase L0 implementation (schema-only):
- `docs/architecture/bank-upi-cashier-settlement-design.md` defines:
  - `BankStatementImport` + `BankStatementLine` (bank statement evidence)
  - `UpiSettlementImport` + `UpiSettlementLine` (gateway settlement evidence)
  - `CashierDayClose` (cash desk operational close snapshot)
  - `SettlementAllocation` (explicit link table used by reconciliation checks)

- Phase L0 implemented (2026-05-22):
  - `backend/settlements/models.py` + `backend/settlements/migrations/0001_initial.py`
  - Schema only; no parsing/matching UI; no reconciliation checks yet.

Phase L1 implemented (2026-05-22):
- Admin-only bank/UPI import upload + checksum + CSV parsing into line tables.
- Still **no matching UI**, **no allocations**, **no reconciliation checks**, and **no source-record mutation**.

Implication (implemented):
- This phase safely implements **strict, link-backed checks** around:
  - missing/duplicate bridge posting evidence
  - payment↔receipt↔journal linkage integrity (where explicit)
  - money-movement posting integrity (where explicit)
- This phase must **defer** “bank/UPI settlement matching” until explicit batch/source links exist or are operationally defined.

After the planned schema exists and is populated (manual-only is enough), the “settlement matching” capability becomes **explicit and auditable** via `SettlementAllocation` (no free-text inference).

## 2) Evidence sources inspected (code-backed)

Primary models:
- `backend/subscriptions/models.py` → `Payment` (finance_account/method/branch/cash_counter/collected_by)
- `backend/billing/models.py` → `ReceiptDocument` (finance_account/payment/posted_journal_entry/branch/cash_counter)
- `backend/branch_control/models.py` → `CashCounter` (branch + finance_account binding)
- `backend/accounting/models.py` → `FinanceAccount`, `AccountingBridgePosting`, `JournalEntry`, `JournalEntryGroup`, `MoneyMovement`

Primary services:
- `backend/subscriptions/services/payment_service.py` → `record_emi_payment(...)` (canonical payment collection)
- `backend/accounting/services/finance_posting_service.py` → `post_subscription_collection(...)` (bridge posting for Payment)
- `backend/billing/services/billing_service.py` → `create_manual_receipt(...)`, `generate_emi_payment_receipt(...)` (receipt journal via bridge posting)
- `backend/accounting/services/money_movement_service.py` and `backend/accounting/services/finance_transfer_service.py` (MoneyMovement posting)
- `backend/accounting/services/reconciliation_overview_service.py` (account-level pending settlement summary)

Targeted tests (evidence of intent/behavior):
- `backend/tests/accounting/test_payment_collection_bridge_finance_resolution.py`
- `backend/tests/accounting/test_accounting_money_movement_posting.py`
- `backend/tests/accounting/test_books_daily_cashbook.py`

## 4) Planned source-link additions (design-only)

This section documents the missing deterministic links required for:
- external bank statement matching (manual match first)
- UPI gateway settlement matching (manual match first)
- cashier day-close mismatch checks (snapshot + approvals)
- payment-to-settlement-batch matching (explicit allocations)

Design reference (docs-only):
- `docs/architecture/bank-upi-cashier-settlement-design.md`

Planned explicit evidence tables:
- Bank statement evidence:
  - `BankStatementImport` → `FinanceAccount` (bank finance account)
  - `BankStatementLine` → `BankStatementImport`
- UPI settlement evidence:
  - `UpiSettlementImport` → `FinanceAccount` (gateway/bank settlement account)
  - `UpiSettlementLine` → `UpiSettlementImport`
- Cash desk close evidence:
  - `CashierDayClose` → `CashCounter` → `FinanceAccount`
- Allocation link table (single source-of-truth for settlement matching):
  - `SettlementAllocation(source_type, source_id)` → one of:
    - `BankStatementLine`
    - `UpiSettlementLine`
    - `CashierDayClose`
  - `SettlementAllocation.payment/receipt/money_movement` → internal records (explicit FKs)

Reconciliation rule (future):
- Control Tower settlement checks must rely on `SettlementAllocation` (explicit links) and must not parse statement descriptions to infer matches.

## 3) Source-link map (required pairs)

For each pair:
- **Relationship type**: explicit FK | OneToOne | generic `source_model/source_id` | derived only | missing
- **Deterministic reconciliation possible?** yes/no
- **Confidence**: high | medium | low | impossible without schema work
- **First safe settlement check enabled**: earliest low-noise check supported
- **Deferred checks**: checks that should not be implemented until links/rules exist
- **Risk notes**: false-positive and operational risks

### 3.1 Payment → receipt

- Source: `subscriptions.Payment`
- Target: `billing.ReceiptDocument`
- Fields:
  - `ReceiptDocument.payment` (OneToOne → `Payment`, nullable)
  - Reverse access: `Payment.receipt_document` (related_name)
- Relationship type: **OneToOne (explicit)**
- Deterministic? **Yes**
- Confidence: **High**
- First safe settlement check enabled:
  - “Payment exists but no ReceiptDocument” (already deterministic; receipt is explicit)
- Deferred checks:
  - Any rule asserting receipts are mandatory for all payments unless policy is explicitly defined per workflow.
- Risk notes:
  - Receipt generation can be on-demand (`generate_emi_payment_receipt`) and is not guaranteed to exist for every payment unless operationally mandated.

### 3.2 Payment → finance account

- Source: `subscriptions.Payment`
- Target: `accounting.FinanceAccount`
- Field: `Payment.finance_account` (FK, nullable)
- Relationship type: **explicit FK**
- Deterministic? **Yes**
- Confidence: **High**
- First safe settlement check enabled:
  - “Payment exists but `finance_account_id` is NULL” (hard failure for settlement tracing)
- Deferred checks:
  - “Finance account must be mapped to {CASH/BANK/UPI} collection purpose” unless a strict mapping rule is defined (see 3.3 risk notes).
- Risk notes:
  - `assert_finance_account_allowed_for_payment_collection(...)` blocks clearly operational-mapped accounts, but does **not** enforce a “must have mapping purpose” invariant.

### 3.3 Payment → payment mode

- Source: `subscriptions.Payment`
- Field: `Payment.method` (`CASH` | `BANK` | `UPI`)
- Relationship type: **enum field**
- Deterministic? **Yes**
- Confidence: **High**
- First safe settlement check enabled:
  - “Payment method is not one of {CASH,BANK,UPI}” (data integrity)
- Deferred checks:
  - “Payment.method must match FinanceAccount.kind” (see risk notes)
- Risk notes:
  - The repo seeds a “Payment Gateway Settlement Account” as `FinanceAccountKind.BANK` while also supporting UPI-kind accounts. This makes strict method↔kind checks potentially noisy unless business rules formally define the allowed combinations.

### 3.4 Payment → accounting bridge posting

- Source: `subscriptions.Payment`
- Target: `accounting.AccountingBridgePosting`
- Evidence:
  - `AccountingBridgePosting(source_model="Payment", source_id=str(payment.id), purpose="PAYMENT_COLLECTION")` (unique)
- Relationship type: **generic `source_model/source_id` (structured)**
- Deterministic? **Yes**
- Confidence: **High**
- First safe settlement check enabled:
  - “Payment exists but missing `AccountingBridgePosting(... purpose=PAYMENT_COLLECTION)`.”
- Deferred checks:
  - None (this is a core deterministic evidence link).
- Risk notes:
  - Reversals use `purpose="PAYMENT_REVERSAL"`; checks must scope by purpose.

### 3.5 Payment → JournalEntry / JournalEntryGroup

- Source: `subscriptions.Payment`
- Targets: `accounting.JournalEntry`, `accounting.JournalEntryGroup`
- Evidence:
  - `AccountingBridgePosting(...).journal_entry` (OneToOne)
  - `JournalEntry.source_model/source_id` are expected to match the bridge/source
  - `FinancePostingService.post_subscription_collection(...)` creates a `JournalEntryGroup` and assigns it to the posted journal + updates `FinancialLedger.journal_group` for rows where `payment_id=<payment.id>`
- Relationship type: **OneToOne via bridge posting** + **generic source fields**
- Deterministic? **Yes**
- Confidence: **High**
- First safe settlement check enabled:
  - “Bridge exists but journal entry missing or has mismatching `JournalEntry.source_model/source_id`.”
  - “JournalEntryGroup is not balanced.”
  - “Duplicate posted journals reference the same `(source_model, source_id, voucher_type)`.”
- Deferred checks:
  - Any rule that tries to infer settlement completion from JournalEntryGroup alone (settlement completion is not encoded per payment).
- Risk notes:
  - `ReceiptDocument` also posts an accounting bridge journal (see 3.6/3.7); do not conflate Payment journals with ReceiptDocument journals.

### 3.6 ReceiptDocument → payment / invoice / customer

- Source: `billing.ReceiptDocument`
- Targets: `subscriptions.Payment`, `billing.BillingInvoice`, `billing.DirectSale`, `subscriptions.Customer`, `subscriptions.Subscription`
- Fields (all explicit, nullable by design):
  - `ReceiptDocument.payment` (OneToOne)
  - `ReceiptDocument.billing_invoice` (FK)
  - `ReceiptDocument.direct_sale` (FK)
  - `ReceiptDocument.customer` (FK)
  - `ReceiptDocument.subscription` (FK)
- Relationship type: **explicit FK/OneToOne**
- Deterministic? **Yes**
- Confidence: **High**
- First safe settlement check enabled:
  - “ReceiptDocument has `payment_id` but `receipt_type != EMI_PAYMENT_RECEIPT`.” (explicit model `clean()` rule)
- Deferred checks:
  - Cross-document allocation rules (receipt↔invoice partial allocation) unless explicit allocation links exist.
- Risk notes:
  - A receipt may be created from Payment (`BillingSourceType.PAYMENT`) or from invoice/direct sale; settlement checks must branch by receipt_type/source_type.

### 3.7 Cash receipt → cash account / cash desk / branch

- Sources: `billing.ReceiptDocument`, `subscriptions.Payment`, `branch_control.CashCounter`
- Targets: `accounting.FinanceAccount`, `branch_control.Branch`
- Fields:
  - `ReceiptDocument.finance_account` (FK) + `ReceiptDocument.branch` (FK) + optional `ReceiptDocument.cash_counter` (FK)
  - `Payment.finance_account` (FK) + `Payment.branch` (FK) + optional `Payment.cash_counter` (FK)
  - `CashCounter.branch` (FK) + `CashCounter.finance_account` (FK)
- Relationship type: **explicit FK**
- Deterministic? **Yes (links exist); completeness depends on data presence**
- Confidence: **High** for link mechanics; **Medium** for “must exist” policy
- First safe settlement check enabled:
  - “CashCounter exists but its `finance_account` is not eligible for cash counter use” (already enforced at CashCounter clean-time via guard).
- Deferred checks:
  - “Cash receipts must always have cash_counter_id” (policy-dependent).
- Risk notes:
  - Admin flows can collect without a specific cash counter; treating missing cash_counter as an exception can be noisy.

### 3.8 Bank receipt → bank account / finance account

- Sources: `Payment`, `ReceiptDocument`
- Target: `FinanceAccount`
- Fields: `Payment.finance_account` / `ReceiptDocument.finance_account`
- Relationship type: **explicit FK**
- Deterministic? **Yes**
- Confidence: **High**
- First safe settlement check enabled:
  - “Receipt/Payment finance_account points to an inactive finance account” (explicit, already validated on create paths)
- Deferred checks:
  - Strict “BANK receipts must use FinanceAccount.kind=BANK” until method↔kind policy is formalized (see 3.3).
- Risk notes:
  - Payment gateway settlements are modeled as BANK-kind finance accounts, which can represent UPI-like collections depending on business practice.

### 3.9 UPI receipt → UPI/payment gateway account

- Sources: `Payment`, `ReceiptDocument`, `FinanceAccount`
- Field evidence:
  - `Payment.method="UPI"`
  - `FinanceAccount.kind` supports `UPI`, but gateway settlement desks can also be `BANK` kind (seeded)
  - `FinanceAccount.upi_handle` exists as metadata only
- Relationship type: **explicit FK + enum + metadata**
- Deterministic? **Partially**
- Confidence: **Medium**
- First safe settlement check enabled:
  - “UPI payment exists but finance_account is missing” (hard failure)
- Deferred checks:
  - “UPI method must use UPI-kind finance account” (not safe without business rule confirmation).
- Risk notes:
  - UPI collection may land in a gateway/bank settlement account; strict classification requires an explicit “collection purpose” contract (e.g., mapping purpose) rather than kind alone.

### 3.10 Cashier collection → cashier/user/branch

- Source: `subscriptions.Payment`
- Targets: user, branch, counter
- Fields:
  - `Payment.collected_by` (FK nullable)
  - `Payment.branch` (FK nullable but auto-resolved on save)
  - `Payment.cash_counter` (FK nullable)
- Relationship type: **explicit FK**
- Deterministic? **Yes**
- Confidence: **High** (for existence), **Medium** (for “must exist” policy)
- First safe settlement check enabled:
  - “Payment collected through cashier endpoints but missing `collected_by_id` / branch trace” (policy depends on endpoint; data allows null)
- Deferred checks:
  - Strict staff accountability checks unless “collected_by must be present” is enforced by business rule per collection surface.
- Risk notes:
  - Some internal flows (imports/admin scripts) may create payments without collected_by; checks must scope by source.

### 3.11 Cashier day close / cash closing record (if present)

- Finding: **No explicit cashier day-close / cash closing model** found in inspected models/services/tests.
- Relationship type: **missing**
- Deterministic? **No**
- Confidence: **Impossible without schema work**
- First safe settlement check enabled:
  - None (no explicit closing record to link)
- Deferred checks:
  - Cash desk closing mismatch checks.
- Risk notes:
  - Books/summary reports exist, but they are derived read models; they do not form an auditable closing event link.

### 3.12 Bank/UPI settlement batch (if present)

- Finding: **No explicit bank/UPI settlement batch model** found that links to a set of `Payment` rows.
- Relationship type: **missing**
- Deterministic? **No**
- Confidence: **Impossible without schema work**
- First safe settlement check enabled:
  - None (no batch link to payments)
- Deferred checks:
  - “Bank/UPI settlement mismatch” checks.

### 3.13 Finance account transaction / ledger (if present)

- Sources: `accounting.MoneyMovement`, `accounting.JournalEntryLine`
- Finding:
  - `MoneyMovement` provides explicit from/to finance accounts with posted journal evidence.
  - There is no dedicated “FinanceAccountLedgerEntry” model that records settlement per payment.
- Relationship type: **explicit FK (MoneyMovement)**; **derived-only for account ledger**
- Deterministic? **Yes for MoneyMovement posting integrity**; **No for per-payment settlement**
- Confidence: **High** (MoneyMovement); **Low/Impossible** (per-payment)
- First safe settlement check enabled:
  - “MoneyMovement is POSTED but missing posted_journal_entry_id” (already enforced by model clean).
- Deferred checks:
  - Per-payment settlement matching against external bank/UPI statements.

### 3.14 JournalEntry source_model/source_id for collection/settlement

- Sources:
  - `JournalEntry.source_model/source_id` (explicit fields)
  - `AccountingBridgePosting(source_model, source_id, purpose)` (unique) → `journal_entry`
  - `MoneyMovement` posts `JournalEntry(source_model="MoneyMovement", source_id=<id>)`
  - `ReceiptDocument` posts via bridge `source_model="ReceiptDocument"`
- Relationship type: **generic source fields (structured)**
- Deterministic? **Yes**
- Confidence: **High**
- First safe settlement check enabled:
  - “JournalEntry exists but mismatching `source_model/source_id` for the source record.”
  - “Duplicate posted JournalEntry source references per `(source_model, source_id, voucher_type)`.”
- Deferred checks:
  - None (this is a core deterministic evidence link).

### 3.15 Existing reconciliation/settlement status fields

- Existing:
  - `subscriptions.PaymentReconciliation` (per-payment EMI/variance reconciliation; not settlement)
  - `accounting.MoneyMovement.status` (DRAFT/POSTED/CANCELLED; settlement transfer status)
  - `accounting.FinanceAccount.is_real_settlement_account` (desk vs profile anchor)
  - `ReconciliationOverviewService` exposes account-level “pending_settlement_amount” (derived)
- Relationship type: **explicit fields** (but semantics differ)
- Deterministic? **Yes for the fields; limited for settlement semantics**
- Confidence: **High**
- First safe settlement check enabled:
  - “Settlement desk readiness warnings” (setup/health checks) can be enforced as preconditions before settlement reconciliation runs.
- Deferred checks:
  - Any attempt to interpret `pending_settlement_amount` as proof of per-payment settlement completion.

## 4) Check classification (candidate checks)

### READY_FOR_SETTLEMENT_PHASE

Deterministic with existing links; low false-positive risk; admin-only explainable results possible.

1) **Payment exists but missing accounting bridge posting (PAYMENT_COLLECTION)**  
Evidence: `AccountingBridgePosting(source_model="Payment", purpose="PAYMENT_COLLECTION")`.

2) **Bridge journal source link mismatch (Payment / ReceiptDocument / MoneyMovement)**  
Evidence: `JournalEntry.source_model/source_id` must match the owning source record.

3) **Duplicate posted journal/source posting for the same Payment**  
Evidence: multiple `JournalEntry(status=POSTED, source_model="Payment", source_id=<id>, voucher_type="PAYMENT_COLLECTION")`.

4) **Payment journal amount mismatch vs Payment.amount (Payment bridge)**  
Evidence: sum of journal line debits/credits should equal `Payment.amount` for `PAYMENT_COLLECTION` journal (when posted).

5) **ReceiptDocument journal amount mismatch vs ReceiptDocument.amount (Receipt bridge)**  
Evidence: receipt bridge journal should match receipt.amount for posted receipts.

6) **MoneyMovement POSTED but missing posted journal / or journal amount mismatch**  
Evidence: `MoneyMovement.posted_journal_entry` and balanced lines between from/to chart accounts.

Implemented exception codes (Control Tower module `CASH_BANK_UPI_SETTLEMENT_PHASE`):
- `PAYMENT_SETTLEMENT_BRIDGE_MISSING`
- `PAYMENT_SETTLEMENT_JOURNAL_SOURCE_LINK_INVALID`
- `PAYMENT_SETTLEMENT_DUPLICATE_JOURNAL_SOURCE_REFERENCE`
- `PAYMENT_SETTLEMENT_JOURNAL_AMOUNT_MISMATCH` (deterministic-only; requires balanced journal line totals)
- `RECEIPT_SETTLEMENT_JOURNAL_AMOUNT_MISMATCH` (deterministic-only; requires balanced journal line totals)
- `MONEY_MOVEMENT_POSTED_JOURNAL_MISSING`
- `MONEY_MOVEMENT_JOURNAL_SOURCE_LINK_INVALID`
- `MONEY_MOVEMENT_JOURNAL_AMOUNT_MISMATCH` (deterministic-only; requires balanced journal line totals)
- `MONEY_MOVEMENT_JOURNAL_GROUP_UNBALANCED` (explicit journal_group only; no inference)

### NEEDS_SCHEMA_LINK

Relation missing or ambiguous; requires additive source references before reliable settlement reconciliation.

1) **Bank/UPI settlement batch matching (per payment)**  
Missing: explicit settlement batch model + allocation/join table linking payments to a settlement batch/statement row.

2) **Cashier day-close / cash desk closing mismatch**  
Missing: explicit cashier closing record that binds a day/counter/user to totals and references the covered payments/receipts/movements.

3) **Per-payment “settled_at / settled_by / settlement_ref” evidence**  
Missing: an explicit per-payment settlement marker or linkage to a settlement transaction/batch.

### NEEDS_BUSINESS_RULE_CONFIRMATION

Source links exist but the expected behavior is not formally encoded; risk of noisy exceptions until rules are confirmed.

1) **Payment.method vs FinanceAccount.kind mismatch**  
Reason: gateway settlement desks are BANK-kind; UPI-kind is also supported; allowed combinations need a formal contract.

2) **ReceiptDocument required for every Payment**  
Reason: receipt generation can be on-demand; requiring it as a strict invariant is policy-dependent.

3) **Cash payments must have cash_counter_id**  
Reason: admin flows and some operational contexts may not bind to a CashCounter.

### DEFER

High false-positive risk or requires external data; lifecycle unclear.

1) **Bank/UPI “settlement mismatch” vs external statements** (without explicit statement ingestion + mapping)

2) **Account-level pending settlement treated as an exception per payment**  
Reason: `pending_settlement_amount` is an aggregate operational metric, not a per-transaction proof.

3) **Double-posting inference between Payment bridge and ReceiptDocument bridge**  
Reason: both create bridge postings/journals with different purposes/offset accounts; whether both should exist simultaneously is workflow-dependent.

## 5) Payment → finance account → journal result (confirmed)

Payment-level accounting evidence:
- `Payment.finance_account_id` (FK) anchors the settlement instrument.
- `FinancePostingService.post_subscription_collection(payment, finance_account, ...)` posts:
  - `AccountingBridgePosting(source_model="Payment", source_id=<payment.id>, purpose="PAYMENT_COLLECTION")`
  - `AccountingBridgePosting.journal_entry` (OneToOne) with debit = `finance_account.chart_account`, credit = `ACCOUNTS_RECEIVABLE`.
- A `JournalEntryGroup` is created and assigned to the posted journal entry; `FinancialLedger` rows for the payment are updated with the same `journal_group`.

ReceiptDocument accounting evidence (separate from Payment bridge):
- `create_manual_receipt(...)` posts:
  - `AccountingBridgePosting(source_model="ReceiptDocument", source_id=<receipt.id>, purpose=<receipt_type>)`
  - Journal lines debit = `receipt.finance_account.chart_account`, credit = `EMI_COLLECTION_CLEARING` (for EMI receipts) or `ACCOUNTS_RECEIVABLE` (for retail receipts).

## 6) Cashier / cash desk / branch source-link result (confirmed)

- `CashCounter.finance_account_id` is the desk binding (cash-only by guard).
- `Payment.cash_counter_id` and `Payment.branch_id` provide operational trace (nullable).
- `ReceiptDocument.cash_counter_id` and `ReceiptDocument.branch_id` provide receipt trace (nullable).

No explicit “cash desk close” source record is present to anchor daily closing reconciliation deterministically.

## 7) Bank / UPI settlement source-link result (confirmed)

- Transfers between settlement instruments are modeled as `MoneyMovement(from_finance_account_id, to_finance_account_id)` with posted journal evidence.
- There is no explicit bank/UPI settlement batch model, nor a mapping from MoneyMovement → covered payments.

## 8) Risks (noise prevention)

Primary noise risks if checks are implemented prematurely:
- Assuming `Payment.method` must match `FinanceAccount.kind` (gateway desks blur this).
- Treating receipt presence as mandatory without an explicit operational policy.
- Treating account-level pending settlement aggregates as per-payment exceptions.
- Inferring “settlement completion” without explicit settlement batch/source links.

## 9) Recommended next-phase scope (implementation guidance)

Implement only **link-backed, per-record deterministic** checks:
- Payment bridge presence/integrity and duplicate detection.
- Receipt bridge presence/integrity and amount integrity (for posted receipts).
- MoneyMovement posting integrity (posted journal exists, balanced, correct source_model/source_id).

Explicitly defer:
- Bank/UPI settlement statement matching.
- Cash desk day-close mismatch checks.
- Any check requiring inferred joins between payments ↔ movements ↔ external statements.
