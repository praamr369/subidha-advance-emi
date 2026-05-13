# Inventory Stock Ledger (Phase 3)

## Scope (Implemented)
This document reflects current inventory/MM behavior implemented in:
- `backend/inventory/models.py`
- `backend/inventory/services/stock_service.py`
- `backend/inventory/services/stock_movement_service.py`
- `backend/inventory/services/delivery_bridge_service.py`
- `backend/billing/services/billing_service.py`
- `backend/subscriptions/services/operational_cancellation_service.py`

## Core Ledger Rules
- Stock history is append-only through `inventory_stock_ledger` (`StockLedger`).
- `StockLedger` enforces one-sided movement per row (`quantity_in` xor `quantity_out`).
- Every movement stores:
  - `movement_type`
  - `reference_model`
  - `reference_id`
  - `posted_by`
  - `movement_date`
  - location (`stock_location`)
- Duplicate movement keys are guarded by unique tuple:
  - `(inventory_item, movement_type, reference_model, reference_id)`

## Physical vs Reserved vs Available
From `InventoryItem`:
- `current_stock_quantity()` = opening + physical in - physical out
- `reserved_qty()` = `SALE_RESERVE` in - `SALE_RELEASE` out
- `available_qty()` = `current_stock_quantity - reserved_qty` (floored at `0`)

Soft-hold movement types are excluded from physical stock math:
- `SALE_RESERVE`, `SALE_RELEASE`
- `MAINTENANCE_HOLD`, `MAINTENANCE_RELEASE`
- `QUALITY_HOLD`, `QUALITY_RELEASE`

## Direct Sale Hook (Implemented)
Current direct-sale flow does not auto-reserve stock in ledger at sale creation.
Instead:
- Sale line ATP is evaluated from inventory profile.
- If shortage (or explicit request) exists, `PurchaseNeed` is created/upserted with `source_module=DIRECT_SALE`.
- Keyed source id format is used: `ds:{sale_id}:p:{product_id}`.

## Cancellation Hook (Implemented)
On direct-sale cancellation (`cancel_direct_sale`):
- Open/in-review direct-sale `PurchaseNeed` rows are marked `CANCELLED` for both:
  - legacy source id (`"{sale_id}"`)
  - keyed source id prefix (`"ds:{sale_id}:p:"`)

## Delivery / Return Hooks (Implemented)
- EMI delivery bridge writes inventory movement on delivery status transitions:
  - `DELIVERED` -> `EMI_DELIVERY_OUT`
  - `RETURNED` -> `EMI_RETURN_IN`
- Direct-sale return posting writes `SALE_RETURN_IN` with return-line reference.

## Negative Stock Guard (Implemented)
`create_stock_ledger_entry` now blocks stock-underflow for normal outbound movement types:
- `SALE_OUT`, `EMI_DELIVERY_OUT`, `DELIVERY_OUT`
- `PURCHASE_RETURN_OUT`, `VENDOR_RETURN`
- `PRODUCTION_ISSUE_OUT`, `PRODUCTION_CONSUME`, `TRANSFER_OUT`

If location-level available quantity is insufficient, posting fails with validation error.
Controlled admin adjustment flows remain separate (`ADJUSTMENT_*`, `STOCK_ADJUSTMENT`).

## Accounting Bridge Boundary
Inventory ledger posting does not invent valuation/accounting entries.
Accounting bridge postings are only done where existing accounting services explicitly run.

## Proposed Future Additive Work (Not Implemented)
- Explicit direct-sale reservation movement (`SALE_RESERVE`) at sale confirmation.
- Explicit reservation release (`SALE_RELEASE`) at direct-sale cancellation/finalization.
- Branch-level ATP rules for multi-location fulfillment preference.
