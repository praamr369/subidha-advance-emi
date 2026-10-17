# MULTI_AGENT_COLLABORATION_GUIDE.md
# SUBIDHA CORE — Multi-Agent Engineering Architecture

This guide explains how **Claude, Antigravity (Gemini), Cursor, GitHub Copilot, OpenAI Codex, and n8n** coordinate seamlessly as a unified AI engineering team on the SUBIDHA CORE codebase.

---

## 1. Single Source of Truth ("Same Book") Architecture

Every AI assistant or agent that opens this repository reads the same canonical rules:

```
                          ┌─────────────────────────────────────┐
                          │         Canonical Rulebooks         │
                          │                                     │
                          │  • AGENTS.md                        │
                          │  • docs/SUBIDHA_CORE_PROJECT_...md │
                          │  • docs/AGENT_SYNC_LOG.md           │
                          └──────────────────┬──────────────────┘
                                             │
      ┌──────────────────┬───────────────────┼───────────────────┬──────────────────┐
      ▼                  ▼                   ▼                   ▼                  ▼
 [Antigravity/Gemini] [Claude]            [Cursor]            [Copilot / Codex]  [Windsurf]
   Reads: AGENTS.md    Reads: CLAUDE.md    Reads: .cursorrules Reads: .github/    Reads: .windsurfrules
                                           & .cursor/rules/*   copilot-instruct.
```

### Agent Configuration Files Mapping:
- **`AGENTS.md`**: Master specification for Antigravity, Gemini, and general agents.
- **`CLAUDE.md`**: Native entry point for Anthropic Claude Code, Desktop, and Cowork.
- **`.cursorrules` & `.cursor/rules/subidha-core.mdc`**: Native rules for Cursor Composer and Chat (auto-attached on all prompts with `globs: **/*`).
- **`.github/copilot-instructions.md`**: Native system prompt for GitHub Copilot & OpenAI Codex in VS Code and PR reviews.
- **`.windsurfrules`**: Native configuration for Codeium Windsurf Cascade.

---

## 2. Real-Time Inter-Agent Communication

When any agent modifies models, migrations, business invariants, or API routes, it broadcasts its changes:

### The Sync CLI (`scripts/agent_sync.py`)

```bash
# 1. Broadcast a change after completing work:
python scripts/agent_sync.py broadcast \
  --agent "Claude" \
  --type "schema" \
  --summary "Added warranty configuration to PIM products" \
  --details "Added warranty_enabled, warranty_months to PimProduct model with non-breaking defaults."

# 2. Check recent updates before starting a task:
python scripts/agent_sync.py status

# 3. View the full inter-agent history:
python scripts/agent_sync.py log
```

### What Happens on Broadcast:
1. **Append-Only Markdown Ledger**:
   - Updates [`docs/AGENT_SYNC_LOG.md`](file:///home/pradip-roy/Development/subidha-advance-emi/docs/AGENT_SYNC_LOG.md) with timestamp, agent name, git commit hash, and summary.
2. **n8n Webhook Dispatch**:
   - Posts payload to `https://subidhafurnitureasansol.com/n8n/webhook/agent-sync` (hosted on Hostinger VPS).
   - n8n receives the event, triggers alerts (e.g. Telegram / Discord), and records the sync state.
3. **Git Commit Alignment**:
   - Every entry is pinned to the active `git` commit hash and branch.

---

## 3. Core Business Invariants Enforced Across All Agents

Regardless of which AI agent is active, all agents strictly obey these non-negotiables:

1. **Financial Ledger Invariance**:
   - EMI records and settled payments are append-only; never destructively edit or delete.
   - Prefer reversal and adjustment entries over in-place mutation.
2. **Solopreneur Desktop Admin Rule**:
   - Admin UI (`/admin/*`) is desktop-first ERP workbench style (dense tables, command bar, right drawer).
   - Non-admin UI is mobile-first (large touch targets, cards, bottom nav).
3. **No Duplicate Admin Routes**:
   - Always check `frontend/src/config/admin-route-registry.ts` before scaffolding new routes.
   - When consolidating existing duplicate routes, perform **additive tab merge only** — never delete working pages.
4. **Safe Dev Database**:
   - Real PostgreSQL dev data (`subidha_core`) is precious. Never run destructive wipe scripts (`flush`, `clear_operational_data.py`).
   - Zero cosmetic test data (breaks financial KPIs and accounting reconciliation).

---

## 4. Verification Gates Before Any Agent Commits

Before any agent claims a task is complete, it must run the scoped verification gates:

- **Frontend**:
  ```bash
  cd frontend && npm run typecheck && npm run check:routes
  ```
- **Backend**:
  ```bash
  backend/venv/bin/python backend/manage.py check
  backend/venv/bin/python backend/manage.py makemigrations --check --dry-run
  backend/venv/bin/python backend/manage.py test <target.app>
  ```
