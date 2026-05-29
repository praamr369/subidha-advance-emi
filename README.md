

# SUBIDHA ADVANCE EMI

Production-oriented Lucky Plan EMI system for Subidha Furniture.

This project is designed for real daily business operations with a clean path for future expansion into furniture rental, leasing, and partner-driven commerce without breaking existing EMI data or workflows.

---

## Core Purpose

SUBIDHA ADVANCE EMI manages:

- Customers
- Products
- Batches
- Lucky IDs
- Subscriptions
- EMI schedules
- Payments
- Waivers for winners
- Partner-related business workflows
- Admin and cashier operations

The system is built to support:

- Financial correctness
- Auditability
- Simplicity for shop staff
- Future extensibility

---

## Business Model Summary

- A customer joins an EMI plan for a selected product
- A batch contains Lucky IDs
- Each subscription is linked to one Lucky ID in a batch
- EMI is paid monthly
- One winner may be selected based on the business rules of the Lucky Plan
- The winner receives waiver of future EMI only
- All payment, waiver, and subscription transitions must remain auditable

---

## Project Goals

- Stable daily operations for local business use
- Role-based workflows for admin, cashier, partner, and customer
- Clear backend and frontend separation
- Additive improvements only
- Backward compatibility for future furniture rental / lease support

---

## Tech Stack

### Backend
- Python
- Django
- Django REST Framework
- PostgreSQL
- JWT Authentication

### Frontend
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

---

## Main Modules

### Backend Domain Modules
- Accounts and authentication
- Customers
- Products
- Batches
- Lucky IDs
- Subscriptions
- EMI schedules
- Payments
- Reports
- Audit logs
- Partner workflows

### Frontend Workspaces
- Public website
- Admin dashboard
- Cashier dashboard
- Partner dashboard
- Customer dashboard
- Staff dashboard
- Vendor dashboard
---

## Key Principles

- No destructive business logic changes without review
- Schema changes should be additive and non-breaking
- Payment and EMI state transitions must be traceable
- UI must support fast daily business use
- Future rental/leasing features must not break EMI flows

---

## Backend environment setup

The backend reads environment variables from `backend/.env` in local development.

Safe setup path:

1. Copy `backend/.env.example` to `backend/.env`
2. Set `DJANGO_SECRET_KEY`
3. For PostgreSQL, set either:
   - `DATABASE_URL`, or
   - `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`

Production rule:

- Do not rely on code defaults for database credentials or deployment security settings
- Outside local development, `DJANGO_ALLOWED_HOSTS` must be set explicitly
- If you configure `CORS_ALLOWED_ORIGINS` outside local development, you must also set `CSRF_TRUSTED_ORIGINS`
- Outside local development, missing critical environment variables now fail fast with clear runtime errors instead of silently falling back to permissive defaults

Proxy / HTTPS rule:

- If Django runs behind a reverse proxy or load balancer that terminates HTTPS, set `TRUST_X_FORWARDED_PROTO=true`
- Optionally set `USE_X_FORWARDED_HOST=true` when your deployment relies on forwarded host headers
- Secure cookies and HTTPS redirect default to enabled outside local development

Static / media rule:

- `STATIC_ROOT` and `MEDIA_ROOT` are environment-aware and can be overridden for deployment targets
- Outside local development, static files use manifest-based static storage so collectstatic output is explicit and safer for production serving

Local development rule:

- If no DB environment variables are provided and the app is in local/development mode, the backend falls back to local SQLite for safe startup
- Local development also gets safe localhost defaults for allowed hosts, CORS, and CSRF trusted origins

---

## Operational health and release safety

Minimal operator endpoints:

- `GET /healthz/` → process liveness
- `GET /readyz/` → DB and migration readiness
- `GET /api/v1/public/health/` → API alias for liveness
- `GET /api/v1/public/readiness/` → API alias for readiness

Operational documentation:

- `docs/deployment/OPERATIONS_RUNBOOK.md`
- `docs/deployment/RELEASE_SMOKE_CHECKLIST.md`
- `docs/deployment/RELEASE_CANDIDATE_VALIDATION.md`

Use these docs for:

- boot and migrate sequence
- collectstatic
- admin recovery
- backup and restore expectations
- post-release smoke checks
- release-candidate validation

---

## Release-candidate runner

From the repository root, run the full RC validation flow with:

```bash
bash scripts/run-release-candidate.sh
```

This orchestrates backend validation, frontend validation, deterministic smoke automation, and the separate real-login auth smoke slice in one operator-friendly command.

---

## Suggested Repository Structure

```text
subidha-lucky-plan/
├── backend/
├── frontend/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── business-rules/
│   ├── deployment/
│   └── release-notes/
├── scripts/
├── .github/
│   └── workflows/
├── README.md
├── .gitignore
├── LICENSE
└── CHANGELOG.md
```
