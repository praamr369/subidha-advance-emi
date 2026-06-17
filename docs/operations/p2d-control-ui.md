# P2D — Admin UI: Enterprise Control Foundation

Frontend-only. Additive to P0, P1, P2A, P2B, and P2C. No backend changes.

---

## 1. Summary

8 new admin pages wiring the P2A, P2B, and P2C backend into the admin UI. All pages are read-only or tightly gated operational controls. No financial records are mutated from any of these pages.

---

## 2. Pages added

| Route | Page | Backend |
|-------|------|---------|
| `/admin/control` | Control Desk hub | — (nav hub) |
| `/admin/control/approvals` | Approval Queue | `GET /api/v1/admin/control/approvals/` |
| `/admin/control/policies` | Business Policies | `GET /api/v1/admin/control/policies/` |
| `/admin/control/exceptions` | Exception Desk | `GET /api/v1/admin/control/exceptions/` |
| `/admin/control/cash-sessions` | Cash Counter Sessions | `GET /api/v1/admin/control/cash-sessions/` |
| `/admin/control/daily-close` | Daily Close | `GET /api/v1/admin/control/daily-close/readiness/` + `history/` |
| `/admin/control/month-end-close` | Month-End Close | `GET .../readiness/`, `POST .../execute/`, `GET .../history/` |
| `/admin/data-quality` | Data Quality Center | `GET /api/v1/admin/data-quality/` |

---

## 3. Route constants

All 8 constants added to `ROUTES.admin` in `frontend/src/lib/routes.ts`:

```ts
controlRoot: "/admin/control",
controlApprovals: "/admin/control/approvals",
controlPolicies: "/admin/control/policies",
controlExceptions: "/admin/control/exceptions",
controlCashSessions: "/admin/control/cash-sessions",
controlDailyClose: "/admin/control/daily-close",
controlMonthEndClose: "/admin/control/month-end-close",
dataQuality: "/admin/data-quality",
```

---

## 4. Service module

`frontend/src/services/control-enterprise.ts`:

- TypeScript types for all 8 backend shapes
- Fetch functions for all 10 API calls
- Normalises paginated and plain-array responses

---

## 5. Admin route registry

"Enterprise Control" group added to `frontend/src/config/admin-route-registry.ts` (group 16):

- Control Desk (hub)
- Approval Queue
- Business Policies
- Exception Desk
- Cash Counter Sessions
- Daily Close
- Month-End Close
- Data Quality Center

---

## 6. Navigation sidebar

`"Enterprise Control": "governance"` added to `ADMIN_MODULE_ICONS` in `frontend/src/config/navigation.ts`. The group appears in the admin sidebar automatically via `buildAdminNavigationGroups()`.

---

## 7. Execute button safety

Month-End Close page (`/admin/control/month-end-close`):
- Fetches readiness before rendering execute controls
- **Execute Close button is `disabled` when `readiness.can_execute === false`** (BLOCKING checks failed)
- `title` attribute explains why the button is disabled
- Dry Run button is always enabled (non-destructive, always persists)
- Execute result shown inline; history refreshed automatically after execute

---

## 8. Financial integrity impact

None. All 8 pages are read-only or call existing P2A/P2B/P2C endpoints that make no financial record mutations. Month-end execute calls `run_month_end_close()` which writes `MonthEndCloseRun` records only (not Payment, EMI, JournalEntry, or any financial record).

---

## 9. Validation

| Check | Result |
|-------|--------|
| `npm run check:routes` | 8 pre-existing failures unchanged; 0 new failures |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (0 errors, 0 warnings) |

---

## 10. Files changed

| File | Change |
|------|--------|
| `frontend/src/lib/routes.ts` | +8 route constants under `admin` |
| `frontend/src/services/control-enterprise.ts` | NEW — TypeScript types + fetch functions |
| `frontend/src/app/(dashboard)/admin/control/page.tsx` | NEW — hub page |
| `frontend/src/app/(dashboard)/admin/control/approvals/page.tsx` | NEW |
| `frontend/src/app/(dashboard)/admin/control/policies/page.tsx` | NEW |
| `frontend/src/app/(dashboard)/admin/control/exceptions/page.tsx` | NEW |
| `frontend/src/app/(dashboard)/admin/control/cash-sessions/page.tsx` | NEW |
| `frontend/src/app/(dashboard)/admin/control/daily-close/page.tsx` | NEW |
| `frontend/src/app/(dashboard)/admin/control/month-end-close/page.tsx` | NEW |
| `frontend/src/app/(dashboard)/admin/data-quality/page.tsx` | NEW |
| `frontend/src/config/admin-route-registry.ts` | +8 items in "Enterprise Control" group |
| `frontend/src/config/navigation.ts` | +"Enterprise Control": "governance" in ADMIN_MODULE_ICONS |
| `docs/operations/p2d-control-ui.md` | NEW (this file) |

---

## 11. Deferred

- Per-row approve/reject actions on Approval Queue (need CSRF-safe POST)
- Per-row acknowledge/resolve/suppress on Exception Desk
- Policy toggle switch (PUT `control/policies/set/`)
- Cash session open/close workflow
- Branch scoping on daily and month-end close pages
- Playwright smoke tests
