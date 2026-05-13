# Inventory Adjustment and Return Workflow

## Stock Adjustment (Implemented)
- Domain: `StockAdjustment`, `StockAdjustmentLine`
- Lifecycle:
  - `DRAFT` -> `APPROVED` -> `POSTED` (or `CANCELLED` from approved)
- Ledger behavior:
  - Posting creates explicit stock ledger movements.
  - Adjustment history is not rewritten.

## Direct Sale Return (Implemented)
- Service: `billing/services/reversal_service.py`
- Return flow:
  - create return draft (`DirectSaleReturn` + lines)
  - approve
  - post
- Inventory behavior on post:
  - Creates `SALE_RETURN_IN` per eligible return line with source reference `DirectSaleReturnLine:{return_id}:{line_id}`.
  - Exchange replacement path posts `SALE_OUT` for replacement issue.

## Return Destination Handling (Implemented)
- Return destination controls target stock location for return-in movement.
- Non-sellable destinations require configured location.

## Controls
- Return quantity cannot exceed returnable quantity.
- Delivered-return flows require sale-out evidence.
- Stock posting is idempotent by movement reference.

## Negative Stock Prevention (Implemented)
Normal outbound movement posting now blocks underflow at location level.
This guard applies to regular sale/delivery/procurement/manufacturing outbound movement types.

## Proposed Future Additive Work (Not Implemented)
- Quality inspection workflow transitions from hold location to sellable/damaged disposition with explicit movement types and approval trail.
- Dedicated admin endpoint to convert hold inventory after inspection result capture.
