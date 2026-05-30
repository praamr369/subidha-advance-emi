# Frontend Route/Navigation Collision Audit

Date: 2026-05-18  
Scope inspected:
- `frontend/src/app`
- `frontend/src/config/navigation.ts`
- `frontend/src/lib/routes.ts`
- `frontend/src/components/layout/*`
- `frontend/src/components/guards/*`
- `frontend/src/services/*`
- `frontend/tests/e2e/*`

## 1. Summary
- App Router contains a very large surface (`426` page routes discovered), with many intentional compatibility aliases.
- Role guards are preserved and explicit: `ADMIN`, `CASHIER`, `CUSTOMER`, `PARTNER`, `VENDOR` in layout-level `RoleGuard` wrappers.
- Verified collisions are mostly naming/alias drift rather than access-control bugs:
  - `lucky-draw` vs `lucky-draws`
  - `commisions` vs `commissions`
  - multiple reconciliation entrypoints
  - payment history/create compatibility pages
  - customer EMI legacy route (`/customer/emis`)
- Navigation has same-target label collisions (different labels leading to same workflow), especially in `CUSTOMER` and `CASHIER` sidebars.
- Several routes are intentionally redirect-only compatibility endpoints (good for non-breaking migration); these should remain documented until formal deprecation windows are complete.
- Placeholder-risk pages are present (not fake financial data, but placeholder UX/controls that can appear production-like).

## 2. Route Inventory Table

| Role/Surface | Route families observed | Approx volume | Guard / access source |
|---|---|---:|---|
| Public | `/`, `/about`, `/products`, `/lucky-plan/*`, `/policies/*`, `/winners`, `/winner-history`, `/contact`, etc. | 30+ | Public route group under `(public)` |
| Auth | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/logout` | 5 | Auth pages under `(auth)` |
| Admin | `/admin/*` across CRM, subscriptions, finance, accounting, inventory, vendors, reports, settings, lucky draw, reconciliation | 250+ | `frontend/src/app/(dashboard)/admin/layout.tsx` (`RoleGuard` ADMIN) |
| Cashier | `/cashier`, `/cashier/collect`, `/cashier/payments`, `/cashier/billing`, `/cashier/notifications` | 6+ | `.../cashier/layout.tsx` (`RoleGuard` CASHIER) |
| Customer | `/customer/*` subscriptions, payments, profile, support, deliveries, statements | 25+ | `.../customer/layout.tsx` (`RoleGuard` CUSTOMER) |
| Partner | `/partner/*` customers, requests, subscriptions, collections, commissions, payouts, reports | 15+ | `.../partner/layout.tsx` (`RoleGuard` PARTNER) |
| Vendor | `/vendor/*` orders, quotes, ledger, outstanding, products, docs, profile | 10+ | `.../vendor/layout.tsx` (`RoleGuard` VENDOR) |
| Staff (present in app) | `/staff/dashboard`, `/staff/attendance`, `/staff/profile` | 3 | No dedicated `staff/layout.tsx` guard found in inspected scope |

## 3. Navigation Collision Table

| Collision type | Evidence | Impact |
|---|---|---|
| Same href, different labels (customer) | `Support` and `Returns / Service` both -> `/customer/support`; `Lucky Draw` -> `/customer/subscriptions` | User ambiguity; workflow discoverability drift |
| Same href, different labels (cashier) | `Payment History` and `Cash Closing` both -> `/cashier/payments` | Same page marketed as two actions |
| Same href, different labels (partner) | `Dashboard` and `Profile` both -> `/partner` | Profile intent unclear |
| Topbar profile/settings collision (customer) | In `DashboardShell`, both Profile and Settings resolve to `/customer/profile` | Duplicate controls with different labels |
| Topbar profile/settings collision (admin) | Admin profile points to `/admin/settings` | “Profile” action is really settings action |

## 4. Duplicate Route Families

| Family | Duplicate/alias paths found | Canonical recommendation |
|---|---|---|
| Lucky draw | `/admin/lucky-draw`, `/admin/lucky-draw/history`, `/admin/lucky-draws`, `/admin/lucky-draws/*` | `/admin/lucky-draws` (+ nested canonical children) |
| Reconciliation | `/admin/reconciliation`, `/admin/finance/reconciliation`, `/admin/payments/reconciliation`, `/admin/accounting/reconciliation`, `/admin/finance/reversal-reconciliation` | Keep domain split; canonical operational entry `/admin/finance/reconciliation`; keep accounting/reversal as scoped modules |
| Payment history/create | `/admin/payments/history`, `/admin/payments/create`, `/admin/payments` | `/admin/payments` for register; `/admin/finance/collect` for collect flow |
| Commissions spelling drift | `/admin/finance/commisions`, `/admin/partners/commisions`, `/admin/partner/commisions` plus `/.../commissions` variants | `/admin/finance/commissions` |
| Customer EMI mismatch | `/customer/emis` and `/customer/subscriptions` | `/customer/subscriptions` |
| Delivery create aliases | `/admin/delivery/create` and `/admin/deliveries?mode=create` | `/admin/deliveries?mode=create` |

## 5. Broken or Hidden Links

### Navigation routes not backed by matching App Router page path
- None found for currently configured non-admin role nav roots.
- Admin navigation uses registry + query-param variants; base paths resolve to existing router pages.

### App routes hidden from navigation (exist, but not primary nav)
- Intentional redirect-only compatibility pages:
  - `/admin/lucky-draw`
  - `/admin/lucky-draw/history`
  - `/admin/finance/commisions`
  - `/admin/partners/commisions`
  - `/admin/partner/commisions`
  - `/admin/payments/history`
  - `/admin/payments/create`
  - `/admin/payments/reconciliation`
  - `/admin/workspace`
  - `/admin/emi/overdue`
  - `/customer/emis`
- Detail/create/edit pages filtered from admin sidebar by `isSecondaryWorkflowRoute` (expected).

## 6. Placeholder/Fake-Risk Pages

No evidence found of fake financial KPI injection in the inspected audit scope; however these routes carry placeholder/preview risk in UX:
- `/admin/reports-center/[reportKey]` includes explicit placeholder text and placeholder inputs.
- `/admin/receipts/sample/*` family appears as sample artifacts; should be clearly marked non-operational.
- `/admin/settings/local-sandbox` is operationally sensitive and includes demo/seed/reset semantics; must remain role-restricted and environment-gated.

## 7. Same-Page / Same-Link Collisions

| Surface | Labels/actions | Actual target |
|---|---|---|
| Customer sidebar | `Support`, `Returns / Service` | `/customer/support` |
| Cashier sidebar | `Payment History`, `Cash Closing` | `/cashier/payments` |
| Partner sidebar | `Dashboard`, `Profile` | `/partner` |
| Topbar quick actions (customer) | `Profile`, `Settings` | `/customer/profile` |
| Topbar quick actions (admin) | `Profile` | `/admin/settings` |

## 8. Recommended Canonical Route for Each Duplicate

- Lucky draw canonical: `/admin/lucky-draws`
- Commission canonical: `/admin/finance/commissions`
- Payment collection canonical: `/admin/finance/collect`
- Payment register canonical: `/admin/payments`
- Reconciliation canonical (operations): `/admin/finance/reconciliation`
- Customer EMI canonical: `/customer/subscriptions`
- Admin workspace canonical: `/admin/erp`

## 9. Keep / Redirect / Deprecate / Remove Classification

| Route/family | Classification | Reason |
|---|---|---|
| `/admin/lucky-draw`, `/admin/lucky-draw/history` | Redirect (keep now) | Verified compatibility aliasing to canonical lucky draw workspace |
| `*/commisions` variants | Redirect (keep now), Deprecate later | Typo compatibility is active and covered in e2e |
| `/admin/payments/reconciliation` | Redirect (keep now) | Preserves deep-link compatibility to finance reconciliation with `view=payments` |
| `/admin/payments/history` | Redirect (keep now) | Legacy path to payment register |
| `/admin/payments/create` | Redirect (keep now) | Legacy create path to collect workflow |
| `/admin/workspace` | Redirect (keep now) | Alias to `/admin/erp` |
| `/admin/emi/overdue` | Redirect (keep now) | Alias to `/admin/emis/overdue` |
| `/customer/emis` | Redirect (keep now), Deprecate later | Legacy customer route validated in e2e |
| `/admin/receipts/sample/*` | Keep (explicitly non-primary) | Useful for sample/reference; do not present as operational default |
| Any alias above | Remove | Not recommended now; remove only after telemetry + deprecation notice window |

## 10. Test Commands Run

- `rg --files ...`
- `ls -la ...`
- `sed -n ...`
- `find frontend/src/app -type f -name 'page.tsx' | sort`
- `find ... | sed ... > /tmp/app_routes.txt`
- `wc -l /tmp/app_routes.txt`
- `rg -n "..." frontend/src/... frontend/tests/e2e ...`

No backend tests or UI tests were executed in this phase (audit-only, no UI changes).

## 11. Files Changed

- `docs/operations/frontend-route-collision-audit.md` (created)

