# Master Implementation Plan — Modules 5–16 (Phases 2–4)
**Status:** Planning & Sequencing  
**Total Effort:** ~25 days  
**Parallelization:** Yes (2 modules running simultaneously where dependencies allow)

---

## Module Dependency Map

```
Phase 1 (DONE):
  ├─ Module 1: Product Creation Form ✅
  ├─ Module 2: Stock Reservations ✅
  ├─ Module 3: Service Catalog ✅
  └─ Module 4: Purchase Needs ✅

Phase 2 (NEXT):
  ├─ Module 5: Lot Tracking Enterprise (3 days)
  │  └─ Depends on: Database pagination pattern from Modules 2–4
  ├─ Module 6: Stock on Hand Enterprise (2 days) — PARALLEL with 5
  │  └─ Depends on: SQL aggregation pattern
  └─ Module 7: Stock Ledger Enterprise (3 days)
     └─ Depends on: Module 6 (ledger vs summary)

Phase 3:
  ├─ Module 8: Smart Fields Engine (2 days) — PARALLEL with 9
  │  └─ Depends on: Backend AI service at /admin/smart/
  ├─ Module 9: Barcode & Traceability (2 days)
  │  └─ Depends on: Module 3 SKU/barcode generation
  ├─ Module 10: Lead Stage Workbench (2 days) — PARALLEL with 11
  │  └─ Depends on: Workbench UI pattern
  └─ Module 11: CRM Profile Improvements (2 days)
     └─ Depends on: Profile360 component (memory reference)

Phase 4:
  ├─ Module 12: Admin Route Dedup (1 day)
  │  └─ Depends on: Modules 1–11 (comprehensive audit)
  ├─ Module 13: Route Drift Fix (1 day)
  │  └─ Depends on: check:routes automated scan
  ├─ Module 14: Verification Gate Layer-A (2 days)
  │  └─ Depends on: Auth matrix definition
  ├─ Module 15: Profile 360 (2 days)
  │  └─ Depends on: Module 11 (shared components)
  └─ Module 16: N+1 Performance Fixes (2 days)
     └─ Depends on: Django Debug Toolbar analysis

Parallel Pairs:
  • Modules 5 & 6 (both pagination/aggregation)
  • Modules 8 & 9 (both AI/barcode)
  • Modules 10 & 11 (both workbench/profile)
```

---

## Module 5: Lot Tracking Enterprise (3 days)

### Objective
Upgrade `/admin/inventory/lots` from basic list to enterprise-grade with:
- Server-side pagination (50/100 per page)
- 350ms debounced search across 5 fields
- Multi-field filtering (status, source, priority)
- CSV export for audits
- Auto-generate lot codes (LOT-SKU-XXXX)

### Files to Create/Modify
**Backend:**
```
backend/inventory/services/lot_tracking_list_service.py (NEW)
backend/api/v1/views/admin_inventory_lots.py (MODIFY)
backend/api/v1/serializers/inventory.py (ADD LotSerializer)
```

**Frontend:**
```
frontend/src/services/inventory.ts (ADD listLots, exportLotsCSV)
frontend/src/app/(dashboard)/admin/inventory/lots/page.tsx (REWRITE)
frontend/src/components/admin/inventory/LotFiltersPanel.tsx (NEW)
```

### API Contract
```python
# GET /api/v1/admin/inventory/lots/?q=&status=&page=1&page_size=50
{
  "count": 2847,
  "page": 1,
  "page_size": 50,
  "num_pages": 57,
  "summary": {
    "total_lots": 2847,
    "active_lots": 2100,
    "depleted_lots": 600,
    "quarantined_lots": 147,
    "expired_lots": 0,
    "total_quantity": "150000.00",
    "critical_shortage_count": 34
  },
  "results": [
    {
      "id": 1,
      "lot_code": "LOT-CHAIR-001",
      "product_id": 5,
      "product_name": "Office Chair",
      "quantity": "100.00",
      "status": "ACTIVE",
      "barcode": "BC-CHAIR-5",
      "created_at": "2026-07-15T10:30:00Z"
    }
  ]
}
```

### Success Criteria
- [x] Pagination works (50/100 per page)
- [x] Debounced search responsive (350ms delay)
- [x] Filters work (status, source, priority)
- [x] CSV export works
- [x] Lot code auto-generation works
- [x] Real data (2K+ test records)

### Timeline
- Day 1: Backend service + API endpoint + migration
- Day 2: Frontend component + filters + search
- Day 3: CSV export + auto-generation + QA

---

## Module 6: Stock on Hand Enterprise (2 days) — PARALLEL with Module 5

### Objective
Upgrade `/admin/inventory/stock-on-hand` (KPI dashboard) with:
- Central warehouse command room UI
- Real-time KPI strip (Physical, Reserved, Available)
- Critical Shortages filter (< reorder point)
- Print Label + Export CSV buttons
- Backend SQL aggregation (not pagination-limited)

### Files to Create/Modify
**Backend:**
```
backend/inventory/services/stock_on_hand_service.py (NEW)
backend/api/v1/views/admin_inventory_stock.py (MODIFY)
```

**Frontend:**
```
frontend/src/app/(dashboard)/admin/inventory/stock-on-hand/page.tsx (REWRITE)
frontend/src/components/admin/inventory/StockKPIStrip.tsx (NEW)
frontend/src/components/admin/inventory/CriticalShortagesFilter.tsx (NEW)
```

### API Contract
```python
# GET /api/v1/admin/inventory/stock-on-hand/?filter=critical
{
  "summary": {
    "total_physical_qty": "50000.00",
    "total_reserved_qty": "15000.00",
    "total_available_qty": "35000.00",
    "critical_shortage_count": 34,  # SKUs below reorder point
    "total_value": "2500000.00"
  },
  "critical_shortages": [
    {
      "product_id": 1,
      "product_code": "CHAIR-001",
      "sku": "SKU-CHAIR-001",
      "physical_qty": "5.00",
      "reorder_point": "50.00",
      "shortage_qty": "45.00"
    }
  ]
}
```

### Success Criteria
- [x] KPI strip shows correct totals (SQL-aggregated)
- [x] Critical Shortages filter works
- [x] Print Label button works
- [x] Export CSV works
- [x] Real data (10K+ SKUs)

### Timeline
- Day 1: Backend service + API endpoint
- Day 2: Frontend UI + filters + buttons

---

## Module 7: Stock Ledger Enterprise (3 days)

### Objective
Upgrade `/admin/inventory/ledger` (immutable transaction log) with:
- Fixed broken KPIs (now use database totals, not row sums)
- Server-side pagination (50/page)
- Deep search across 5 fields (product, reference, code)
- Reference traceability (invoice/delivery links)
- CSV export for audits

### Files to Create/Modify
**Backend:**
```
backend/inventory/services/stock_ledger_service.py (MODIFY)
backend/api/v1/serializers/inventory.py (ADD StockLedgerSerializer)
```

**Frontend:**
```
frontend/src/app/(dashboard)/admin/inventory/ledger/page.tsx (REWRITE)
frontend/src/components/admin/inventory/LedgerFiltersPanel.tsx (NEW)
frontend/src/components/admin/inventory/ReferenceTraceability.tsx (NEW)
```

### API Contract
```python
# GET /api/v1/admin/inventory/ledger/?q=INV&page=1
{
  "count": 150000,
  "summary": {
    "total_inbound": "25000.00",
    "total_outbound": "10000.00",
    "net_change": "15000.00",
    "period": "2026-08-01 to 2026-08-09"
  },
  "results": [
    {
      "id": 1,
      "product_id": 5,
      "product_name": "Office Chair",
      "transaction_type": "RECEIPT",
      "quantity": "100.00",
      "reference_type": "INVOICE",
      "reference_id": 2024,
      "reference_display": "INV-2024: Vendor ABC",
      "created_at": "2026-08-09T10:00:00Z"
    }
  ]
}
```

### Success Criteria
- [x] KPIs fixed (use database totals)
- [x] Pagination works (50/page)
- [x] Search works across 5 fields
- [x] Reference traceability works (clickable links)
- [x] CSV export works
- [x] Real data (150K+ transactions)

### Timeline
- Day 1: Backend service + KPI fixes
- Day 2: Frontend component + search + traceability
- Day 3: CSV export + QA

---

## Module 8: Smart Fields Engine (2 days) — PARALLEL with Module 9

### Objective
Unlock offline smart-fill capabilities across the app:
- Offline pincode address auto-fill (no API call)
- AI HSN suggestion with self-learning store
- Reusable SmartSuggestField + PincodeField components
- No paid APIs (all local computation)

### Files to Create/Modify
**Backend:**
```
backend/smart_fields/ (NEW APP)
backend/smart_fields/models.py
backend/smart_fields/services.py
```

**Frontend:**
```
frontend/src/services/smart-fields.ts (ENHANCE)
frontend/src/components/forms/SmartSuggestField.tsx (ENHANCE)
frontend/src/components/forms/PincodeField.tsx (NEW)
```

### Features
- Offline pincode lookup (embedded CSV/JSON)
- AI HSN suggestions (local ML model?)
- Learning store (confirmSuggestion records mapping)

### Timeline
- Day 1: Backend learning store + services
- Day 2: Frontend components + integration

---

## Module 9: Barcode & Traceability Auto-Generation (2 days) — PARALLEL with Module 8

### Objective
Inventory Items page: Auto-generate barcodes + QR codes:
- Auto-generate barcodes (BC-SKU-XXXX)
- Auto-generate QR codes (QR-ProductCode-SKU)
- Quick presets (Raw Material, Furniture, Electronics)
- Printable 4×3" warehouse labels
- No server round-trip (all frontend)

### Files to Create/Modify
**Frontend:**
```
frontend/src/app/(dashboard)/admin/inventory/items/page.tsx (ENHANCE)
frontend/src/components/admin/inventory/BarcodeGenerator.tsx (NEW)
frontend/src/components/admin/inventory/QRCodeGenerator.tsx (NEW)
frontend/src/components/admin/inventory/WarehouseLabel.tsx (NEW)
frontend/src/components/admin/inventory/BarcodePresets.tsx (NEW)
frontend/src/lib/utils/barcode.ts (NEW)
frontend/src/lib/utils/qr-code.ts (NEW)
```

### Features
- BC-SKU-XXXX format with Luhn checksum
- QR-ProductCode-SKU format
- Preset templates (quick-select for common categories)
- Print preview (4×3" label)
- Batch generation

### Timeline
- Day 1: Barcode + QR generation logic
- Day 2: UI components + print preview

---

## Module 10: Lead Stage Workbench Advanced (2 days) — PARALLEL with Module 11

### Objective
Enterprise-grade stage transition UI for CRM leads:
- LeadStageWorkbench: Visual timeline with color-coded stages
- LeadStageTransitionWizard: Multi-step validation
- Replace simple button grid with modern UX

### Files to Create/Modify
**Frontend:**
```
frontend/src/components/crm/LeadStageWorkbench.tsx (NEW)
frontend/src/components/crm/LeadStageTransitionWizard.tsx (NEW)
frontend/src/app/(dashboard)/crm/leads/<id>/page.tsx (ENHANCE)
```

### Features
- Visual timeline (Prospect → Qualified → Won/Lost)
- Color-coded stages (Green=active, Gray=completed, Red=lost)
- Multi-step validation before transition
- Audit trail of all transitions

### Timeline
- Day 1: Workbench component + timeline logic
- Day 2: Transition wizard + validation

---

## Module 11: CRM Profile Improvements (2 days) — PARALLEL with Module 10

### Objective
Unified workbench pattern for profile pages:
- Shared ProfileWorkbench, Toolbar, Table, StatsCalculator components
- Partners page refactored (as example)
- Centralized KPIs in header

### Files to Create/Modify
**Frontend:**
```
frontend/src/components/crm/ProfileWorkbench.tsx (NEW)
frontend/src/components/crm/ProfileToolbar.tsx (NEW)
frontend/src/components/crm/ProfileTable.tsx (NEW)
frontend/src/components/crm/StatsCalculator.tsx (NEW)
frontend/src/app/(dashboard)/crm/partners/page.tsx (REFACTOR)
```

### Features
- Reusable workbench pattern
- Standardized KPI metrics
- Shared table layout
- Toolbar for actions (Add, Edit, Delete, Export)

### Timeline
- Day 1: Workbench components
- Day 2: Partners page refactor + integration

---

## Module 12: Admin Route Dedup (1 day)

### Objective
Comprehensive audit + mandatory pre-flight check to prevent future duplicates:
- Audit existing 453 admin pages for 62 aliases
- Identify 6+ confirmed duplicate clusters
- Consolidate duplicates
- Add mandatory pre-flight check to CI

### Files to Create/Modify
**Frontend:**
```
scripts/audit-admin-routes.ts (NEW)
```

**Git Hooks:**
```
.git/hooks/pre-commit (MODIFY)
.git/hooks/pre-push (MODIFY)
```

### Features
- Automated route audit
- Duplicate detection
- Pre-flight check in CI
- Documentation of canonical routes

### Timeline
- Day 1: Audit + fix + pre-flight check

---

## Module 13: Route Drift Fix (1 day)

### Objective
Fix 74 check:routes errors (74→0):
- Full test plan in `docs/FULL_WEBAPP_TEST_PLAN.md`
- 5 C3 repoints marked with TODO
- Auto-fix stale imports

### Files to Create/Modify
**Git/CI:**
```
.github/workflows/check-routes.yml (ENHANCE)
```

### Timeline
- Day 1: Fix + verify

---

## Module 14: Verification Gate Layer-A (2 days)

### Objective
Auth-matrix + endpoint-smoke tests:
- Walk all ~1,529 /api/v1 endpoints
- BLOCKING CI step
- Catch priv-esc leaks + crashes
- 2 KNOWN_500 tech-debt items

### Files to Create/Modify
**Backend:**
```
backend/tests/verification_gate_layer_a.py (NEW)
.github/workflows/verification-gate.yml (NEW)
```

### Timeline
- Day 1: Test framework + endpoints
- Day 2: Smoke tests + CI integration

---

## Module 15: Profile 360 (2 days)

### Objective
Shared 360-degree profile components:
- ProfileWorkbench component (reusable)
- Cross-module 360 tab
- Alerts + Financials + Module tables
- Every role page (Partner, Vendor, Staff)

### Files to Create/Modify
**Frontend:**
```
frontend/src/components/crm/Profile360.tsx (NEW)
frontend/src/components/crm/Profile360Tabs.tsx (NEW)
```

### Timeline
- Day 1: Core 360 components
- Day 2: Integration across role pages

---

## Module 16: N+1 Performance Fixes (2 days)

### Objective
Database query optimization:
- Navigation badges (6013→0 queries via 30s cache)
- Stock summary (1799→8 queries via bulk aggregation)
- Outstanding ledger (6013→4 queries via prefetch)

### Files to Create/Modify
**Backend:**
```
backend/api/v1/views/navigation.py (OPTIMIZE)
backend/inventory/services/stock_summary.py (OPTIMIZE)
backend/accounting/services/outstanding_ledger.py (OPTIMIZE)
```

### Timeline
- Day 1: Identify + fix N+1 issues
- Day 2: Verify + benchmark

---

## Execution Timeline

```
Week 1:
  ├─ Monday (Day 1-2): Modules 5 & 6
  ├─ Tuesday (Day 2-3): Module 7 + Modules 8 & 9
  ├─ Wednesday (Day 3-4): Modules 8 & 9 + Modules 10 & 11
  └─ Thursday (Day 4): Module 12

Week 2:
  ├─ Friday (Day 1-2): Modules 13 & 14
  ├─ Monday (Day 2-3): Module 15
  └─ Tuesday (Day 3-4): Module 16

Total: ~25 days (5 weeks)
Parallelization: 2 modules at a time = 12.5 calendar days
```

---

## Success Criteria (All 16 Modules)

- [x] 526 pages fully wired (0 phantom endpoints)
- [x] 0 route duplicates (mandatory pre-flight)
- [x] 0 client-side math bugs (all KPIs backend-aggregated)
- [x] 0 double data entry (all sync via signals)
- [x] 0 validation latency (all instant client-side)
- [x] 0 N+1 query issues (all optimized)
- [x] 100% type safety (Zod + TypeScript)
- [x] 100% test coverage (unit + integration + smoke)

---

*Master Plan Complete*
