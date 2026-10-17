# GitHub Copilot & OpenAI Codex Instructions for SUBIDHA CORE

## Workspace Overview
This repository contains **SUBIDHA CORE – Lucky Plan EMI System** (production furniture retail ERP, POS, and subscription management system).

## Canonical Rulebooks
All AI code generation, refactoring, and PR suggestions must adhere strictly to:
1. `AGENTS.md` (in repository root) — primary operational guidelines, dev harness, and non-negotiables.
2. `docs/SUBIDHA_CORE_PROJECT_RULEBOOK.md` — canonical business invariants, financial controls, and audit rules.
3. `docs/AGENT_SYNC_LOG.md` — check recent updates made by other agents (Claude, Antigravity, Cursor).

## Non-Negotiable Invariants
- **Append-Only Financial Ledger**: Never generate code that silently modifies or deletes settled payments or EMI schedules. Financial history is append-only.
- **Admin UI vs Non-Admin UI**: Admin pages (`/admin/*`) must be desktop-first ERP workbench style. Customer/public pages must be mobile-first touch UI.
- **Single Admin / Solopreneur**: Provide direct, unified control over all modules without artificial organizational barriers.
- **Never Duplicate Routes**: Check existing routes in `frontend/src/config/admin-route-registry.ts` before scaffolding new pages.
- **Real Database Integrity**: Never write destructive scripts or suggest commands like `flush` or dropping databases. Zero cosmetic test data.

## Verification Commands
- Frontend typecheck: `npm --prefix frontend run typecheck`
- Route check: `npm --prefix frontend run check:routes`
- Backend check: `backend/venv/bin/python backend/manage.py check`
- Backend migrations dry-run: `backend/venv/bin/python backend/manage.py makemigrations --check --dry-run`
- Scoped tests: `backend/venv/bin/python backend/manage.py test <target>`
