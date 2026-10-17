# STRICT_GUARDRAILS.md
# SUBIDHA CORE — Strict AI Agent Guardrails & Invariants

> **MANDATORY POLICY FOR ALL AI AGENTS (Antigravity, Gemini, Claude, Cursor, GitHub Copilot, Codex, Windsurf)**
> These guardrails are active across the entire repository. Violating any of these rules is strictly forbidden.

---

## 1. Don't Execute Anything Without Explicit Permission
- **NO Autonomous System Actions**: Never run commands that start background daemons, alter system-level configurations, reboot servers, or deploy to production without the user's explicit prior consent.
- **Explain First**: Before proposing or executing commands, explain the exact command, why it is needed, and wait for confirmation if the action modifies system state.

## 2. No Autonomous Git/GitHub Commands
- **NO Autonomous Push or Commit**: AI agents must NEVER execute `git push`, `git commit`, `git reset`, `git rebase`, `git clean`, or GitHub CLI commands (`gh pr create`, etc.) automatically.
- **User Review Required**: All code changes must be presented to the user for review. Only commit or push when the user explicitly instructs to do so.
- **Git Push Gate**: Pre-push hooks block automated remote pushes unless explicitly authorized.

## 3. No Direct Database Mutation & Never Use DELETE
- **NO Raw SQL Mutations**: Never execute raw `DELETE`, `DROP`, `TRUNCATE`, or `ALTER TABLE` queries outside of standard Django migrations.
- **NEVER Delete on Database**: The financial and business ledger is append-only. Settled payments, EMI records, journal entries, and customer audit histories must NEVER be deleted.
- **Reversal Over Deletion**: Always use reversing transactions, credit notes, or status transitions instead of destructive deletions.
- **NO Wipe Scripts**: Never run `flush`, `migrate zero`, `clear_operational_data.py`, or drop databases on the development database (`subidha_core`).

## 4. Nothing Deleted Without Explicit Permission
- **NO File Deletions**: Never delete any file, component, service, route, or test using `rm`, `git rm`, or filesystem unlinks without explicit user request.
- **Additive Merges Only**: When consolidating duplicate admin pages, NEVER delete the existing route or workflow. Always embed duplicate workflows as tabs under the canonical page so zero functionality is lost.
- **Preserve Documentation**: Never delete comments, docstrings, or architectural records.

## 5. Nothing Added Without Explicit Permission
- **NO Arbitrary Additions**: Never add unrequested third-party npm packages, Python libraries, microservices, or new route hierarchies without explicit approval.
- **Minimal Diffs**: Keep changes focused strictly on what the user requested. Prefer additive improvements to existing files over creating new files.
- **Document New Files**: If creating a new file is required, its necessity and location must be documented.

---

## Enforcement Hooks
These guardrails are enforced at three layers:
1. **Agent Prompts**: Configured in `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/rules/subidha-core.mdc`, and `.github/copilot-instructions.md`.
2. **Git Pre-Commit Hook** (`.githooks/pre-commit`): Blocks destructive SQL, forbidden database operations, and unauthorized file removals.
3. **Git Pre-Push Hook** (`.githooks/pre-push`): Blocks autonomous pushes without explicit user authorization flag (`ALLOW_GIT_PUSH=true`).

