# Changelog

All notable changes to this project will be documented here.

## [Unreleased] - 2026-08-18

### Added
- Inventory enterprise workbench: FG profile (Overview/Accessories/Services/BOM tabs), barcode + QR generation, in-place accessory/service create+link, BOM Register with expandable line cards and status lifecycle.
- Full CRUD on accessories catalog, raw materials catalog, service catalog with safety delete guards (blocked when linked to FG / used in BOM).
- Owner Funds admin API regression test suite (`tests.accounting.test_owner_funds_api`).

### Fixed
- **Financial integrity — inventory valuation:** `_calculate_on_hand_qty_bulk` in `inventory/services/valuation_service.py` was summing only StockLedger, ignoring both `opening_stock_qty` and the soft-hold movement exclusion. Rewrote to match the canonical stock formula (`opening + Σin − Σout`, excluding `SOFT_HOLD_MOVEMENT_TYPES`). Valuation totals for opening-balance-only items were being reported as 0; recompute stored InventoryValuation snapshots after deploy if audit history matters.
- **500 on owner-funds preview:** `GET /api/v1/admin/finance/owner-funds/schedule-preview/` raised `TypeError` because the shared view required `pk` on GET. Now returns 405 on the preview route's GET.
- Manufacturing / demand-planning / vendor-sandbox test fixtures aligned with current business guards (accounting posting prereqs, CTRL-LP-5 batch-lock enrollment guard, INVENTORY_ASSET chart bootstrap).

### Verification
- Frontend gates all green: typecheck, check:routes (599 pages / 0 warnings), lint (0 errors), build:smoke.
- Backend Layer-A endpoint verification: 53/53 tests (walks all ~1,529 endpoints as multiple roles).
- Scoped inventory/manufacturing/accounting-bridge suite: 62/62.

## [0.1.0] - 2026-04-01

### Added
- Initial repository setup
- Backend and frontend project structure
- Base documentation
- Initial GitHub remote and main branch setup

### Focus
- Admin workflow refinement
- Payment correctness
- EMI operational stability
- Deployment readiness
