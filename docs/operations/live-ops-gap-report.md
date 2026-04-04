# Live Ops Gap Report

This report captures the current live-ops gaps found during the post-hardening readiness audit.

It covers only non-financial operational surfaces:

- batch lifecycle status drift
- standalone Lucky ID generation route safety
- customer CSV import UX wiring

It does not introduce or assume any bulk subscription import.

## 1. Batch lifecycle drift

### Current enum in domain model

`backend/subscriptions/models.py`

Current `BatchStatus` choices are:

- `DRAFT`
- `OPEN`
- `FULL`
- `DRAW_IN_PROGRESS`
- `COMPLETED`
- `CLOSED`

### Drift in admin transition helper

`backend/api/v1/views/admin_resources.py`

The admin batch transition guard currently uses a different status model:

- `DRAFT -> OPEN`
- `OPEN -> ACTIVE, CLOSED`
- `ACTIVE -> CLOSED`
- `CLOSED -> COMPLETED`
- optional `CANCELLED` branch only if the enum exposes it

### Exact mismatch

The mismatch is concrete:

- `ACTIVE` is referenced by the admin transition helper, but `ACTIVE` is not in the current `BatchStatus` enum.
- `CANCELLED` is referenced conditionally by the admin transition helper and several frontend batch pages, but `CANCELLED` is not in the current `BatchStatus` enum.
- `FULL` and `DRAW_IN_PROGRESS` are present in the enum and in backend service-layer usage, but they are not part of the admin transition helper’s allowed transition map.
- `backend/subscriptions/services/batch_service.py` still uses the enum-aligned path:
  `DRAFT -> OPEN -> FULL -> DRAW_IN_PROGRESS -> COMPLETED -> CLOSED`
- `frontend/src/app/(dashboard)/admin/batches/[id]/edit/page.tsx` mirrors the stale `ACTIVE`-based transition model rather than the enum-backed `FULL` / `DRAW_IN_PROGRESS` model.

### Operational impact

- First-live onboarding is only partially affected because `DRAFT -> OPEN` still aligns.
- Post-sale lifecycle handling is at risk because UI and admin route logic no longer describe the same lifecycle as the enum and service layer.
- This should be treated as a live-ops correctness gap before relying on batch transitions beyond the initial `OPEN` move.

### Recommendation

- Do not patch this casually from the UI alone.
- Reconcile enum, admin transition helper, frontend batch edit screen, and batch service in one focused non-financial lifecycle pass.

## 2. Standalone Lucky ID generation page

### Route audited

`frontend/src/app/(dashboard)/admin/batches/[id]/generate-lucky-ids/page.tsx`

### Finding

The previous page attempted to call:

- `POST /api/v1/admin/batches/{id}/generate-lucky-ids/`

No confirmed backend route or view action exists for that path in the current code.

The actual Lucky ID behavior today is:

- Lucky IDs are auto-generated on batch creation by signal logic in `backend/subscriptions/signals.py`
- batch readiness is observable through:
  - `GET /api/v1/admin/batches/{id}/summary/`
  - `GET /api/v1/admin/lucky-ids/`

### Operational classification

- The standalone page was mismatched with backend routes.
- It was effectively dead or unsafe as a live operator path.

### Additive fix applied

The route now redirects back to canonical batch detail instead of presenting a fake actionable page.

Result:

- no unsupported Lucky ID generation action remains exposed
- operators are routed to the live batch detail and summary views
- Lucky ID preparation remains aligned with actual backend behavior

## 3. Customer CSV import UX gap

### Backend capability already present

`backend/api/v1/views/admin_resources.py`

Confirmed endpoints:

- `POST /api/v1/admin/customers/import/preview/`
- `POST /api/v1/admin/customers/import-csv/`

### Frontend gap before this pass

- `frontend/src/domains/customers/api.ts` exposed preview only.
- `frontend/src/app/(dashboard)/admin/customers/page.tsx` did not expose the confirm-import flow.

This meant the backend import capability existed but was not available from the main admin customer workspace.

### Smallest additive fix applied

The customer register now exposes:

- CSV file selection
- preview call to the existing backend preview endpoint
- confirm-import call to the existing backend commit endpoint
- safety gating so confirm-import stays disabled until preview exists and `invalid_count === 0`
- created-row feedback including generated usernames returned by the backend

### Operational impact

- This keeps the UI aligned with a real backend capability.
- It does not invent new import behavior.
- It reduces the need for admins to leave the current workspace or call the backend manually.

### Remaining caution

- Generated passwords are still not returned by the backend.
- Customer CSV import is still appropriate for profile preload, not final credential handoff.

## 4. Bulk subscription import

No bulk subscription importer was found or introduced.

Safe position remains:

- use `docs/imports/subscription-import-template.csv` only as a staging/reference sheet
- create subscriptions through the existing admin create flow

## 5. Current recommendation before first live onboarding

Safe to use now:

- product CSV import
- batch creation
- automatic Lucky ID creation on batch create
- customer CSV preview and confirm import from the admin UI
- manual admin subscription creation

Still requires a dedicated follow-up:

- batch lifecycle drift reconciliation across enum, admin transition helper, and batch edit UI
