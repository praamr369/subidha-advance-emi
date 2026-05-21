# Reconciliation Source-Link Map (Deterministic Audit — Phase E)

Status: **AUDIT COMPLETE (docs-only)**  
Scope: **Source-link evidence map only** — no schema/API/service/frontend changes in this phase.

This document records **confirmed** (code-backed) source-link patterns across modules so Phase F can implement only **deterministic, low-noise** reconciliation checks.

## 1) Executive summary

### What is already deterministic (high confidence)

The repo already contains strong evidence trails for many flows:

- **Payment → EMI / Subscription / Customer** via explicit FKs on `subscriptions.Payment`.
- **Payment → ReceiptDocument** via `billing.ReceiptDocument.payment` (OneToOne).
- **ReceiptDocument → JournalEntry** via `billing.ReceiptDocument.posted_journal_entry` (OneToOne) when POSTED/VOID.
- **Payment → Accounting (bridge)** via `accounting.AccountingBridgePosting` with `(source_model="Payment", source_id=<payment.id>, purpose="PAYMENT_COLLECTION")` created by `accounting.services.bridge_posting_service.post_bridge_entry(...)` (and also invoked by `FinancePostingService.post_subscription_collection`).
- **Inventory StockLedger** traceability via string-based `inventory.StockLedger.reference_model` + `reference_id` (with uniqueness constraints) created only via inventory/manufacturing/billing stock posting services.
- **Commission / payout to accounting** via accounting bridge postings (source_model `Commission`, `CommissionPayoutBatch`).
- **Waiver to accounting** via accounting bridge postings (source_model `AuditLog`, purpose `EMI_WAIVER`).
- **Document/PDF source identity** via `subscriptions.services.document_engine_service.DocumentMeta` containing `(source_model, source_object_id)` where source is a `ReceiptDocument` or `SubscriptionDocument`.
- **Audit trails** via `subscriptions.AuditLog(model_name, object_id)` and `subscriptions.BusinessEventLog` with explicit optional FKs for customer/subscription/payment/batch/lucky_id.

### Where determinism is currently missing or intentionally deferred

- **Rent/lease accounting posting** is currently **deferred-by-design**: `subscriptions.services.rent_lease_finance_sync_service` only emits audit events (no journal/bridge posting), so rent/lease accounting reconciliation is not deterministic yet.
- Some operational lifecycle links are **string references** or **derived-only** (e.g. delivery references, some reversal/ops flows), and should not be used for strict Phase F checks without explicit schema links or stable reference conventions.

## 2) Current source-link patterns found (catalog)

Evidence patterns observed in code:

1. **Explicit FK / OneToOne evidence**
   - `Payment.emi`, `Payment.subscription`, `ReceiptDocument.payment`, `ReceiptDocument.posted_journal_entry`, `BillingInvoice.posted_journal_entry`, `PurchaseBill.posted_journal_entry`, etc.
2. **Accounting bridge evidence**
   - `AccountingBridgePosting(source_model, source_id, purpose) → JournalEntry` (OneToOne).
   - `JournalEntry(source_model, source_id, source_reference)` fields also exist for search/forensics.
3. **String-based operational trace**
   - Inventory: `StockLedger(reference_model, reference_id)` (unique per inventory_item+movement_type+reference).
   - Billing: `BillingSyncEvent(source_model, source_id, event_type)`.
4. **Audit evidence**
   - `AuditLog(model_name, object_id, action_type, metadata, performed_by)`.
   - `BusinessEventLog` (append-only) with optional FKs and `source_module`, `ledger_reference`.

## 3) Source-link map (required pairs)

For each pair:
- **Relationship type**: explicit FK | generic `source_model/source_id` | string reference | derived only | missing
- **Deterministic reconciliation possible?** yes/no
- **Confidence**: high | medium | low | impossible without schema work
- **First safe reconciliation check**: the earliest low-noise check enabled by this link
- **Deferred checks**: checks that should not be Phase F
- **Risk notes**

### 3.1 Payment → EMI link

**Index of the required 1–20 pairs**

| # | Pair | Section |
|---:|---|---|
| 1 | Payment → EMI | 3.1 |
| 2 | Payment → ReceiptDocument | 3.2 |
| 3 | Payment → JournalEntry / accounting bridge | 3.3 |
| 4 | EMI → Subscription | 3.4 |
| 5 | Subscription → Customer/Product/Batch/Lucky ID | 3.5 |
| 6 | Waiver → EMI/subscription/lucky draw winner | 3.6 |
| 7 | Direct sale invoice → payment/receipt | 3.7 |
| 8 | Direct sale invoice → stock movement | 3.8 |
| 9 | Return/cancellation/void → original invoice/stock/accounting | 3.9 |
| 10 | Inventory stock movement → source document | 3.10 |
| 11 | Manufacturing job/BOM → inventory movement | 3.11 |
| 12 | Purchase/vendor bill/payment → inventory/accounting/payable | 3.12 |
| 13 | Commission → payout | 3.13 |
| 14 | Payout → payable/accounting | 3.14 |
| 15 | Rent/lease contract → deposit/monthly billing/payment/accounting | 3.15 |
| 16 | Delivery → source contract/invoice/subscription/direct-sale | 3.16 |
| 17 | Document/PDF → source record (Receipt PDF) | 3.17 |
| 18 | Document/PDF → source record (SubscriptionDocument/file) | 3.18 |
| 19 | Audit log → source record (AuditLog) | 3.19 |
| 20 | Audit log → source record (BusinessEventLog) | 3.20 |

- Source model: `subscriptions.Payment`
- Target model: `subscriptions.Emi`
- Fields:
  - `Payment.emi` (FK, nullable)
  - `Emi.payments` (reverse FK)
- Relationship type: **explicit FK**
- Deterministic? **Yes**
- Confidence: **High**
- First safe check:
  - “Payment has `emi_id` but EMI belongs to a different subscription/customer” (integrity check; already validated in `Payment.clean()`).
- Deferred checks:
  - Cross-check payment amount vs EMI outstanding requires ledger context; still deterministic but should be Phase F only if scoped carefully.
- Risk notes:
  - Not all payments are necessarily EMI-linked (`emi` nullable). Phase F should not flag `emi_id is NULL` blindly.

### 3.2 Payment → ReceiptDocument link

- Source: `subscriptions.Payment`
- Target: `billing.ReceiptDocument`
- Fields:
  - `ReceiptDocument.payment` (OneToOne FK to `Payment`, nullable, `related_name="receipt_document"`)
- Relationship type: **explicit OneToOne**
- Deterministic? **Yes**
- Confidence: **High**
- First safe check:
  - “Payment exists but no `ReceiptDocument` exists for `payment_id`” (admin-only operational gap; deterministic).
- Deferred checks:
  - “Receipt exists but wrong receipt_type for payment-linked receipts” is validated by `ReceiptDocument.clean()` but can still be audited.
- Risk notes:
  - Receipt generation is an explicit action (`generate_emi_payment_receipt`); missing receipts can be normal in some workflows unless policy mandates otherwise.

### 3.3 Payment → JournalEntry / accounting bridge link

- Source: `subscriptions.Payment`
- Target: `accounting.JournalEntry` (via `accounting.AccountingBridgePosting`)
- Fields:
  - `AccountingBridgePosting.source_model="Payment"`
  - `AccountingBridgePosting.source_id=str(payment.id)`
  - `AccountingBridgePosting.purpose` (e.g. `PAYMENT_COLLECTION`, `PAYMENT_REVERSAL`)
  - `AccountingBridgePosting.journal_entry` (OneToOne to `JournalEntry`)
  - `JournalEntry.source_model/source_id` also present (populated by bridge posting service)
- Relationship type: **generic source_model/source_id (structured)**
- Deterministic? **Yes**
- Confidence: **High**
- First safe check:
  - “Payment exists (non-reversed) but missing bridge posting for purpose `PAYMENT_COLLECTION`.”
- Deferred checks:
  - Finance account resolution ambiguity checks exist in bridge runner; but in Control Tower, only detect “missing bridge” not “why missing” unless reasons are persisted.
- Risk notes:
  - There are two posting paths that can create a `PAYMENT_COLLECTION` bridge:
    - `subscriptions.services.payment_service` → `FinancePostingService.post_subscription_collection(...)`
    - `accounting.services.bridge_run_service.run_bridge_postings(...)`
    Phase F should treat either as acceptable; only require existence of the bridge row for the policy-selected purpose.

### 3.4 EMI → Subscription link

- Source: `subscriptions.Emi`
- Target: `subscriptions.Subscription`
- Fields: `Emi.subscription` (FK, `related_name="emis"`)
- Relationship type: **explicit FK**
- Deterministic? **Yes**
- Confidence: **High**
- First safe check:
  - “EMI exists without subscription” is impossible in DB, so instead use this link to drive reconciliation scopes (subscription-based rollups).
- Risk notes:
  - None; FK is mandatory.

### 3.5 Subscription → Customer / Product / Batch / Lucky ID link

- Source: `subscriptions.Subscription`
- Targets: `subscriptions.Customer`, `subscriptions.Product`, `subscriptions.Batch`, `subscriptions.LuckyId`
- Fields (confirmed via usage patterns; see `subscriptions.models.Subscription` references throughout services):
  - `Subscription.customer` (FK)
  - `Subscription.product` (FK)
  - `Subscription.batch` (FK)
  - `Subscription.lucky_id` (FK, nullable) + `lucky_number` is carried via lucky id entity
- Relationship type: **explicit FK (where present)**
- Deterministic? **Yes**
- Confidence: **High**
- First safe check:
  - “Subscription is a winner but has no lucky id” is deterministically checkable (policy-dependent).
- Deferred checks:
  - Product/batch lifecycle reconciliation beyond links (delivery/inventory/billing) should be deferred unless explicitly linked.
- Risk notes:
  - Lucky id can be absent depending on workflow stage; avoid noisy checks.

### 3.6 Waiver → EMI / subscription / lucky draw winner link

Current “waiver” evidence is distributed (no single `EmiWaiver` model):

- Source: waiver action is represented by:
  - `Emi.status = WAIVED`
  - `FinancialLedger(entry_type=EMI_WAIVER, payment=NULL, emi=<emi>)`
  - `AuditLog(action_type=WINNER_WAIVER_APPLIED, model_name, object_id=<subscription.id>, metadata={...})`
  - `BusinessEventLog(event_type=WAIVER_APPLIED, subscription FK, lucky_id FK, payload={...})`
- Relationship types:
  - **explicit FK**: `FinancialLedger.emi`, `BusinessEventLog.subscription`, `BusinessEventLog.lucky_id`
  - **derived only / metadata**: audit metadata carries draw context; does **not** list EMI IDs
- Deterministic? **Partially**
  - Waiver → EMI: **Yes** via `FinancialLedger.emi` + `entry_type=EMI_WAIVER` and/or `Emi.status=WAIVED`.
  - Waiver → winning draw record: **Medium** (winner draw objects exist, but the waiver evidence stored on ledger/audit is not a strict FK to draw).
- Confidence: **Medium**
- First safe check:
  - “EMI has `status=WAIVED` but has no `FinancialLedger` waiver entry” (if policy requires ledger record as source-of-truth for waiver).
- Deferred checks:
  - “Lucky draw winner should have waiver applied” requires a clear “winner” source-of-truth relationship; keep Phase F conservative unless exact winner evidence query is fixed and stable.
- Risk notes:
  - Avoid using audit log metadata as the sole evidence for financial totals; treat it as supplemental.

### 3.7 Direct sale invoice → payment/receipt link

- Sources: `billing.DirectSale`, `billing.BillingInvoice`, `billing.ReceiptDocument`
- Links:
  - `BillingInvoice.direct_sale` (FK nullable)
  - `ReceiptDocument.billing_invoice` (FK nullable)
  - `ReceiptDocument.direct_sale` (FK nullable)
  - `ReceiptDocument.posted_journal_entry` (OneToOne)
- Relationship type: **explicit FK**
- Deterministic? **Yes** for invoice ↔ receipt linkage and receipt ↔ journal linkage.
- Confidence: **High**
- First safe check:
  - “BillingInvoice is POSTED but `posted_journal_entry_id` is NULL” (already enforced by model clean; still a safe audit check).
- Deferred checks:
  - “Invoice paid totals vs receipts totals” is deterministic but can be noisy if partial receipts/refunds exist; treat as Phase F only if scope & rules are explicit.
- Risk notes:
  - Receipts can also be “manual” sources; checks must filter by `receipt_type` and `source_type` carefully.

### 3.8 Direct sale invoice → stock movement link

- Source: `billing.BillingInvoiceLine` / `billing.DirectSaleReturnLine` / notes lines
- Target: `inventory.StockLedger`
- Link fields:
  - `StockLedger.reference_model` = `"BillingInvoiceLine"` (and other line models)
  - `StockLedger.reference_id` = `"{invoice.id}:{line.id}"` (pattern used by inventory stock services)
- Relationship type: **string reference (normalized convention)**
- Deterministic? **Yes**, **only** when reference conventions are strictly followed by services.
- Confidence: **Medium** (string-based; depends on conventions)
- First safe check:
  - “Posted invoice expected stock movements missing for known reference patterns” (only if check is scoped to specific known movement types and uses exact pattern matching).
- Deferred checks:
  - Deep valuation/cost reconciliation across inventory and accounting.
- Risk notes:
  - This must not become a noisy “guess”; only check known `reference_model` values and exact `reference_id` formats used by services.

### 3.9 Return/cancellation/void → original invoice/stock/accounting link

- Sources: `billing.DirectSaleReturn`, `billing.BillingCreditNote`, `billing.CustomerRefund`, `billing.PurchaseReturn`, plus `subscriptions.OperationalCancellation`
- Links (explicit):
  - `DirectSaleReturn.original_invoice` (FK)
  - `DirectSaleReturn.credit_note` (OneToOne)
  - `CustomerRefund.direct_sale_return` (FK)
  - `CustomerRefund.posted_journal_entry` (OneToOne)
  - `PurchaseReturn.purchase_bill` (FK) + `posted_journal_entry` (OneToOne)
  - `OperationalCancellation.source_type + source_id + source_reference` (string typed identity)
- Relationship type: **explicit FK** plus **typed source fields**
- Deterministic? **Yes** for the FK links; **Medium** for operational cancellation typed identity.
- Confidence: **High** (FK paths), **Medium** (OperationalCancellation typed link)
- First safe check:
  - “Return/refund is POSTED/PAID but missing `posted_journal_entry` where model requires it.”
- Deferred checks:
  - Full lifecycle “void implies stock reversal exists” across all return kinds is complex; defer unless links are standardized for each kind.
- Risk notes:
  - Operational cancellation is a control-plane record; do not treat it as financial source-of-truth.

### 3.10 Inventory stock movement → source document link

- Source: `inventory.StockLedger`
- Target: various (invoice lines, delivery, purchase bill lines, production lines)
- Link fields:
  - `StockLedger.reference_model` (string)
  - `StockLedger.reference_id` (string)
- Relationship type: **string reference**
- Deterministic? **Yes** only for known `reference_model` enumerations and stable formatting used in services.
- Confidence: **Medium**
- First safe check:
  - “StockLedger rows with empty/unknown reference_model/reference_id” (integrity/quality check; low-noise).
- Deferred checks:
  - Attempting to resolve arbitrary `reference_model` strings to actual rows without a canonical registry.
- Risk notes:
  - Do not implement generic cross-app dereferencing until Phase F+ has a controlled allowlist and normalization layer.

### 3.11 Manufacturing job/BOM → inventory movement link

- Sources: `manufacturing.ProductionMaterialIssueLine`, `manufacturing.ProductionReceiptLine`
- Targets: `inventory.StockLedger`
- Link fields:
  - `StockLedger.reference_model="ProductionMaterialIssueLine"` and `reference_id=str(line.id)`
  - `StockLedger.reference_model="ProductionReceiptLine"` and `reference_id=str(line.id)`
  - Stock ledger notes carry `job.job_no` (auxiliary, not primary key)
- Relationship type: **string reference (stable, single-id)**
- Deterministic? **Yes** for known models.
- Confidence: **High-Medium** (still string, but simple id string)
- First safe check:
  - “Manufacturing posted lines exist but stock ledger entry missing for that line id” (requires scoped query for posted manufacturing lines).
- Deferred checks:
  - WIP cost and valuation integrity checks.
- Risk notes:
  - For Phase F, prefer detection keyed to manufacturing line models, not free-form stock ledger scans.

### 3.12 Purchase/vendor bill/payment → inventory/accounting/payable link

- Sources: inventory procurement and vendor finance models
- Links (explicit):
  - `inventory.PurchaseBill.posted_journal_entry` (OneToOne)
  - `inventory.VendorBill.posted_journal_entry` (OneToOne)
  - `inventory.VendorPayment.posted_journal_entry` (OneToOne)
  - `inventory.VendorBill.goods_receipt` / `purchase_order` (FKs)
- Inventory movement links:
  - `StockLedger.reference_model="PurchaseBillLine"` + `reference_id=f"{purchase_bill.id}:{line.id}"`
  - `StockLedger.reference_model="GoodsReceiptLine"` + `reference_id=f"{receipt.id}:{line.id}"`
- Relationship type: **explicit FK** + **string reference**
- Deterministic? **Yes** (with known references)
- Confidence: **High** (journals via OneToOne), **Medium** (stock via string)
- First safe check:
  - “Posted purchase bill/vendor payment exists but missing posted journal entry” (model-enforced patterns).
- Deferred checks:
  - Stock quantity vs payable totals cross-check.
- Risk notes:
  - Phase F should avoid deep AP aging rules unless formalized.

### 3.13 Commission → payout link

- Source: `subscriptions.Commission`
- Target: `subscriptions.CommissionPayoutLine` / `subscriptions.CommissionPayoutBatch`
- Fields:
  - `CommissionPayoutLine.commission` (OneToOne)
  - `CommissionPayoutLine.payout_batch` (FK)
- Relationship type: **explicit FK / OneToOne**
- Deterministic? **Yes**
- Confidence: **High**
- First safe check:
  - “Commission is SETTLED/PAID but missing payout line (policy-specific)” (only if business rule requires payout line for settled states).
- Deferred checks:
  - Partner balance reconciliation.
- Risk notes:
  - Commission status semantics must be confirmed before strict checks.

### 3.14 Payout → payable/accounting link

- Source: `subscriptions.CommissionPayoutBatch`
- Target: `accounting.AccountingBridgePosting` / `accounting.JournalEntry`
- Fields:
  - `AccountingBridgePosting(source_model="CommissionPayoutBatch", source_id=str(batch.id), purpose="COMMISSION_PAYOUT_BATCH")`
- Relationship type: **generic source_model/source_id (structured)**
- Deterministic? **Yes**
- Confidence: **High**
- First safe check:
  - “FINALIZED payout batch missing accounting bridge posting `COMMISSION_PAYOUT_BATCH`.”
- Deferred checks:
  - Bank settlement matching for payouts.
- Risk notes:
  - Ensure Phase F scopes by payout batch status (`FINALIZED`) to avoid noise.

### 3.15 Rent/lease contract → deposit/monthly billing/payment/accounting link

- Sources: `subscriptions.Subscription` (RENT/LEASE), `subscriptions.RentLeaseBillingDemand`, `subscriptions.RentLeaseDepositTransaction`
- Links:
  - `RentLeaseBillingDemand.subscription` (FK)
  - `RentLeaseDepositTransaction.subscription` (FK)
  - `RentLeaseDepositTransaction.demand` (FK nullable)
- Relationship type: **explicit FK**
- Deterministic? **Yes** for contract ↔ demand/transaction.
- Accounting link: **Missing/deferred**
  - `subscriptions.services.rent_lease_finance_sync_service` explicitly logs “ACCOUNTING_SYNC_SKIPPED” audit events; no journal/bridge posting is created.
- Confidence: **High** (operational tables), **Impossible without schema/work** (accounting posting)
- First safe check:
  - “Deposit demand exists but has inconsistent totals (collected/held/refundable)” is deterministic (internal consistency check).
- Deferred checks:
  - Any “rent/lease demand ↔ accounting journal” reconciliation (not possible until bridges are implemented).
- Risk notes:
  - Treat rent/lease accounting checks as **DEFER** until posting bridges exist.

### 3.16 Delivery → source contract/invoice/subscription/direct-sale link

- Sources: `subscriptions.SubscriptionDelivery`, `billing.DirectSale` and billing delivery flows
- Links:
  - `SubscriptionDelivery.subscription` (FK)
  - `DirectSale.delivery_reference` (string) + delivery status timestamps
  - Inventory delivery bridge uses `StockLedger.reference_model="SubscriptionDelivery"`, `reference_id=str(delivery.id)` (service-created)
- Relationship type: **explicit FK** (subscription delivery), **string reference** (direct sale delivery reference)
- Deterministic? **Yes** for subscription delivery; **Medium** for direct sale delivery reference.
- Confidence: **High** (subscription delivery), **Low-Medium** (direct sale delivery reference)
- First safe check:
  - “SubscriptionDelivery exists but no stock ledger movement entries for known delivery movement types” (only if inventory bridge is mandatory for that flow).
- Deferred checks:
  - Customer service desk workflows that use mixed source references.
- Risk notes:
  - Delivery-related checks can be noisy unless the delivery bridge policy is enforced for all relevant products.

### 3.17 Receipt PDF → ReceiptDocument source link

- Source: `billing.ReceiptDocument`
- Evidence contract: `subscriptions.services.document_engine_service.DocumentMeta` (`DocumentSource.RECEIPT`)
- Fields:
  - `DocumentMeta.source_model = "billing.ReceiptDocument"`
  - `DocumentMeta.source_object_id = receipt.id`
  - ReceiptDocument also carries `payment_id`, `subscription_id`, `billing_invoice_id`, `direct_sale_id`
- Relationship type: **explicit FK** + **DocumentMeta adapter**
- Deterministic? **Yes**
- Confidence: **High**
- First safe check:
  - “Payment has receipt, but receipt PDF source identity cannot be resolved” (should not happen with current allowlist; still a safe sanity check).
- Deferred checks:
  - Checksum validation for on-demand receipt PDFs (checksum currently None by design).
- Risk notes:
  - Receipt PDFs are on-demand render; do not expect stored checksum or stored pdf file.

### 3.18 SubscriptionDocument/file → Subscription source link

- Source: `subscriptions.SubscriptionDocument`
- Target: `subscriptions.Subscription`
- Fields:
  - `SubscriptionDocument.subscription` (FK)
- Relationship type: **explicit FK**
- Deterministic? **Yes**
- Confidence: **High**
- First safe check:
  - “Subscription has required document types missing” is policy-dependent; avoid Phase F unless requirements are explicit.
- Deferred checks:
  - Document verification workflow reconciliation (requires business rule confirmation).
- Risk notes:
  - Treat SubscriptionDocument as the canonical record of uploaded/generated contract artifacts; PDF content checksum is file-backed here.

### 3.19 AuditLog → source record link

- Source: `subscriptions.AuditLog`
- Target: any model (typed by `model_name` + `object_id`)
- Fields:
  - `AuditLog.model_name` (string)
  - `AuditLog.object_id` (int)
  - `AuditLog.metadata` (JSON)
- Relationship type: **string typed identity**
- Deterministic? **Medium**
  - Deterministic as “this audit row claims it refers to X”, but not enforced by FK.
- Confidence: **Medium**
- First safe check:
  - “Payment exists but has no audit trail of key events” is policy-dependent and can be noisy; avoid Phase F unless requirements are explicit.
- Deferred checks:
  - Reconstructing financial state from audit logs.
- Risk notes:
  - Treat audit logs as supplemental evidence and for explainability, not as the primary financial ledger.

### 3.20 BusinessEventLog → source record link

- Source: `subscriptions.BusinessEventLog` (append-only)
- Targets: `Customer`, `Subscription`, `Payment`, `Batch`, `LuckyId`, `ContractReference` (nullable FKs)
- Fields:
  - `BusinessEventLog.customer/subscription/payment/batch/lucky_id/contract_reference` (FKs, nullable)
  - `BusinessEventLog.ledger_reference` (string)
  - `BusinessEventLog.source_module` (string)
- Relationship type: **explicit FK (nullable)** + **string reference**
- Deterministic? **Yes** for populated FKs; **Medium** for `ledger_reference`.
- Confidence: **High** (FK paths), **Medium** (`ledger_reference`)
- First safe check:
  - “Bridge journal exists but no `LEDGER_POSTED` event” is policy-dependent; avoid Phase F unless required.
- Deferred checks:
  - Use `ledger_reference` as a strict foreign key (not safe today).
- Risk notes:
  - BusinessEventLog is ideal for explainability and operational tracing; keep it supplemental to accounting/ledger records.

## 4) Phase F check classification (deterministic-only)

### READY_FOR_PHASE_F (deterministic, low noise, admin-only explainable)

1. **Payment exists but no ReceiptDocument**
   - Evidence: `Payment.id` → no `ReceiptDocument(payment_id=payment.id)`.
2. **ReceiptDocument exists but payment missing/invalid**
   - Evidence: `ReceiptDocument.payment_id` set but referenced `Payment` missing (DB should prevent) OR receipt has `receipt_type != EMI_PAYMENT_RECEIPT` while `payment_id` is set (model clean enforces; safe to audit).
3. **EMI marked PAID but no payment/ledger link**
   - Evidence: `Emi.status == PAID` but no `FinancialLedger(emi_id=emi.id, entry_type=EMI_PAYMENT)` (or net-paid calculation indicates zero).
4. **Payment exists but EMI still PENDING/open**
   - Evidence: `Payment.emi_id` exists and `Emi.status == PENDING` while `FinancialLedger` indicates payment posted; scope to the specific EMI id to avoid noise.
5. **Payment exists but accounting bridge posting missing**
   - Evidence: missing `AccountingBridgePosting(source_model="Payment", source_id=str(payment.id), purpose="PAYMENT_COLLECTION")` for non-reversed payments.
6. **Duplicate accounting posting for same payment/source**
   - Evidence: should be prevented by unique constraint on `AccountingBridgePosting(source_model, source_id, purpose)`; Phase F can safely check for violations or multiple journals with same `JournalEntry.source_model/source_id` (secondary).
7. **Journal entry unbalanced**
   - Evidence: `JournalEntryGroup.is_balanced == False` (when present) or control validation service results; deterministic.
8. **Journal without expected source reference**
   - Evidence: journal exists but `source_model/source_id` missing where policy requires it (bridge-posted journals should always have them).

### NEEDS_SCHEMA_LINK (missing/ambiguous relations; requires additive source references)

1. **Direct sale “invoice paid” vs receipts vs refunds** (when trying to tie every receipt/refund precisely to a payment object; receipts exist, but not always via `subscriptions.Payment`).
2. **Stock-out vs delivery vs invoice cross-module matching** for all cases (depends on string reference conventions and optional operational paths).
3. **Generic dereferencing of `StockLedger.reference_model/reference_id`** without a canonical allowlist registry (needs a safe model registry + normalization).

### NEEDS_BUSINESS_RULE_CONFIRMATION (link exists; expected effect not formally encoded)

1. **Waived EMI still counted collectible**
   - Waiver evidence exists (`Emi.status=WAIVED`, `FinancialLedger entry_type=EMI_WAIVER`), but “collectible” definition in admin operational views must be confirmed before flagging.
2. **Future EMI waiver missing for lucky draw winner**
   - Winner evidence exists, but what qualifies as deterministic “winner” source-of-truth (draw models vs subscription fields) must be formally defined for Phase F to avoid noise.

### DEFER (high false-positive risk / mutation-heavy lifecycle)

1. Deep lifecycle reconciliation for return/exchange/cancellation across:
   - invoices, credit notes, refunds, stock reversals, and accounting voids
2. Rent/lease accounting reconciliation (posting is deferred-by-design today).

## 5) Deterministic source-link results (requested summaries)

### 5.1 Payment/receipt/document source-link result

- **Payment → ReceiptDocument**: deterministic via `ReceiptDocument.payment` (OneToOne).
- **ReceiptDocument → PDF**: deterministic via `DocumentMeta` adapter (`source_model="billing.ReceiptDocument"`, `source_object_id=<receipt.id>`).
- **SubscriptionDocument/file → Subscription**: deterministic via `SubscriptionDocument.subscription` (FK) and document engine meta adapter when used.

### 5.2 EMI/payment/accounting bridge source-link result

- **Payment → EMI**: deterministic FK (`Payment.emi`).
- **Payment → FinancialLedger**: deterministic OneToOne (`FinancialLedger.payment`) plus `FinancialLedger.emi`.
- **Payment → Accounting**: deterministic bridge posting (`AccountingBridgePosting(source_model="Payment", purpose="PAYMENT_COLLECTION") → JournalEntry`) and `JournalEntry(source_model/source_id)` populated by bridge service.
- **Payment → Journal grouping**: deterministic via `JournalEntry.journal_group` and `FinancialLedger.journal_group` updated by `FinancePostingService.post_subscription_collection`.

### 5.3 Direct sale / stock / accounting source-link result

- **Invoice → JournalEntry**: deterministic via `BillingInvoice.posted_journal_entry` (OneToOne, required for POSTED/VOID).
- **Receipt → JournalEntry**: deterministic via `ReceiptDocument.posted_journal_entry` (OneToOne, required for POSTED/VOID).
- **Invoice lines → StockLedger**: deterministic *only for known reference patterns* (`reference_model="BillingInvoiceLine"`, `reference_id="<invoice_id>:<line_id>"`).

### 5.4 Commission/payout source-link result

- **Commission → Payment**: deterministic via `Commission.payment` (OneToOne, nullable).
- **Commission → Payout**: deterministic via `CommissionPayoutLine.commission` (OneToOne).
- **PayoutBatch → Accounting**: deterministic via `AccountingBridgePosting(source_model="CommissionPayoutBatch", purpose="COMMISSION_PAYOUT_BATCH")`.

### 5.5 Rent/lease/deposit source-link result

- **Subscription(RENT/LEASE) → BillingDemand/DepositTransaction**: deterministic via explicit FKs.
- **Rent/lease → Accounting**: **not deterministic today** (explicitly deferred; only audit events are written).

## 6) Risks and guardrails for Phase F

- Prefer checks that can be explained by **a single join** (FK or unique bridge key), not multi-hop heuristics.
- For string-based inventory references, Phase F must use an allowlist of `reference_model` values and exact `reference_id` formatting per model.
- Never treat audit logs as primary financial source-of-truth; use them for “why” and trace context.
- Keep Phase F admin-only and read-only; no auto-correction.

## 7) Recommended Phase F implementation scope (based on this map)

Implement only:

- Payment ↔ ReceiptDocument presence checks.
- EMI status ↔ FinancialLedger consistency checks.
- Payment ↔ AccountingBridgePosting presence/uniqueness checks for `PAYMENT_COLLECTION` and (optionally) `PAYMENT_REVERSAL`.
- JournalEntryGroup balance checks (when journal groups exist) and bridge-posted journal metadata sanity checks.

Defer:

- Cross-module invoice/stock/delivery “end-to-end” checks unless explicitly keyed to stable references.
- Rent/lease accounting reconciliation (until posting bridges exist).
- Winner waiver “missing waiver” checks until winner evidence definition is finalized.
