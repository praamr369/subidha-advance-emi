# Direct Sale Workflow

## Goal
Keep retail direct-sale billing, receipt, outstanding, and delivery controls explicit and auditable without mixing with EMI contract collection rails.

## Implemented direct-sale lifecycle

1. Create `DirectSale` with line-level product/inventory mapping and customer snapshots.
2. Sync linked draft `BillingInvoice` (source-linked to the sale).
3. Approve + post invoice.
4. Posting creates:
   - accounting bridge journal (`RETAIL_SALE`)
   - stock movement entries (`SALE_OUT`)
   - optional auto-receipt when received amount exists
5. Subsequent collections create posted retail receipts and reduce outstanding balances.
6. Delivery case and eligibility are synced from sale/invoice/payment/stock posture.

## Collectibility rules
A direct sale is collectible only when all are true:
- sale is operationally active
- sale status is `INVOICED`
- latest invoice status is `POSTED`
- outstanding balance is greater than zero

If invoice becomes `VOID/CANCELLED/REVERSED/CREDITED_FULLY`, direct-sale collection is blocked and row is history-only for collection posture.

## Cancellation/void/reversal controls
- Posted receipts can be voided only via explicit void flow (with reason + reversal journal).
- Invoice cancellation/void requires receipt reversal first.
- Direct-sale cancellation respects delivered/invoiced/reversal constraints and preserves auditable history.
- Final reversal/archive flow transitions sale to history-only statuses.

## Outstanding visibility controls
- Active outstanding excludes:
  - cancelled/reversed direct-sale statuses
  - cancelled/void/reversed/credited invoice states
  - voided receipts from active collection totals

## Operator guardrails
- Do not collect direct-sale balance from EMI collection screens.
- Do not post direct-sale reversal by editing balances manually.
- Use return/reversal workflows for delivered or posted-invoice corrections.

## Key code references
- `backend/api/v1/views/billing.py`
- `backend/api/v1/serializers/billing.py`
- `backend/billing/services/billing_service.py`
- `backend/billing/services/direct_sale_collection_service.py`
- `backend/billing/services/direct_sale_delivery_bridge_service.py`
- `backend/subscriptions/services/operational_cancellation_service.py`
- `backend/tests/billing/test_direct_sale_workflow.py`
- `backend/tests/api/test_direct_sale_api.py`
