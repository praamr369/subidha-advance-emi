# Inventory Operations

This document defines the current additive inventory foundation workflow for SUBIDHA CORE.

It is based on the live code paths in:

- `inventory.models`
- `inventory.services.stock_service`
- `inventory.services.opening_stock_import_service`
- `inventory.services.delivery_bridge_service`
- `subscriptions.services.delivery_service`

## Boundaries

- Product remains the single shared catalog truth.
- Inventory owns stock-facing masters and movements only.
- EMI schedules, payments, waivers, commissions, payouts, reconciliation, delivery truth, and audit truth remain outside inventory ownership.
- Stock mutations must happen through explicit posting services or approved admin workflows.

## Current admin routes

- `/admin/inventory`
- `/admin/inventory/locations`
- `/admin/inventory/items`
- `/admin/inventory/stock-on-hand`
- `/admin/inventory/movements`
- `/admin/inventory/ledger`
- `/admin/inventory/adjustments`
- `/admin/inventory/opening-stock`
- `/admin/inventory/valuation`

## Daily operating sequence

1. Prepare the inventory profile from the product detail when a product should participate in stock control.
2. Create or maintain stock locations before opening stock or adjustment posting.
3. Use inventory item governance to set:
   - default stock location
   - stock item type
   - reorder level
   - standard unit cost
   - delivery stock bridge participation
4. Post opening stock through the opening-stock import workflow.
5. Use stock adjustments for counted shortages, surpluses, or corrections.
6. Review stock on hand, movements, and ledger pages during daily checks and reconciliation.

## Delivery bridge behavior

- Delivery state remains authoritative in the subscription delivery module.
- When a delivery reaches `DELIVERED`, inventory can post one `EMI_DELIVERY_OUT` movement for bridge-enabled stock items.
- When a delivery reaches `RETURNED`, inventory can post one `EMI_RETURN_IN` movement for bridge-enabled stock items.
- The bridge is idempotent by reference and may be disabled per inventory profile when stock should not move automatically from delivery events.

## Governance rules

- Do not create stock by editing product master rows.
- Do not reduce stock by editing subscription, delivery, or billing records directly.
- Use opening stock import for initial baseline loading.
- Use stock adjustments for counted corrections.
- Keep raw-material readiness at the inventory-profile layer through stock item type classification; do not build manufacturing or BOM logic in this pass.

## Auditability

The current pass emits audit records for:

- stock location create/update
- inventory item governance updates
- stock adjustment create/update/approve/post
- opening stock import posting
- delivery inventory bridge sync

This keeps stock operations visible without weakening existing Lucky Plan financial audit trails.
