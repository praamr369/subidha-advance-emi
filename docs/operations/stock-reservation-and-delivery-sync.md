# Stock Reservation and Delivery Sync

## Implemented Operational Pattern

### 1. Direct Sale Creation
- API: `POST /api/v1/billing/direct-sales/`
- Service: `billing/services/billing_service.py`
- Behavior:
  - Creates/updates direct-sale line payloads.
  - Evaluates ATP via inventory item.
  - Creates/upserts `PurchaseNeed` (stock requirement) when shortage exists or requirement is explicitly requested.

### 2. Requirement Recheck
- API: `POST /api/v1/admin/inventory/stock-needs/{id}/recheck/`
- Service: `inventory/services/purchase_need_reconciliation_service.py`
- Behavior:
  - Recomputes available quantity from inventory profile.
  - Resolves need as `FULFILLED` when ATP covers requirement.

### 3. Delivery Eligibility Gate
- Direct-sale delivery readiness uses:
  - invoice/payment state
  - open direct-sale `PurchaseNeed` blockers
- Delivery service-desk state sync:
  - `billing/services/direct_sale_delivery_bridge_service.py`

### 4. EMI Delivery Inventory Sync
- Service: `inventory/services/delivery_bridge_service.py`
- Behavior:
  - Delivered EMI case -> `EMI_DELIVERY_OUT`
  - Returned EMI case -> `EMI_RETURN_IN`

## Implemented Cancellation Sync
- API: `POST /api/v1/billing/direct-sales/{id}/cancel/`
- Service: `subscriptions/services/operational_cancellation_service.py`
- Effect:
  - Cancels open/in-review direct-sale stock requirements for both legacy and keyed source ids.

## Important Non-Implemented Reservation Detail
- Direct sale currently uses requirement workflow, not automatic stock-reserve ledger movement.
- This is intentional in current code and keeps inventory posting explicit.

## Proposed Future Additive Work (Not Implemented)
- Auto-create `SALE_RESERVE` at direct-sale confirmation for deliverable lines.
- Auto-create `SALE_RELEASE` on sale cancel / delivery completion where reservation exists.
