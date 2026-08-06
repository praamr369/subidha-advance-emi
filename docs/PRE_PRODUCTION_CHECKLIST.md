# Pre-Production Verification Checklist

The manual go-live gate for Subidha ERP. Nothing ships to the live business until
every phase here is green. It is written so **one person** can drive the whole
verification with a browser, the API docs, and a terminal.

The heavy row-by-row lists live in the auto-generated inventories — tick the
boxes there as you go:
- [`inventory/routes.md`](inventory/routes.md) — **2,543** API endpoints (all routes, all methods).
- [`inventory/pages.md`](inventory/pages.md) — **651** frontend pages/routes.
- [`inventory/modules.md`](inventory/modules.md) — **32** backend modules (models / services / commands).

Regenerate the inventories first (see the Developer Guide §8) so they match the
build you are shipping.

---

## Phase 0 — Automated gates (must pass before any manual work)

- [ ] `python manage.py check` → *0 issues*.
- [ ] `python manage.py check --deploy` reviewed (security settings for prod).
- [ ] `python manage.py makemigrations --check --dry-run` → *no changes* for all first-party apps (only third-party may differ).
- [ ] `python manage.py migrate` on a **clone of the production DB** → applies cleanly; no missing tables.
- [ ] `python manage.py spectacular --file schema.yml` → exit 0; open `/api/docs/` and confirm it renders.
- [ ] Frontend `npm run typecheck` and `npm run lint` → clean.
- [ ] Frontend `npm run build` → succeeds.
- [ ] Targeted test suites for money paths green: payments, accounting bridge, contracts, reconciliation, settlements.

> Rule: **never** weaken a constraint or guard to make a check pass. If a check
> fails, the code or the data is wrong — fix that.

## Phase 1 — All routes (backend contract)

Work through [`inventory/routes.md`](inventory/routes.md) group by group. For
**each endpoint** confirm the three things printed at the top of that file:

- [ ] **Auth/permission enforced** — anonymous → 401; wrong role → 403; right role → 200. Spot-check that no admin endpoint is reachable by a partner/customer/cashier token.
- [ ] **Happy path** — valid request returns the expected shape/status (use `/api/docs/` "Try it out").
- [ ] **One failure path** — bad input → 400 with a useful message; forbidden action → 403; missing object → 404 (not 500).
- [ ] **No dead/duplicate routes** — every row resolves to a real view; no two prefixes serve the same handler unintentionally.

Priority order (do these groups first): `admin`, `cashier`, `payments`,
`accounting`, `billing`, `contracts`, `reconciliation`, `settlements`, then the
portals (`partner`, `customer`, `public`).

## Phase 2 — All rules (invariants & guards)

For each domain, prove the guardrails hold with a deliberate bad attempt:

- [ ] **Money:** cannot record two competing payments for the same EMI intent; cannot post to a closed accounting period; cannot post without valid finance-account mappings; no negative account/EMI balances; over-collection blocked.
- [ ] **Stock:** stock ledger append-only; cannot deliver/return without the stock effect; opening-stock posting requires the `INVENTORY_ASSET` chart account.
- [ ] **Contracts:** EMI enrolment blocked after batch lock (CTRL-LP-5); term-locked contracts reject edits; cancellation follows the allowed state machine.
- [ ] **KYC/AML:** contract gating respects KYC readiness; AML/PEP flags surface.
- [ ] **Auth:** capability gates (`billing.override_allocation`, etc.) actually block; role changes take effect immediately.
- [ ] **Idempotency:** repeated collect/post calls with the same idempotency key do not double-apply.

## Phase 3 — All services & actions (business logic)

Use [`inventory/modules.md`](inventory/modules.md) to walk each module's
`services/`. For every **mutating action** confirm:

- [ ] It runs in a transaction (partial writes cannot escape on error).
- [ ] It writes an `audit.AuditLog` row with actor + metadata; **no plaintext secret/password** in the log or response.
- [ ] It is permission/capability gated at the entry point (view), not just the UI.
- [ ] Its failure path leaves data consistent (no orphan rows, no dangling FKs).
- [ ] Reversible actions (cancel/refund/void/reset) restore a correct state.

Special attention: the **operations→accounting bridge** (posts journals),
**reconciliation/settlement** matching, **commission** payout batches, the
**lucky-plan** commit/reveal, and **business reset** (FK-safe delete order).

## Phase 4 — All workflows (end-to-end, in the browser)

Run each critical journey start-to-finish as the real roles. Tick only when the
whole chain — UI action → API → service → DB → audit → downstream (accounting/
stock/notification) — is correct.

> **Automated coverage** for every journey below (Playwright release-candidate specs
> + the Layer-A/B/C API locks that gate & delta-review each endpoint) is mapped in
> the Layer-D table of [`coverage_ledger.md`](coverage_ledger.md#layer-d--end-to-end-workflows--go-live-pre-production-checklist-phases-4--6).
> These boxes are the operator's **manual UI walkthrough on a prod-like clone** — the
> one genuinely-manual gate on top of that automated coverage.

- [ ] **Lead → customer → KYC → contract → delivery** (EMI).
- [ ] **Rent / lease contract → monthly demand → collection → deposit handling.**
- [ ] **Cashier collection** (cash / bank / UPI) → receipt → daily close.
- [ ] **Direct sale → invoice → delivery case → payment → posting.**
- [ ] **Purchase order → goods receipt → vendor bill → payment.**
- [ ] **Bank/UPI statement import → reconciliation → allocation.**
- [ ] **Return / exchange → stock restock → credit/debit note.**
- [ ] **Commission accrual → payout batch → payout.**
- [ ] **Lucky-plan batch → lock → draw commit → reveal → winner.**
- [ ] **Month-end / year-end close** (books balance; locks apply).
- [ ] **Business setup reset** on a clone (preserves admin; clears operational data cleanly).

## Phase 5 — Frontend page hygiene (all 651 pages)

Walk [`inventory/pages.md`](inventory/pages.md). For **each page** apply this
5-point hygiene rubric — a page is "working" only when all five hold:

1. [ ] **Renders** — no red console errors, no unhandled promise rejections, no broken layout.
2. [ ] **Data loads** — primary data appears, or a clean empty/error/loading state shows (never a blank or a spinner that never resolves).
3. [ ] **Primary action works** — the page's main create/update/action succeeds and persists (verify server-side, not just optimistic UI).
4. [ ] **Role-gating correct** — the right roles reach it; wrong roles are redirected/blocked (matches the backend permission).
5. [ ] **Responsive + dark mode** — usable on the target screen sizes and in both themes; no overflow/clipping.

Efficiency for a solo run: verify the shared shells/components once
(`ERPPageShell`, KPI rows, `PaginationControls`, tables, forms), then per page
you only re-check the page-specific data + action. Group by the 57 top-level
sections in the inventory; a whole section often shares a layout.

**Also confirm:** no orphan React Router pages (Next.js App Router only); no
links to removed features (e.g. the removed Online-Enquiries admin); pagination
present on every large register (customers, lucky-ids, products, payments).

## Phase 6 — Data, security & operability (go-live)

- [ ] **Encryption** — see [`DATA_ENCRYPTION_AND_HARDENING.md`](DATA_ENCRYPTION_AND_HARDENING.md); all at-rest secrets via `secret_crypto`, TLS enforced, `SESSION_COOKIE_SECURE`/`CSRF_COOKIE_SECURE` on, `SECRET_KEY` not a placeholder, `CORS_ALLOWED_ORIGINS` has no `*`.
- [ ] **Production readiness command** — `python manage.py check_production_readiness` passes with the production settings (DEBUG off, ALLOWED_HOSTS set, Redis broker, BACKUP_ROOT exists, admin account exists, mappings complete).
- [ ] **Backups** — `BACKUP_ROOT` configured; a backup + a **test restore** on a clone succeeds; retention defined.
- [ ] **Cache** — Redis backend in prod (not LocMemCache) so cache survives restarts and is shared across workers.
- [ ] **Audit trail** — spot-check that recent admin actions produced audit rows.
- [ ] **Rollback plan** — DB snapshot taken immediately before deploy; `push-live`/`deploy.sh` rollback path known.
- [ ] **Observability** — errors surfaced (log/APM); a smoke request to `/healthz` + `/readyz` returns OK.
- [ ] **Solo-operator runbook** — the operator knows how to: reset a password (admin flow), re-run accounting setup defaults, close the day/month, take a backup, and read the audit log.

## Sign-off

| Phase | Owner | Date | Result |
|---|---|---|---|
| 0 Automated gates | | | |
| 1 Routes | | | |
| 2 Rules | | | |
| 3 Services & actions | | | |
| 4 Workflows | | | |
| 5 Page hygiene | | | |
| 6 Data/security/ops | | | |

**Go-live approved only when every phase is signed and every blocking box is ticked.**

---

## Go-live execution sequence (operator runbook)

The automated gates (Layers A–C, ~52 CI tests) and the config-side security controls
(`production.py`/`base.py`) are already green. What remains is the human/infra
sequence below — run top-to-bottom on deploy day.

**A. Pre-flight (on a prod-like clone)**
1. Restore the latest prod DB dump onto a clone. Run the **Phase-4 UI walkthrough**
   (the 11 journeys — coverage mapped in [`coverage_ledger.md`](coverage_ledger.md) Layer D)
   as the real roles; tick each Phase-4 box only when the whole chain is correct.
2. `python manage.py check_production_readiness --settings=core.settings.production`
   (with prod env vars loaded) → must exit 0. It enforces: DEBUG off, ALLOWED_HOSTS set,
   `BACKUP_ROOT` exists, `SECRET_KEY` not placeholder, `CORS_ALLOWED_ORIGINS` has no `*`,
   an active admin exists, admin has `billing.override_allocation`.
3. Confirm prod env: `REDIS_URL`/`CACHE_REDIS_URL` set (→ RedisCache, not LocMem),
   `BACKUP_ROOT` on persistent storage, TLS termination in front (HSTS/secure cookies
   are already on in `production.py`).

**B. Deploy**
4. **Take a rollback snapshot** of the prod DB *immediately* before deploy.
5. Run the deploy pipeline (`push-live.ps1` → `deploy.sh`); it runs `migrate`.
6. Post-deploy smoke: `GET /healthz` and `/readyz` return 200; `GET /api/v1/health/deep/`
   returns 200 (or 200 "degraded" if an optional dep is down — see the deep-health split).

**C. Verify + retention**
7. Spot-check the **audit trail** (recent admin actions produced `AuditLog` rows).
8. Confirm a **backup ran + a test restore** on the clone succeeded; set retention.
9. Keep the rollback path known: restore the step-4 snapshot if step 6/7 fail.

The CI release-candidate job also runs the Playwright **route-load smoke** (every static
page × role) and the **release-smoke** journey specs on Linux — the automated proxy for
much of the Phase-4/Phase-5 walkthrough.
