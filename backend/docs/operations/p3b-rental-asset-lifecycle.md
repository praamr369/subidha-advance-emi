# P3B — Rental Asset Lifecycle

## Purpose

P3B adds per-unit tracking for physical furniture used in RENT and LEASE
contracts. An `InventoryItem` tracks how many units of a product are in stock
(quantities, valuation, movements). A `RentalAsset` tracks the lifecycle of
one identifiable unit by serial number and asset code through multiple
customer cycles: reservation → handover → return → repair → re-handover.

## InventoryItem vs RentalAsset

| | InventoryItem | RentalAsset |
|---|---|---|
| Scope | Quantity / stock count for a product type | One specific physical unit |
| Key fields | `opening_stock_qty`, `stock_ledger` | `asset_code`, `serial_no`, `status` |
| Stock count changes | Yes, via StockLedger movements | **No** — never mutates stock qty |
| Linked to | Product (one-to-one) | Product, optionally InventoryItem |
| Lifecycle | Purchase → adjustment → retirement | AVAILABLE → RESERVED → HANDED_OVER → RETURNED → AVAILABLE |

Physical stock counts remain the sole domain of the inventory app. The asset
lifecycle service does not post any StockLedger entries.

## Valid Asset Statuses

```
AVAILABLE    — in the shop, ready to be assigned
RESERVED     — committed to a subscription, not yet delivered
HANDED_OVER  — currently at customer premises
RETURNED     — physically back at the shop (post-return)
UNDER_REPAIR — sent for maintenance / servicing
RETIRED      — permanently decommissioned; cannot be handed over again
```

### Allowed Transitions

```
AVAILABLE → RESERVED
AVAILABLE → UNDER_REPAIR
AVAILABLE → RETIRED
RESERVED  → HANDED_OVER
RESERVED  → AVAILABLE  (cancel reservation)
HANDED_OVER → RETURNED
RETURNED  → AVAILABLE
RETURNED  → UNDER_REPAIR
RETURNED  → RETIRED
UNDER_REPAIR → AVAILABLE
UNDER_REPAIR → RETIRED
```

## Condition Snapshot Stages

`AssetConditionSnapshot` is append-only. Each row records the assessed
condition of a unit at a specific lifecycle stage:

| Stage | When recorded | Feeds into |
|---|---|---|
| `BEFORE_HANDOVER` | Before delivering to customer | Handover readiness condition proof |
| `AFTER_RETURN`    | When asset comes back to shop | Damage deduction / refund workflow |
| `DAMAGE_REVIEW`   | During damage assessment | Can be linked to damage deduction |
| `MAINTENANCE_REVIEW` | During repair / servicing | Internal quality record |

`condition_score` is 1–10 (1 = scrap, 10 = new). `condition_grade` mirrors
the enum: NEW / GOOD / FAIR / DAMAGED / SCRAP / UNKNOWN.

## How Asset Condition Proof Affects Handover Readiness

LEASE contracts require an **asset condition proof** before the contract can
reach `ACTIVE / HANDED_OVER` (controlled by `KYC_CONTRACT_GATING_ENABLED`).

P3B satisfies this with a `BEFORE_HANDOVER` `AssetConditionSnapshot`:

1. Admin records a `BEFORE_HANDOVER` snapshot (via
   `record_asset_condition_snapshot`) linked to the subscription.
2. `_has_condition_proof(subscription)` in
   `contract_activation_readiness_service` queries
   `subscription.asset_condition_snapshots.filter(stage=BEFORE_HANDOVER)`.
3. If one exists, condition proof is satisfied.

Fallback chain (most to least preferred):
1. `BEFORE_HANDOVER` snapshot (P3B, preferred)
2. `RETURN_INSPECTION_REPORT` subscription document (legacy)
3. `ASSET_HANDOVER_ACKNOWLEDGEMENT` subscription document (legacy)
4. `DELIVERY_HANDOVER_NOTE` subscription document (legacy)
5. `lease_profile.handover_notes` text (legacy)

All fallbacks remain active; no existing data is invalidated by P3B.

## Admin Endpoints (P3B, read-only)

```
GET  /api/v1/admin/rental-assets/
     ?status=AVAILABLE|RESERVED|HANDED_OVER|...
     ?product=<id>
     ?customer=<id>

GET  /api/v1/admin/rental-assets/<id>/

GET  /api/v1/admin/rental-assets/subscription-readiness/<subscription_pk>/
```

Write operations (reserve, hand over, return, retire) are performed via the
`rental_asset_lifecycle_service` module. A write API surface is deferred to
a future phase once the admin UI is designed.

## Service Module

`backend/subscriptions/services/rental_asset_lifecycle_service.py`

| Function | Description |
|---|---|
| `create_rental_asset_from_inventory(...)` | Register a new tracked unit |
| `reserve_asset_for_subscription(asset, sub)` | AVAILABLE → RESERVED |
| `mark_asset_handed_over(asset, sub)` | RESERVED → HANDED_OVER |
| `record_asset_condition_snapshot(asset, stage, ...)` | Append-only condition record |
| `mark_asset_returned(asset)` | HANDED_OVER → RETURNED; clears customer/sub |
| `mark_asset_under_repair(asset)` | → UNDER_REPAIR |
| `retire_asset(asset)` | → RETIRED (permanent) |

## Deferred Items

- **Write API surface** — REST endpoints for reserve / hand-over / return / retire
- **Admin UI dashboard** — asset list, status board, condition history panel
- **Repair / maintenance workflow** — vendor assignment, repair cost tracking
- **Depreciation integration** — linking asset purchase cost to accounting depreciation
- **RENT condition proof** — currently only LEASE requires it at handover;
  adding RENT condition proof is supported by the snapshot model but not yet
  enforced in readiness (deferred requirement)
- **Bulk asset import** — CSV upload to register many units at once

## Financial Integrity Impact

None. No accounting entries, journal vouchers, or ledger mutations are
performed by the asset lifecycle service. Purchase cost on `RentalAsset` is
informational only for now.

## Audit Trail

Every lifecycle transition is recorded in `AuditLog` with action types:
- `RENTAL_ASSET_CREATED`
- `RENTAL_ASSET_RESERVED`
- `RENTAL_ASSET_HANDED_OVER`
- `RENTAL_ASSET_RETURNED`
- `RENTAL_ASSET_UNDER_REPAIR`
- `RENTAL_ASSET_RETIRED`
- `RENTAL_ASSET_CONDITION_SNAPSHOT`
