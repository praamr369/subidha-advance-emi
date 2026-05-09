# Inventory readiness & stock needs

## Readiness endpoint

`GET /api/v1/admin/inventory/readiness/` returns a **read-only** snapshot:

- Product vs tracked SKU coverage.
- ATP-derived `products_without_stock` list (bounded).
- Low-stock heuristic vs reorder levels.
- Opening-stock evidence (`posted` batches or ledger movements).
- Open purchase/stock needs counts.

The endpoint never blocks product creation and never mutates inventory rows.

## Stock needs (`PurchaseNeed`)

Operational shortages reuse the existing `PurchaseNeed` model:

- Stable human-readable `need_no`.
- `product_name_snapshot` for audit-friendly listings.
- Workflow statuses include `IN_REVIEW`, `PARTIALLY_FULFILLED`, `FULFILLED` alongside legacy states.
- Source modules include `DIRECT_SALE`, `SUBSCRIPTION`, `MANUAL`, `DELIVERY`, plus legacy enums.

REST surface:

- `GET /api/v1/admin/inventory/stock-needs/`
- `POST /api/v1/admin/inventory/stock-needs/`
- `PATCH /api/v1/admin/inventory/stock-needs/<id>/`

Creation paths never adjust stock quantities—they record intent for procurement teams.

Direct-sale shortages continue to flow through `upsert_direct_sale_purchase_need`, guaranteeing idempotent open rows per `(sale, product)` tuple.
