# P4D — Accounting Period Close Cockpit

## Overview

The Accounting Period Close Cockpit is a **read-only** admin diagnostic surface that aggregates all period-close readiness signals into a single view. It is the first thing an admin should consult before attempting to close or lock an accounting period.

The cockpit never mutates any financial record. It reads from:

| Source | Purpose |
|--------|---------|
| P2C month-end close service | Blocking/warning checks on cash sessions, exceptions, journals, reconciliation |
| P4A financial intelligence service | Bridge, billing, collection, and reconciliation posture |
| P4B trial balance check service | Debit/credit balance integrity, draft journals, line integrity |
| P4C liability reconciliation service | Customer advance and security deposit posture |
| `AccountingPeriod` model | Lock/close state of the period |

---

## Cockpit Sections

### `month_end` (P2C)

Reports the P2C month-end readiness snapshot: whether all BLOCKING checks pass (daily closes complete, no critical exceptions, no draft manual journals, bridge postings ready, etc.).

- Status is **CRITICAL** if any BLOCKING check has failed.
- Status is **WARNING** if WARNING checks failed.
- Status is **OK** if all checks passed.

### `financial_intelligence` (P4A)

Reports the overall P4A financial intelligence snapshot status. This covers bridge posting posture, billing posture, reconciliation posture, and control close posture.

- Status mirrors `build_financial_intelligence_snapshot().overall_status`.

### `trial_balance` (P4B)

Reports whether the period's trial balance is balanced (debits == credits across all POSTED journal entry lines), and counts draft journals, posted-no-lines journals, and both-sides-nonzero lines.

- Status is **CRITICAL** if unbalanced or if integrity checks failed.
- Status is **WARNING** if draft journals exist.

### `liability_reconciliation` (P4C)

Reports the P4C customer advance and security deposit reconciliation posture.

- Status mirrors `build_liability_reconciliation_snapshot().overall_status`.
- Status is **CRITICAL** for unreconciled liability gaps above tolerance.

### `period_lock`

Reports the `AccountingPeriod` lock/close state for the requested month:

- `period_exists`: whether an AccountingPeriod record covers this month
- `status`: OPEN / LOCKED / CLOSED
- `is_locked`, `is_closed`
- `lock_allowed`: True only if period exists and is OPEN
- `existing_lock_endpoint`: the existing audited endpoint to trigger a lock

---

## `can_close` vs `can_lock`

| Field | Meaning |
|-------|---------|
| `can_close` | `True` if there are **no CRITICAL blockers**. This is a signal only — the cockpit never triggers close. |
| `can_lock` | `True` if there are no CRITICAL blockers **and** the AccountingPeriod exists and is currently OPEN. |

Neither field triggers any action automatically. They are readiness indicators only.

---

## What Blocks Close

The following conditions produce a **CRITICAL blocker** and set `can_close = false`:

| Condition | Blocker key |
|-----------|------------|
| Trial balance is unbalanced (debit ≠ credit) | `trial_balance.imbalance` |
| Trial balance has critical integrity checks (posted-no-lines, both-sides-nonzero, etc.) | `trial_balance.critical_checks` |
| P4C liability reconciliation overall status is CRITICAL | `liability_reconciliation.critical` |
| P2C month-end has BLOCKING check failures | `month_end.blocking_checks` |
| No AccountingPeriod record exists for this month | `period.missing` |

These are warnings (non-blocking):

| Condition | Warning key |
|-----------|------------|
| Draft journals in period | `trial_balance.draft_journals` |
| P4A financial intelligence status is WARNING or CRITICAL | `financial_intelligence.issues` |
| P4C liability reconciliation status is WARNING | `liability_reconciliation.warnings` |
| Period is already locked | `period.already_locked` |
| Period is already closed | `period.already_closed` |

---

## Why the Cockpit Is Read-Only

The cockpit is a governance surface, not an execution surface. Mixing read and write in a single panel creates execution risk — an admin reviewing close readiness should not accidentally trigger a close or lock.

Financial integrity of the accounting ledger requires that:

1. Close and lock are **explicit**, admin-triggered, audited actions.
2. No automation silently changes the period state based on cockpit checks.
3. Each check in the cockpit references a real endpoint or service — there are no fabricated indicators.

---

## How It Relates to P2C Month-End Close

P2C month-end close (`control/month-end-close/execute/`) is a **separate execution step** that:

- Runs 10 blocking/warning/info checks
- Persists results to `MonthEndCloseRun` and `MonthEndCloseCheckResult`
- Records an audit log entry
- Does **not** lock or close the `AccountingPeriod`

The close cockpit reads P2C readiness via `get_month_end_readiness()` (non-persisting) and surfaces the BLOCKING failures as critical blockers. It never calls `run_month_end_close()`. An admin must navigate to the month-end close page to execute that step.

---

## Why Accounting Period Lock Remains Explicit/Manual

The `AccountingPeriod.lock()` pathway (via `set_accounting_period_status`) has:

1. A select-for-update guard on the period row
2. An immutable status check (already-locked periods cannot be re-locked without explicit override)
3. A full audit trail via `log_audit` with event `ACCOUNTING_PERIOD_STATUS_CHANGED`

Automating this from the cockpit would bypass the admin's intent and audit trail. The existing lock endpoint is:

```
POST /api/v1/accounting/periods/{id}/lock/
```

This endpoint requires admin authentication, records the lock reason, and writes an audit log entry. The cockpit surfaces the endpoint URL in `period_lock.existing_lock_endpoint` so the admin can act explicitly after reviewing cockpit readiness.

---

## Deferred Items / Future Notes

| Item | Note |
|------|------|
| Opening balance automation | P4B currently reports opening balances as 0 with an INFO marker. Opening balance computation is deferred to P4B-OB-001. |
| Cockpit-triggered month-end execute | Not implemented. Execute must be done explicitly via P2C endpoint. |
| Auto-lock on cockpit pass | Not implemented. Lock remains explicit/manual via the existing audited endpoint. |
| Branch-scoped cockpit | P2C readiness supports branch filtering; the cockpit currently queries branch=None (all-branch). Branch scoping can be added by passing a branch param. |

---

## API

```
GET /api/v1/admin/accounting/close-cockpit/?year=N&month=N&as_of=YYYY-MM-DD
```

- Admin-only (`IsAuthenticated` + `IsAdmin`)
- All params optional; defaults to current month and today
- Returns the full cockpit payload (see `CloseCockpitPayload` type in frontend)
- No financial records are created or mutated

## Frontend

Route: `/admin/accounting/close-cockpit`

Accessible from: Accounting Reports directory → Period governance group → Close Cockpit.

The page shows:
- Year/month selector
- Overall status card with `can_close` / `can_lock` indicators
- Section status grid (month-end, financial intelligence, trial balance, liability reconciliation, period lock)
- Period state panel (period code, status, lock/close flags, existing lock endpoint reference)
- Blockers list
- Warnings list
- Action items list (sorted CRITICAL → WARNING → INFO)
- Quick navigation links to related pages

There are **no write buttons** on the cockpit page. Period lock is accessed via the "Manage Periods" link.
