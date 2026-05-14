# Warehouse and Showroom Readiness

## Canonical readiness
- Dry-run stock workflow readiness accepts either:
  - active `Warehouse` profile, or
  - active `StockLocation` with `location_type=WAREHOUSE`.

## Why
- StockLocation is the UI-backed location model for operational movement.
- Warehouse model remains valid for legacy stock-need links.

## Action path
- When missing, operators should create active inventory locations from `/admin/inventory/locations`.
- Showroom locations support location-wise stock visibility but do not replace warehouse readiness.
