# Inventory StockLedger Source-Link Contracts (Deterministic)

Status: **Inventory Source-Link Hardening – IMPLEMENTED (docs + tests only)**  
Date: **2026-05-21**  
Scope: **inventory stock traceability** via `inventory.StockLedger(reference_model, reference_id)`  
Non-goals:
- No stock movement behavior changes
- No mutation/backfill of historical `StockLedger` rows
- This document does not change reconciliation behavior; Control Tower checks reuse these contracts (see Phase I/Phase J).

This document standardizes the **deterministic** `StockLedger.reference_model/reference_id` contracts used by current stock-posting workflows so reconciliation can safely expand beyond Phase I without guessing joins or inferring relationships.

## Principles

- `StockLedger` is a string-based “source-link” mechanism (not FK). Any reconciliation that uses it must rely on **stable, documented formats** only.
- Formats must be **deterministic** and **idempotent-safe** with the existing unique constraint:
  - `(inventory_item, movement_type, reference_model, reference_id)` is unique.
- If a workflow uses “fallback” references (notes search, free-text, legacy model names), it is **not eligible** for strict allowlist-based reconciliation.

## StockLedger writers (confirmed)

All `StockLedger` creation in the repo is routed through one of these primitives:

1) `backend/inventory/services/stock_service.py#create_stock_ledger_entry`  
   - Idempotent: catches uniqueness errors and returns the existing row.
2) `backend/inventory/services/stock_movement_service.py#post_movement`  
   - Strict: writes directly; duplicates raise via DB unique constraint.

Every workflow below uses one of the two primitives above.

## Deterministic source-link contracts (confirmed by code)

Format notes:
- `{id}` means a numeric Django PK rendered as decimal string.
- `{a}:{b}` means two numeric IDs separated by a single colon.

### A) Direct sale / billing stock movements

| `reference_model` | `reference_id` format | Movement types | Direction | Writer (evidence) | Source record | Posting gate (status) | Deterministic? | Legacy/notes |
|---|---|---|---|---|---|---|---|---|
| `BillingInvoiceLine` | `{invoice_id}:{line_id}` | `SALE_OUT` | OUT | `inventory.services.stock_service.post_invoice_stock_movements` | `billing.BillingInvoiceLine` | `BillingInvoice.status=POSTED` (after posting journal) | Yes | Some older logic queries “fallback” refs like `DirectSaleLine` in `billing.services.reversal_service.get_sale_out_quantity` – do not rely on it for reconciliation. |
| `DirectSaleReturnLine` | `{return_id}:{line_id}` | `SALE_RETURN_IN` | IN | `billing.services.reversal_service.post_sale_return_stock_movement` | `billing.DirectSaleReturnLine` | `DirectSaleReturn.status=POSTED` and `stock_effect=True` | Yes | None |
| `DirectSaleExchangeReplacement` | `{return_id}:{index}` (1-based index in `exchange_replacement_lines`) | `SALE_OUT` | OUT | `billing.services.reversal_service.post_exchange_replacement_stock_movement` | `billing.DirectSaleReturn` metadata | `DirectSaleReturn.status=POSTED` | Mostly (metadata-order dependent) | Deterministic as long as the persisted replacement-lines list is not re-ordered after approval; do not infer replacements if metadata is missing/legacy. |
| `BillingCreditNoteLine` | `{credit_note_id}:{line_id}` | `SALE_RETURN_IN` | IN | `inventory.services.stock_service.post_credit_note_stock_movements` | `billing.BillingCreditNoteLine` | `BillingCreditNote.status=POSTED` | Yes | Not currently allowlisted for Phase I reconciliation checks (preparation-only here). |
| `BillingDebitNoteLine` | `{debit_note_id}:{line_id}` | `ADJUSTMENT_OUT` | OUT | `inventory.services.stock_service.post_debit_note_stock_movements` | `billing.BillingDebitNoteLine` | `BillingDebitNote.status=POSTED` | Yes | Not currently allowlisted for Phase I reconciliation checks (preparation-only here). |

### B) Manufacturing stock movements

| `reference_model` | `reference_id` format | Movement types | Direction | Writer (evidence) | Source record | Posting gate (status) | Deterministic? | Legacy/notes |
|---|---|---|---|---|---|---|---|---|
| `ProductionMaterialIssueLine` | `{line_id}` | `PRODUCTION_ISSUE_OUT`, `PRODUCTION_RETURN_IN` | MIXED | `manufacturing.services.production_service.post_production_material_movement` | `manufacturing.ProductionMaterialIssueLine` | `line.is_posted=True` after posting | Yes | None |
| `ProductionReceiptLine` | `{line_id}` | `PRODUCTION_RECEIPT_IN` | IN | `manufacturing.services.production_service.post_production_output` | `manufacturing.ProductionReceiptLine` | `line.is_posted=True` after posting | Yes | None |

### C) Procurement / purchase / GRN stock movements

| `reference_model` | `reference_id` format | Movement types | Direction | Writer (evidence) | Source record | Posting gate (status) | Deterministic? | Legacy/notes |
|---|---|---|---|---|---|---|---|---|
| `GoodsReceiptLine` | `{goods_receipt_id}:{line_id}` | `PURCHASE_IN` | IN | `inventory.services.procurement_service.post_goods_receipt` | `inventory.GoodsReceiptLine` | `GoodsReceipt.status=DRAFT → RECEIVED` | Yes | This is the “GRN/receipt” stock increase contract. |
| `PurchaseBillLine` | `{purchase_bill_id}:{line_id}` | `PURCHASE_IN` | IN | `inventory.services.stock_service.post_purchase_bill` | `inventory.PurchaseBillLine` | `PurchaseBill.status=APPROVED → POSTED` | Yes | Separate from GRN receipts; both can increase stock depending on operational flow. |
| `PurchaseReturnLine` | `{purchase_return_id}:{line_id}` | `PURCHASE_RETURN_OUT` | OUT | `billing.services.reversal_service.post_purchase_return` | `billing.PurchaseReturnLine` | `PurchaseReturn.status=DRAFT → POSTED` | Yes | None |

### D) Inventory adjustments and opening stock

| `reference_model` | `reference_id` format | Movement types | Direction | Writer (evidence) | Source record | Posting gate (status) | Deterministic? | Legacy/notes |
|---|---|---|---|---|---|---|---|---|
| `StockAdjustmentLine` | `{adjustment_id}:{line_id}` | `ADJUSTMENT_IN`, `ADJUSTMENT_OUT` | MIXED | `inventory.services.stock_service.post_stock_adjustment` | `inventory.StockAdjustmentLine` | `StockAdjustment.status=APPROVED → POSTED` | Yes | None |
| `OpeningStockEntry` | `{opening_stock_entry_id}` | `OPENING_BALANCE_IN` | IN | `inventory.services.opening_stock_entry_service.post_opening_stock_entry` | `inventory.OpeningStockEntry` | `OpeningStockEntry.status=DRAFT → POSTED` | Yes | None |
| `OpeningStockImport` | `{digest}:{csv_row_number}:{location_code}` | `OPENING_BALANCE_IN` | IN | `inventory.services.opening_stock_import_service.post_opening_stock_import` | CSV row (import batch) | import call is idempotent via deterministic digest | Yes | Digest = `sha256(csv_text)[:16]`. Row number is CSV data row index (starts at 2). |

### E) Delivery (subscription) stock bridge

| `reference_model` | `reference_id` format | Movement types | Direction | Writer (evidence) | Source record | Posting gate (status) | Deterministic? | Legacy/notes |
|---|---|---|---|---|---|---|---|---|
| `SubscriptionDelivery` | `{delivery_id}` | `EMI_DELIVERY_OUT`, `EMI_RETURN_IN` | MIXED | `inventory.services.delivery_bridge_service.sync_delivery_inventory_bridge` | `subscriptions.SubscriptionDelivery` | `DeliveryStatus in {DELIVERED, RETURNED}` and inventory bridge enabled | Yes | Also used by `inventory.services.stock_movement_service.post_delivery_out` for physical `DELIVERY_OUT` when that path is used. |
| `Subscription` | `{subscription_id}` | `SALE_RESERVE`, `SALE_RELEASE` | MIXED (soft-hold) | `inventory.services.stock_movement_service.reserve_stock_for_subscription` / `release_stock_reservation` | `subscriptions.Subscription` | workflow-specific | Yes | Soft-hold rows are excluded from physical stock totals by `SOFT_HOLD_MOVEMENT_TYPES`. |

## Known ambiguous / deferred source links

These exist in code but are **not eligible** for strict allowlist-based reconciliation until fixed/standardized:

- `RentLeaseReturnInspection` stock routing in `backend/subscriptions/services/return_inspection_service.py` calls `post_movement` using non-existent kwargs (`quantity_in/quantity_out`). This indicates an incomplete/incorrect integration contract and should be treated as **deferred** for source-link allowlisting until corrected and covered by tests.
- Legacy fallback references used only for analysis (e.g., `reference_model="DirectSaleLine"` + notes search) must not be treated as deterministic evidence.

## Backfill posture (future-only, no mutation here)

If historical `StockLedger.reference_model/reference_id` rows exist with legacy formats for any of the allowlisted models:
- Do **not** auto-correct.
- Provide a dedicated, auditable backfill/migration plan that:
  - is additive (no destructive rewrites),
  - is deterministic (explicit join keys only),
  - produces an audit log of every row changed,
  - can be rolled back safely.
