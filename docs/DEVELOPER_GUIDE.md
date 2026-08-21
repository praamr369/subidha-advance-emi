# Subidha ERP — Developer Guide

Professional onboarding + operating reference for the Subidha Advance-EMI ERP.
Written for a competent developer (or a solo operator with dev skills) who needs
to understand, safely change, and ship this codebase.

> Companion documents:
> - [`PRE_PRODUCTION_CHECKLIST.md`](PRE_PRODUCTION_CHECKLIST.md) — the manual go-live verification plan (routes / rules / services / actions / workflows / pages).
> - [`DATA_ENCRYPTION_AND_HARDENING.md`](DATA_ENCRYPTION_AND_HARDENING.md) — data-at-rest/in-transit encryption, key management, future-proofing.
> - [`inventory/routes.md`](inventory/routes.md), [`inventory/pages.md`](inventory/pages.md), [`inventory/modules.md`](inventory/modules.md) — auto-generated inventories (regenerate before each release; see below).

---

## 1. What this is

A single-tenant retail ERP for an EMI / rent / lease furniture business (Asansol,
India). It covers customers & KYC, EMI/rent/lease contracts, payments &
reconciliation, direct sales & billing, inventory & purchasing, accounting
(double-entry with a "bridge" from operations to journals), CRM, service desk,
commissions, a cryptographic "lucky plan" draw, and a public storefront.

**Scale (auto-measured):** ~33 Django apps, ~351 models, **2,627 API endpoints**,
**602 frontend pages**, ~369 backend service files, ~57 management commands,
~366 migrations. It is large; treat every change as touching a live business.

## 2. Stack & layout

| Layer | Tech | Location |
|---|---|---|
| Backend | Django 5.2 + DRF, PostgreSQL, Celery/Redis | `backend/` |
| Frontend | Next.js (App Router) + React Query + TypeScript | `frontend/` |
| Auth | JWT (SimpleJWT), role + capability matrix | `backend/accounts/` |
| API docs | drf-spectacular → `/api/schema/`, `/api/docs/`, `/api/redoc/` | `core/urls.py` |
| Deploy | `push-live.ps1` → SSH → `deploy.sh` (VPS at Hostinger) | repo root |

**Settings are a package**, not a file: `backend/core/settings/` (`base.py` +
env modules `development.py` / `test.py` / `ci_deploy.py`). The dev DB is real
PostgreSQL (`subidha_core`); the test DB is SQLite.

### App map (domain split)
The former monolithic `subscriptions` app was split into focused apps; the
operational data now lives in: `customers`, `contracts` (subscription/EMI/rent/
lease), `payments` (EMI/Payment/ledger), `lucky_plan`, `deliveries`,
`commissions`, `growth`, `business_setup` (org/brand/policy config),
`finance_control`, `audit`, `products_core`. `subscriptions` remains as a
**shim/enums/services** layer (no models) — legacy `from subscriptions.models
import X` imports still resolve. `accounting`, `inventory`, `billing`, `crm`,
`service_desk`, `reconciliation`, `settlements` are their own domains.

## 3. Non-negotiable conventions

These are the rules that keep the app correct. Follow them; the reviewers/tests do.

1. **Verification gates before "done":** `python manage.py check` **and**
   `python manage.py makemigrations --check --dry-run` (must say *no changes* for
   first-party apps) on the backend; `npm run typecheck` (tsc) on the frontend.
   The full test suite is a signal, not the gate (it carries known drift).
2. **Migrations:** never edit an applied migration. Model moves across apps are
   **state-only** (`SeparateDatabaseAndState`, `database_operations=[]`) with the
   table pinned via `Meta.db_table`. Any raw DDL must be vendor-agnostic —
   `DROP TABLE … CASCADE` is Postgres-only; the test DB is SQLite (drop
   child-first, no CASCADE).
3. **ContentTypes on model moves:** repoint or delete the stale `django_content_type`
   row for each moved model (merge-aware: repoint in place if no new-app CT
   exists yet, else delete the stale one). Otherwise dead CTs + orphaned
   permissions accumulate.
4. **Money & stock invariants:** never weaken a DB constraint or a service guard
   to make a test pass — fix the fixture. One payment intent per EMI; no negative
   balances; stock ledger is append-only; posting requires an open accounting
   period + valid finance-account mappings.
5. **Every mutating admin action is audited** (`audit.AuditLog`, with
   `action_type`, `performed_by`, `object_id`, `model_name`, `metadata`) and
   **permission-gated** (see §4). Plaintext secrets/passwords are never logged.
6. **Encryption for secrets:** SMTP passwords, API tokens, and any at-rest secret
   go through `subscriptions/services/secret_crypto.py` (`encrypt_secret` /
   `decrypt_secret`) — never store them raw. See the hardening doc.
7. **Reset/bulk-delete must be FK-safe:** operational data spans many apps; delete
   children before parents (see `business_reset_service._fk_safe_delete_tables`).

## 4. Authorization model

Two layers, both enforced server-side:
- **Roles** (`accounts.UserRole`): `ADMIN`, `PARTNER`, `CUSTOMER`, `CASHIER`,
  `VENDOR`, `STAFF`. DRF permissions `IsAdmin`, `IsCashierOrAdmin`, etc. check
  `request.user.role` — **not** `is_staff`/`is_superuser`. A superuser without
  `role="ADMIN"` is still forbidden from admin endpoints.
- **Capabilities** (`accounts/capabilities.py`, `ROLE_CAPABILITY_FALLBACKS` +
  the DB capability matrix): fine-grained gates like `billing.override_allocation`
  via `@require_capability(...)`.

**Throttling** is role-aware (`api/v1/throttles/role_aware.py`): a global
per-user baseline whose rate scales with role (admin 6000/min … customer
300/min), plus endpoint-specific scoped throttles (login, payment_mutation).

## 5. Backend request shape

`core/urls.py` → `api/v1/urls.py` (includes ~56 route modules from
`api/v1/routes/`) → views in `api/v1/views/` (172 files) → domain **services**
(`<app>/services/`, 388 files) → models. **Business logic lives in services**, not
views or models' `save()` beyond validation. The double-entry "bridge" posts
operational events (payments, sales, rent demands) into accounting journals; it
is auto-ready when its finance-account mapping is valid.

## 6. Frontend shape

Next.js App Router under `frontend/src/app/` (651 pages) — route groups like
`(dashboard)`, `(public)`. Server state via **React Query**; server-side
pagination via `PaginationControls` + the `AdminListPagination` /
`AdminOptInPagination` DRF paginators (`toPaginated`/`toArray` adapters).
Canonical route strings live in `frontend/src/lib/routes.ts` — use them, don't
hardcode paths. Page-level shells (`ERPPageShell`, KPI stat rows) give a
consistent desktop-app feel.

## 7. Running & testing

```bash
# Backend (from backend/, venv active)
python manage.py check
python manage.py makemigrations --check --dry-run   # first-party apps must be clean
python manage.py migrate                             # dev = Postgres subidha_core
python manage.py runserver
python manage.py test <path> --settings=core.settings.test   # SQLite; serial (parallel runner can choke)

# Frontend (from frontend/)
npm run typecheck
npm run lint
npm run dev
```

CI (`.github/workflows/ci.yml`) runs on PRs: backend `check` + first-party
migration-drift (blocking) + frontend `lint`/`typecheck` (blocking) + the full
test suite (reported, non-blocking until the long-tail drift is cleared).

## 8. Regenerating the inventories

The `inventory/*.md` files are generated from the live codebase. Regenerate them
before every release so the checklist reflects reality:

```bash
# from backend/ (venv active) — routes come from the URLconf
python <scratchpad>/gen_routes.py     # or re-run the generator committed alongside these docs
# pages + modules are pure file walks over frontend/src/app and backend/*/…
```

If the counts shift materially, something was added/removed — reconcile it in the
checklist.

## 9. Where to be careful (highest-blast-radius areas)

- **payments + accounting bridge** — money movement, idempotency, posting locks.
- **contracts** — EMI/rent/lease lifecycle, term locks, cancellation.
- **reconciliation / settlements** — bank/UPI import & matching.
- **business reset** — wipes operational data across many apps (FK order matters).
- **lucky_plan draw** — cryptographic commit/reveal; legal-sensitive.
- **auth/capabilities** — a wrong gate exposes admin functions to a portal role.
