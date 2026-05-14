# Product vs Inventory Profile

## Rule
- `Product` is the catalog and Lucky Plan contract truth.
- `InventoryItem` is the stock and costing profile for operational inventory control.

## Preparation
- Admin prepares inventory profile from product detail.
- Preparation is idempotent: existing profile is reused.
- SKU defaults from product code/SKU and remains admin-editable later.
- Preparation does not create opening stock or ledger movement.

## Quantity control
- Inventory profile can display quantity.
- Real quantity mutation is allowed only through:
  - opening stock posting
  - goods receipt
  - stock adjustment
  - sale/delivery outflow
  - return inflow
  - manufacturing receipt flow

## Financial safety
- Product base price remains unchanged.
- EMI/payment/lucky draw/commission/payout/reconciliation semantics remain unchanged.
