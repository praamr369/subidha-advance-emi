# Sales Document Flow Rules (Direct Sale + EMI Contract)

## Scope
This document describes the implemented sales-document flow in the current repository.
It covers direct sale and EMI contract lanes that share customer/finance/reporting backbones while remaining operationally separate.

## Implemented source-of-truth lanes

### 1) Direct Sale lane (retail)
Code references:
- `backend/billing/models.py`
- `backend/billing/services/billing_service.py`
- `backend/billing/services/direct_sale_collection_service.py`
- `backend/subscriptions/services/operational_cancellation_service.py`
- `backend/billing/services/direct_sale_delivery_bridge_service.py`

Flow:
1. `DirectSale` is created/updated with line items and customer snapshot.
2. A linked `BillingInvoice` draft is synchronized from the sale.
3. Invoice is approved then posted.
4. Posting writes accounting bridge journal (`RETAIL_SALE`) and stock movement ledger entries.
5. Receipts are posted as separate `ReceiptDocument` rows and update invoice/sale balances.
6. Collection is allowed only for operationally active, invoiced sale with posted invoice and positive outstanding.
7. Void/cancel/reversal keeps history and creates reversal traces; no destructive mutation of posted rows.

### 2) EMI contract lane (Lucky Plan / Advance EMI)
Code references:
- `backend/subscriptions/services/subscription_service.py`
- `backend/subscriptions/services/subscription_request_service.py`
- `backend/subscriptions/services/emi_engine.py`
- `backend/billing/services/billing_sync_service.py`

Flow:
1. Subscription request is approved through admin workflow.
2. EMI subscription is created with Lucky ID validation and batch constraints.
3. EMI schedule is generated deterministically from tenure/base price.
4. Billing profile/installment mirrors are synced from subscription + EMI rows.
5. Payment posting remains in payment service path; billing receipts mirror as additive documents.

## Cross-lane invariants (implemented)
- Direct sale and EMI subscription are separate source entities.
- Billing documents preserve source linkage (`source_type`, `source_reference`, `direct_sale`, `subscription`).
- Cancelled/void invoice documents are history-only and non-collectible.
- Voided receipts are excluded from active collection totals.
- Outstanding is computed from active posted document/payment posture only.
- Delivery progression is blocked for cancelled/reversed direct-sale states and non-posted invoice states.
- Lucky draw winner waiver remains future-EMI-only behavior.

## Explicit non-goals in current implementation
- No merge of direct-sale collection path with EMI collection path.
- No frontend mutation of ledger truth.
- No silent hard-delete of invoice/receipt/payment audit history.

## Proposed additive future work (not yet implemented)
- Add explicit persisted state machine event table for direct-sale status transitions.
- Add end-to-end document lineage export (source document -> receipt -> journal entry -> reconciliation row).
