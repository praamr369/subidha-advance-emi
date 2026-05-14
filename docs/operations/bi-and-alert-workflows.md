# BI and Alert Workflows (Phase 9)

## BI workflow (implemented)
1. Admin BI APIs are read-only and admin-guarded:
   - `backend/api/v1/views/admin_bi.py`
   - routes under `/api/v1/admin/bi/*`
2. BI payloads are built from canonical persisted records:
   - `backend/subscriptions/services/business_intelligence_service.py`
3. BI UI consumes backend endpoints only:
   - `frontend/src/services/admin-bi.ts`
   - `frontend/src/app/(dashboard)/admin/bi/page.tsx`

## Alert workflow (implemented)
1. Job task executes with idempotency key:
   - `backend/system_jobs/tasks.py`
   - `backend/system_jobs/services/job_runner.py`
2. Job produces reminders or advisory signals.
3. In-app notifications are emitted with dedupe key:
   - `backend/system_jobs/services/notifications.py`
4. Role-scoped notification APIs deliver user-specific rows:
   - admin/cashier/customer/partner notification endpoints.

## Command center and operations surfaces
- Admin operations command center UI:
  - `frontend/src/app/(dashboard)/admin/operations/command-center/page.tsx`
- Queue/alert APIs wired from admin routes in:
  - `backend/api/v1/routes/admin.py`

## Safety notes
- BI is read-only; no financial mutation in BI endpoints.
- Alerts are advisory; they do not post payments, alter EMI schedules, or modify draw outcomes.

## Future additive work (proposed, not implemented)
- Escalation levels with explicit ACK/resolve workflow per alert type.
- Configurable alert windows and suppression rules per branch.
