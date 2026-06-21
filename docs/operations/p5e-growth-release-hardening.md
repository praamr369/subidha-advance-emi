# P5E — Growth UI Consolidation and Release Hardening

## Summary

P5E consolidates the P5A–P5D growth feature set into a cohesive admin experience. The growth hub page now fetches live counts from all growth endpoints in parallel. All six growth pages (hub, plan templates, offer packages, requests, partner performance, retention intelligence) are fully implemented with ERP shell, empty states, error states, and loading states. Full backend test suite (P5A–P5D) passes clean.

---

## Changes in P5E

### Frontend: Growth Hub Page Enhanced
- `frontend/src/app/(dashboard)/admin/growth/page.tsx` — updated from static links to live count display
- Fetches 5 endpoints in parallel via `Promise.allSettled` (fails open — degraded counts show as 0, never error)
- Shows per-section stat badge: "N templates", "N active", "N submitted", "N partners", "N customers with signals"

### Frontend: Partner Performance Page Fully Implemented
- `frontend/src/app/(dashboard)/admin/growth/partner-performance/page.tsx` — upgraded from stub; shows per-partner card with risk flag badges and 6 key metrics

### Frontend: Retention Intelligence Page Fully Implemented
- `frontend/src/app/(dashboard)/admin/growth/retention/page.tsx` — upgraded from stub; shows customer retention profiles sorted by severity with per-signal type badges

---

## Complete P5A–P5E File Inventory

### Backend Models (New)
| File | Tables |
|------|--------|
| `backend/subscriptions/models_growth_offers.py` | `growth_plan_templates`, `growth_offer_packages`, `growth_offer_package_lines` |
| `backend/subscriptions/models_growth_requests.py` | `growth_customer_requests`, `growth_request_lines`, `growth_request_decisions` |

### Backend Migrations (New)
| File | Description |
|------|-------------|
| `0097_growth_offers_p5a.py` | Creates P5A tables; depends on 0096 |
| `0098_growth_requests_p5b.py` | Creates P5B tables; depends on 0097 |

### Backend Services (New)
| File | Purpose |
|------|---------|
| `growth_offer_service.py` | PlanTemplate/OfferPackage preview, eligibility, config validation |
| `growth_request_service.py` | CustomerGrowthRequest create/submit/approve/reject/preview |
| `partner_performance_service.py` | Read-only partner activity snapshots |
| `customer_retention_intelligence_service.py` | Customer-level retention signals (7 signal types) |

### Backend API Views (New)
| File | Endpoints |
|------|-----------|
| `admin_growth_offers.py` | Plan templates CRUD + offer packages CRUD + preview |
| `admin_growth_requests.py` | Growth requests lifecycle (list/create/get/patch/submit/approve/reject/preview) |
| `admin_partner_performance.py` | Partner list + partner detail |
| `admin_retention_intelligence.py` | Retention list + customer retention detail |

### Backend URL Routes (New, all under `admin/`)
- `api/v1/routes/admin_growth_offers.py`
- `api/v1/routes/admin_growth_requests.py`
- `api/v1/routes/admin_partner_performance.py`
- `api/v1/routes/admin_retention_intelligence.py`

### Frontend Pages (New/Updated)
| Page | Status |
|------|--------|
| `(dashboard)/admin/growth/page.tsx` | New, enhanced in P5E with live counts |
| `(dashboard)/admin/growth/plan-templates/page.tsx` | New in P5A |
| `(dashboard)/admin/growth/offer-packages/page.tsx` | New in P5A |
| `(dashboard)/admin/growth/requests/page.tsx` | New in P5B |
| `(dashboard)/admin/growth/partner-performance/page.tsx` | Implemented in P5E (was stub) |
| `(dashboard)/admin/growth/retention/page.tsx` | Implemented in P5E (was stub) |

### Tests (New)
| File | Count | Phase |
|------|-------|-------|
| `test_growth_offers.py` | 43 | P5A |
| `test_growth_requests.py` | 28 | P5B |
| `test_partner_performance.py` | 21 | P5C |
| `test_retention_intelligence.py` | 23 | P5D |

Total: **115 new tests**, all passing.

---

## Financial Integrity Guarantee

No row in any of these tables is created or mutated by any P5 service:
- `subscriptions` / `emis` / `payments`
- `accounting_journal_entries` / `accounting_bridge_postings`
- `stock_ledger`
- `lucky_draw` / `lucky_ids`
- `commissions` / `commission_payout_batches`
- `payouts`

All `list_*` and `build_*` functions are read-only advisories. All service mutations are confined to:
- `growth_plan_templates`, `growth_offer_packages`, `growth_offer_package_lines`
- `growth_customer_requests`, `growth_request_lines`, `growth_request_decisions`

---

## All API Endpoints

```
GET    /api/v1/admin/growth/plan-templates/
POST   /api/v1/admin/growth/plan-templates/
GET    /api/v1/admin/growth/plan-templates/{id}/
PATCH  /api/v1/admin/growth/plan-templates/{id}/
GET    /api/v1/admin/growth/offer-packages/
POST   /api/v1/admin/growth/offer-packages/
GET    /api/v1/admin/growth/offer-packages/{id}/
PATCH  /api/v1/admin/growth/offer-packages/{id}/
GET    /api/v1/admin/growth/offer-packages/{id}/preview/
GET    /api/v1/admin/growth/requests/
POST   /api/v1/admin/growth/requests/
GET    /api/v1/admin/growth/requests/{id}/
PATCH  /api/v1/admin/growth/requests/{id}/
POST   /api/v1/admin/growth/requests/{id}/submit/
POST   /api/v1/admin/growth/requests/{id}/approve/
POST   /api/v1/admin/growth/requests/{id}/reject/
GET    /api/v1/admin/growth/requests/{id}/preview/
GET    /api/v1/admin/growth/partner-performance/
GET    /api/v1/admin/growth/partner-performance/{id}/
GET    /api/v1/admin/growth/retention/
GET    /api/v1/admin/customers/{id}/retention/
```

All require `IsAdmin`. Cashier, customer, and partner roles receive HTTP 403.

---

## Existing Data Impact

- Zero impact on all existing rows.
- Migrations 0097 and 0098 are additive (new tables only).
- No existing migration or table is altered.
