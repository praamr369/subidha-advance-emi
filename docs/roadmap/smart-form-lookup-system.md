# Smart Form & Lookup UX System (Audit + Implementation Roadmap)

Status: **AUDIT COMPLETE (docs-only)**  
Scope: **Admin + Cashier internal UX only** (no public/customer/partner exposure of admin lookups).

## Goal

Eliminate raw-ID data entry across operational forms by introducing a unified, role-safe Lookup UX layer that:

- uses **real, existing backend endpoints** first
- stays **read-only** for lookup/search
- remains auditable (stores selected IDs; does not mutate finance records)
- preserves all existing write API contracts

This document records what is currently in the codebase and proposes additive improvements.

---

## Current Smart Form Problems Found

### Raw ID inputs (high operational risk)

The following pages require staff to enter raw numeric IDs for critical links (inventory items, BOMs, stock locations, subscriptions, invoices, deliveries). This is error-prone and creates avoidable downstream reconciliation noise.

**Manufacturing**
- `frontend/src/app/(dashboard)/admin/manufacturing/boms/page.tsx` (Finished Good Inventory Item ID, Raw/Accessory Inventory Item ID)
- `frontend/src/app/(dashboard)/admin/manufacturing/jobs/page.tsx` (Finished Good Inventory Item ID, BOM ID, Stock Location ID)
- `frontend/src/app/(dashboard)/admin/manufacturing/jobs/[id]/page.tsx` (Inventory Item ID, Scrap Inventory Item ID)

**Service Desk**
- `frontend/src/app/(dashboard)/admin/service-desk/tickets/page.tsx` (Billing Invoice ID, Direct Sale ID, Subscription ID, Delivery ID, Support Request ID, Product ID, Inventory Item ID)
- `frontend/src/app/(dashboard)/admin/service-desk/returns/page.tsx` (same ID-style references)

### Inconsistent “lookup” UX patterns

The repo contains both:
- structured search endpoints and list endpoints with search capability
- forms that still use plain `<input>` fields for IDs instead of searchable selectors

### Risk profile

- Staff can accidentally link the wrong inventory item / subscription / invoice.
- The system remains financially correct (backend protects posting), but **operational time and exception load increases**.
- Reconciliation surfaces (payment reconciliation + accounting bridge) become noisier because upstream links are wrong/missing.

---

## Existing Lookup Endpoints / Services Found (Confirmed)

### Frontend reusable lookup UI component
- `frontend/src/components/ui/SearchSelect.tsx` provides a debounced async search selector.

### Backend lookup/search endpoints (admin / internal)
- Inventory item lookup (q-based, returns active items + availability by location):  
  `GET /api/v1/admin/inventory/items/search/?q=<term>`  
  Implemented in: `backend/api/v1/views/inventory.py` (`AdminInventoryItemSearchView`)

### Backend list endpoints with DRF `search_fields` (admin / internal)

These viewsets declare `search_fields`, so they can support DRF search via `?search=<term>` (exact filter backend configuration must remain as-is; confirm SearchFilter enabled in the base viewset stack before relying on it universally).

- Inventory items: `backend/api/v1/views/inventory.py` (`InventoryItemViewSet`)
- Stock locations: `backend/api/v1/views/inventory.py` (`StockLocationViewSet`)
- Manufacturing BOMs + jobs: `backend/api/v1/views/manufacturing.py` (`ManufacturingBomViewSet`, `ProductionJobViewSet`)

### Frontend services already built for search/list

These are already used in production UI and should be re-used for lookups where applicable:
- Customers: `frontend/src/services/customers.ts` (includes `/admin/customers/` + `/admin/customers/search/?q=...` + shared `/customers/search/`)
- Products: `frontend/src/services/products/index.ts` (includes `/admin/products/?q=...`)
- Subscriptions: `frontend/src/services/subscriptions/index.ts` (supports `q` query)
- Payments: `frontend/src/services/payments.ts` (supports `q` + filters)
- Deliveries: `frontend/src/services/deliveries.ts` (supports `q` + filters)
- Inventory: `frontend/src/services/inventory.ts` (list endpoints for items/locations + admin item search exists in backend)
- Manufacturing: `frontend/src/services/manufacturing.ts`

---

## Missing Lookup Endpoints Proposed (Read-only, Additive Only)

The goal is **not** to invent new write flows. Only add small, read-only endpoints where staff needs cross-module lookup but no safe endpoint exists.

### P0 proposed read-only endpoints (only if existing list/search endpoints cannot support UX)

1) **Admin lookup: Billing invoice “lite”**
- Purpose: service-desk ticket/return attachment without forcing raw invoice IDs.
- Proposed: `GET /api/v1/admin/lookups/billing-invoices/?q=<term>&limit=20`
- Returns: `id, document_no, invoice_date, status, customer_name_snapshot, customer_phone_snapshot, direct_sale_id, direct_sale_no, grand_total`

2) **Admin lookup: Direct sale “lite”**
- Proposed: `GET /api/v1/admin/lookups/direct-sales/?q=<term>&limit=20`
- Returns: `id, sale_no, sale_date, status, customer_name_snapshot, customer_phone_snapshot, grand_total`

3) **Admin lookup: Subscription “lite”**
- Proposed: `GET /api/v1/admin/lookups/subscriptions/?q=<term>&limit=20`
- Returns: `id, subscription_number/contract_reference, customer_name, phone, product_name, batch_code, status`

4) **Admin lookup: Delivery “lite”**
- Proposed: `GET /api/v1/admin/lookups/deliveries/?q=<term>&limit=20`
- Returns: `id, delivery_no/reference, status, customer_name, subscription_id, direct_sale_id`

5) **Admin lookup: Stock locations (lite)**
- Prefer existing list endpoint with DRF search; if not consistent, add:  
  `GET /api/v1/admin/lookups/stock-locations/?q=<term>&limit=30` returning `id, code, name, branch_id`.

Notes:
- These should be **admin-only** (or admin/cashier where appropriate), matching existing permission patterns.
- Each endpoint should explicitly document supported search fields and return a stable “lite” shape for frontend normalization.

---

## `/admin/manufacturing/boms` Role-scope Issue (Result)

### What we can confirm from code

- The admin manufacturing routes are guarded by:  
  `frontend/src/app/(dashboard)/admin/layout.tsx` → `RoleGuard allowedRoles={["ADMIN"]}`.
- The topbar “{Role} Workspace” label is rendered by `DashboardShell`:
  - `frontend/src/components/layout/DashboardShell.tsx` reads role from `getStoredSession()` (localStorage-backed session).
  - `frontend/src/components/guards/RoleGuard.tsx` uses `useAuth()` role first, then falls back to localStorage session role.

### Most likely cause (visual shell/header bug)

If `AuthProvider` is holding an ADMIN role while `localStorage` still contains a stale CUSTOMER role, the page can:
- **render and allow access** (RoleGuard uses AuthProvider role), but
- **display “Customer Workspace”** in the shell (DashboardShell uses stored session role only)

This would be a **display/session-sync mismatch**, not a permission bypass.

### How to verify (manual, non-destructive)

1) Open `/admin/manufacturing/boms`.
2) Inspect browser storage:
   - localStorage key `SESSION_KEY` (see `frontend/src/lib/auth/session.ts`) for stored `role`
   - cookie `subidha_role` and `subidha_auth`
3) Confirm whether `storedSession.role !== useAuth().role` at runtime.

### Risk

- If this is only a header label mismatch, it is low financial risk but high staff trust/clarity risk.
- If role mismatch also affects navigation groups, “favorites/recents” keys, or route redirects, it can cause operational confusion.

---

## Implementation Plan (Additive, Non-breaking)

### Phase B (Implemented on 2026-05-21)

Production-grade smart form foundation (frontend-only) + applied to the highest-friction manufacturing create forms.

**Reusable components added**
- `frontend/src/components/erp/forms/*` (shell, lookup combobox, field help, impact panel, related preview, validation summary, operator hints)

**Forms improved (raw-ID replaced where safe)**
- `frontend/src/app/(dashboard)/admin/manufacturing/boms/page.tsx`
  - Finished Good Inventory Item ID → inventory item lookup selector
  - Raw/Accessory Inventory Item ID (BOM lines) → inventory item lookup selector
- `frontend/src/app/(dashboard)/admin/manufacturing/jobs/page.tsx`
  - Finished Good Inventory Item ID → inventory item lookup selector
  - BOM ID → BOM lookup selector (existing list endpoint + `?search=...`)
  - Stock Location ID → stock location lookup selector (existing list endpoint + `?search=...`)

**Endpoints reused (no write contract changes)**
- Inventory item search (admin-only): `GET /api/v1/admin/inventory/items/search/?q=...`
- Manufacturing BOM list search: `GET /api/v1/manufacturing/boms/?search=...`
- Inventory stock locations list search: `GET /api/v1/inventory/locations/?search=...`

**Deferred**
- Service desk ticket create lookups are deferred because the form references multiple cross-module IDs (invoice, direct sale, subscription, delivery, support request) that need consistent “lite” lookup wiring to stay safe and operational.

**Role-scope label fix**
- `/admin/*` workspace label now prefers the AuthProvider role (fallback to stored session) so admin pages no longer show a stale “Customer Workspace” label when localStorage is outdated.

### Phase 1 (P0): Replace the worst raw-ID fields

- Manufacturing BOM + Production Job create flows: move from raw ID inputs to `SearchSelect`.
- Service Desk ticket/return attachment references: replace raw IDs with “lite lookups”.
- Strictly preserve current payloads: the selected record becomes the numeric ID already expected by the backend.

### Phase 2 (P1): Centralize lookup wiring

- Add a `frontend/src/services/lookups/` module with “lite” fetchers:
  - `lookupInventoryItems(q)`
  - `lookupStockLocations(q)`
  - `lookupSubscriptions(q)`
  - `lookupInvoices(q)`
  - `lookupDirectSales(q)`
  - `lookupDeliveries(q)`
- Add normalization so UI does not scatter assumptions about response shape.

### Phase 3 (P2): Form conventions

- Introduce consistent “Reference Attachments” sections across admin/cashier forms:
  - show linked entity chips
  - provide “open in new tab” deep links using `frontend/src/lib/route-builders.ts`

---

## Risks

- Performance: naive search endpoints can cause slow queries; ensure indexed search fields and tight limits.
- Role leakage: lookup endpoints must remain admin/internal only.
- Data-shape drift: enforce a stable “lite” schema and normalize in one place.

---

## Next Phase Deliverables (implementation phase, not in this docs pass)

- Replace raw-ID inputs in service desk ticket/return attachments with safe “lite” lookups (after confirming endpoints + permissions).
- Add missing read-only “lite lookup” endpoints only where needed (after verifying list/search endpoints are insufficient).
- Expand smart form patterns to job detail workflows (`jobs/[id]`) and remaining high-risk raw-ID forms.
