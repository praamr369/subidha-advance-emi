# Subidha ERP — Documentation

Professional developer + operator documentation for the Subidha Advance-EMI ERP.
Start here.

## Guides
- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)** — architecture, app map, the
  non-negotiable conventions, auth/capabilities, request/page shape, how to run
  and test. Read this first.
- **[PRE_PRODUCTION_CHECKLIST.md](PRE_PRODUCTION_CHECKLIST.md)** — the manual
  go-live gate: all routes, all rules, all services/actions, all workflows, and
  all-pages hygiene, in seven signed-off phases. One person can drive it.
- **[DATA_ENCRYPTION_AND_HARDENING.md](DATA_ENCRYPTION_AND_HARDENING.md)** —
  current encryption (`secret_crypto`/Fernet), the gaps, and a future-proof,
  solo-operable plan for the safest posture (key separation + rotation, PII at
  rest, backups, transport).

## Auto-generated inventories (the checklists)
Regenerate before every release so they match the build (see Developer Guide §8):
- **[inventory/routes.md](inventory/routes.md)** — every backend endpoint (2,543), grouped, with a ✓ column.
- **[inventory/pages.md](inventory/pages.md)** — every frontend page/route (651), grouped, with a ✓ column.
- **[inventory/modules.md](inventory/modules.md)** — every backend module (32) with model/service/command counts.

## Reference plans (repo root)
- `SUBSCRIPTIONS_SPLIT_PLAN.md` — the completed 0→H domain split of the
  subscriptions monolith (state-only moves, ContentType handling, per-phase gates).
- `docs/archive/` — historical, superseded status/design notes (kept for context).

## The short version of "how to not break it"
1. `manage.py check` + `makemigrations --check` clean, `tsc` clean — always.
2. Model moves are state-only with pinned `db_table`; DDL is vendor-agnostic.
3. Never weaken a money/stock constraint to pass a test — fix the fixture.
4. Every mutating action: transactional, audited, permission-gated, no plaintext secrets.
5. Verify against the checklist + inventories before go-live.
