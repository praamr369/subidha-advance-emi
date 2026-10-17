# CLAUDE.md — Universal Agent Instructions for Claude

## Identity & Core Mission
You are working on **SUBIDHA CORE – Lucky Plan EMI System** (production furniture retail ERP, POS, and subscription management system).

## Canonical Rulebooks (Mandatory Reading)
Before writing or modifying any backend, frontend, database, or workflow code, you MUST follow:
1. **`AGENTS.md`** (in repository root) — primary operational guidelines, dev harness, and non-negotiables.
2. **`docs/SUBIDHA_CORE_PROJECT_RULEBOOK.md`** — canonical business invariants, financial controls, and audit rules.
3. **`docs/AGENT_SYNC_LOG.md`** — check recent updates made by other agents (Antigravity, Cursor, Codex).

## 🚨 STRICT AI AGENT GUARDRAILS (ZERO-TOLERANCE ENFORCEMENT)
You MUST strictly obey these 5 rules:
1. **DON'T EXECUTE ANYTHING WITHOUT EXPLICIT PERMISSION**: Never execute commands that alter system state or deploy without user approval.
2. **NO AUTONOMOUS GIT/GITHUB ACCESS**: Never run `git push`, `git commit`, `git reset`, `git rebase` without explicit permission.
3. **NO DIRECT DATABASE MUTATION & NEVER USE DELETE**: Never use `DELETE`, `DROP`, `TRUNCATE`, or `flush`. Data is strictly append-only.
4. **NOTHING DELETED WITHOUT EXPLICIT PERMISSION**: Never delete any file, component, service, route, or test (`rm`, `git rm`, unlink).
5. **NOTHING ADDED WITHOUT EXPLICIT PERMISSION**: Never add unrequested packages, libraries, files, or new routes without approval.

Full specification: `docs/STRICT_GUARDRAILS.md`.

---

## Non-Negotiable Core Invariants

1. **Financial Ledger & Append-Only Spirit**:
   - EMI records must NEVER be silently altered or deleted.
   - Payments and financial transactions are append-only. Prefer reversal/adjustment ledger entries over destructive mutations.
   - Winning a draw may waive future unpaid EMIs; NEVER retroactively modify settled payments.

2. **Solopreneur / Single Admin Rule**:
   - The business is operated by a single owner/admin.
   - Admin UI (desktop) is the universal control center with frictionless access to all modules (finance, stock, collections, PIM, subscriptions).

3. **Permanent UI Hierarchy**:
   - **Admin / Superuser UI**: Desktop-first ERP/POS/control-room style (dense workbench, data grids, command bar, right inspector, drawer forms).
   - **Customer / Partner / Vendor / Public UI**: Mobile-first (cards, large touch targets, bottom nav, simple forms).

4. **Never Delete or Duplicate Admin Routes**:
   - Never create duplicate admin routes for existing features (e.g., collect/collection, reversals/returns).
   - Never delete existing duplicate pages during consolidation — perform **additive merge only** using a tab switcher under a single canonical route shell.

5. **Safe Dev Database (`subidha_core` @ PostgreSQL)**:
   - The local Postgres database contains real working test data.
   - READ freely; WRITE only through standard application flows.
   - NEVER run destructive wipe scripts (`flush`, `migrate zero`, `clear_operational_data.py`).
   - Zero cosmetic test data: fake records break financial KPIs and reconciliation.

---

## Local Dev Harness & Verification Gates

### Tech Stack
- **Backend**: Django 5 + Django REST Framework on `http://127.0.0.1:8000/api/v1`
- **Frontend**: Next.js App Router (React + TypeScript + Tailwind + shadcn/ui) on `http://localhost:3000`
- **Database**: PostgreSQL `subidha_core`

### Verification Gates (Run before claiming any task is done)

**Frontend Changes**:
```bash
cd frontend
npm run typecheck      # primary fast gate (tsc --noEmit)
npm run check:routes   # mandatory if pages/routes touched
```

**Backend Changes**:
```bash
backend/venv/bin/python backend/manage.py check
backend/venv/bin/python backend/manage.py makemigrations --check --dry-run
backend/venv/bin/python backend/manage.py test <scoped.test.path>
```

---

## Multi-Agent Synchronization
When completing a major schema, business rule, or architectural update, record your change using the synchronization tool:
```bash
python scripts/agent_sync.py broadcast --agent "Claude" --type "schema|feature|fix" --summary "Brief summary" --details "Detailed notes"
```
Or append an entry directly to `docs/AGENT_SYNC_LOG.md`.

