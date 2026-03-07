# Subidha Lucky Plan — Project Completion TODO

This checklist is organized around your stated priorities:

- Backend (Django + DRF + SimpleJWT + PostgreSQL)
- Frontend (Next.js + TypeScript + App Router)
- API contract stability
- Security hardening
- Financial data integrity
- Long-term extensibility

---

## 1) Current Project Structure Snapshot

- `backend/`
  - `core/settings/` environment-specific Django settings
  - `accounts/` custom user + roles
  - `subscriptions/` financial domain models and services (EMI, payment, ledger, lucky draw, commission)
  - `api/v1/` DRF routes/views/serializers for auth, admin, cashier, partner, customer
- `frontend/`
  - `src/app/` Next.js App Router pages (public + dashboard sections)
  - `src/lib/` API/auth constants and client helpers
  - `src/components/` auth/ui/report components

---

## 2) Shell Validation (initial run)

- [x] Frontend lint executed (`npm run lint`) → **failing** with 10 errors, 4 warnings.
- [x] Backend Django system check attempted (`python manage.py check`) → blocked because Django is not installed in this environment.
- [x] Dependency install attempted (`pip install -r requirements.txt`) → blocked by proxy/network restrictions in this environment.

---

## 3) Priority-Ordered TODO (Production Readiness)

## P0 — Must fix before production

### Security hardening

- [ ] Remove hardcoded database credentials from `backend/core/settings/base.py`; read credentials only from environment variables/secrets manager.
- [ ] Remove fallback weak secret key (`unsafe-dev-secret-key`) and enforce startup failure if `DJANGO_SECRET_KEY` missing in non-dev environment.
- [ ] Split CORS policy per environment and avoid permissive defaults.
- [ ] Add strict Django security settings in production: `SECURE_SSL_REDIRECT`, secure cookie flags, HSTS, content-type nosniff, XSS filter/headers, trusted CSRF origins.
- [ ] Move token storage away from `localStorage` to secure HttpOnly cookies (or apply short-lived in-memory strategy with strict refresh handling).
- [ ] Ensure refresh endpoint uses configured API base URL (not hardcoded host).

### Backend correctness (auth + models)

- [ ] Fix registration flow mismatch: `Customer.user` is required OneToOne, but self-registration currently creates `Customer` without linking user.
- [ ] Add serializer-based request validation for auth/register/login endpoints to enforce schema and consistent error responses.
- [ ] Add role-based permission tests for admin/cashier/partner/customer endpoints.
- [ ] Audit all service-layer writes for transactional boundaries and idempotency keys (especially payment and lucky draw flows).

### Financial integrity

- [ ] Enforce strict cross-entity validation for `Payment` (`payment.customer` must match `payment.subscription.customer`; `payment.emi.subscription` must match `payment.subscription`).
- [ ] Prevent overpayment at DB/service level (current model allows unrestricted cumulative payment > EMI amount).
- [ ] Ensure all monetary operations use deterministic rounding policy (`Decimal.quantize`) in one shared utility.
- [ ] Add immutable event/audit trail for reversals, waivers, commission recalculations, and draw decisions.

### Frontend quality gate

- [ ] Fix all ESLint blocking errors (`no-explicit-any`, `react-hooks/set-state-in-effect`, unescaped entities).
- [ ] Replace unsafe `any` in dashboard pages with shared typed DTOs aligned to backend serializer responses.
- [ ] Add global API error normalization and user-safe toast/error handling.

---

## P1 — Strongly recommended next

### API contract stability

- [ ] Introduce OpenAPI schema generation and commit a versioned contract artifact (`openapi/v1.yaml`).
- [ ] Add contract tests for critical endpoints (auth, subscription creation, payment collection, draw execution, partner commission).
- [ ] Add backward-compatible API versioning rules (deprecation window + changelog policy).
- [ ] Standardize paginated list response shape across all list endpoints.

### Backend architecture improvements

- [ ] Consolidate business logic into service layer; keep views thin and serializer-driven.
- [ ] Create command/query separation for complex dashboard/reporting endpoints.
- [ ] Add structured domain exceptions mapped to stable API error codes.
- [ ] Add database indexes from real query plans (`EXPLAIN ANALYZE`) for payment history, due EMI search, partner commission statements.

### Testing baseline

- [ ] Backend: pytest + factory fixtures; minimum tests for models, permission matrix, service transactions, and API contracts.
- [ ] Frontend: unit tests for auth guards/api client + integration tests for critical dashboard flows.
- [ ] Add CI pipeline with lint/test/build gates and migration checks.

---

## P2 — Long-term extensibility

- [ ] Add domain modules + bounded contexts (`billing`, `draws`, `commissions`, `identity`) with explicit interfaces.
- [ ] Introduce asynchronous task queue for expensive jobs (reports, reconciliation, payout batches).
- [ ] Add observability stack: request tracing, domain metrics, error budgets, audit dashboards.
- [ ] Prepare multi-tenant or branch-aware data partitioning strategy if growth expected.
- [ ] Add archival strategy for old payments/audit logs with immutable storage guarantees.

---

## 4) Concrete “First Sprint” Plan (recommended)

1. **Security baseline PR**
   - secrets/env cleanup, production security settings, token handling improvements.
2. **Data integrity PR**
   - registration linkage fix, payment cross-check constraints, overpayment prevention.
3. **Frontend reliability PR**
   - lint cleanup + typed API DTO layer + unified API error handling.
4. **Contract + tests PR**
   - OpenAPI snapshot + critical endpoint contract tests + CI gates.

---

## 5) Definition of Done (DoD)

- [ ] `backend`: checks/tests pass in CI, migrations validated, no hardcoded secrets.
- [ ] `frontend`: lint/build pass, typed API integration for all dashboard features.
- [ ] `api`: documented and versioned contract with passing contract tests.
- [ ] `security`: production settings enabled and validated.
- [ ] `finance`: reconciliation reports match ledger totals and overpayment impossible.
- [ ] `operations`: monitoring + audit trail + rollback/reversal procedures documented.

