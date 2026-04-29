# BI Control Center Readiness

Date: 2026-04-29

Scope: `/admin/bi` and `GET /api/v1/admin/bi/summary/`.

BI is a read-only dashboard/reporting surface. It must not post payments, reverse payments, approve workflows, change inventory, run draws, settle commissions, or execute accounting actions.

## Confirmed Implementation

- Backend view: `backend/api/v1/views/admin_bi.py`
- Frontend page: `frontend/src/app/(dashboard)/admin/bi/page.tsx`
- Frontend service: `frontend/src/services/admin-bi.ts`
- Chart card: `frontend/src/components/admin/bi/BiChartCard.tsx`

## Access

- [ ] Admin can load `/admin/bi`.
- [ ] Admin can call `/api/v1/admin/bi/summary/`.
- [ ] Cashier, partner, customer, and public users cannot call the admin BI API.

## Data Sources

BI summary is composed from existing read services:

- ERP summary
- HR summary
- operations queue summary
- Phase 5 reports
- accounting control center reports

Checks:

- [ ] Cards/charts show real API data.
- [ ] Empty datasets show empty states.
- [ ] No fake placeholder KPI is rendered as real data.
- [ ] Reserved stock is omitted unless a real metric is wired.

## Navigation Only

Phase 9F change:

- BI chart cards now expose only an "Open report" link.
- The previous "Take Action" link was removed.
- The BI summary service now calls `/admin/bi/summary/` through the normalized API client, preventing a doubled `/api/v1` prefix.

Allowed:

- report links
- dashboard navigation
- source metric references

Not allowed:

- payment posting
- waiver application
- draw execution
- accounting mutation
- stock mutation
- payout/commission settlement
- rent/lease collection action

## AI Explanation Panel

When AI is enabled:

- [ ] `GET /api/v1/admin/ai/bi-explain/` returns explanation, risks, highlights, source metrics, and safety state.
- [ ] `safety.read_only` is `true`.
- [ ] `safety.actions_executed` is `false`.

When AI is disabled:

- [ ] Panel shows disabled state.
- [ ] BI summary still loads independently.
- [ ] No fallback fake explanation is shown.

## Final BI Gate

Do not launch if:

- `/admin/bi` fails to load for admin.
- BI API is accessible to non-admin users.
- Any BI card shows fake metrics as real values.
- BI exposes a mutation/action control.
- AI explanation executes or suggests direct financial mutation.

