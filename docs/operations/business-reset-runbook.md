# Business Reset Runbook (Controlled Go‑Live Reset)

This runbook describes the supported way to delete SUBIDHA CORE business data while preserving only the required admin login.

This is **not** a raw `dropdb/flush/truncate` shortcut. It is a controlled reset path that:
- keeps Django framework tables required to boot the app
- preserves a configured admin allowlist
- can clear auth artifacts (sessions/JWT token tables) explicitly
- provides an auditable reset plan preview (model list + row counts)

## Primary constraint (this project)

For first-run go-live in this repository, the only admin user that must survive is:
- `username: subidhafurniture`

You may preserve a different admin username in other environments, but **this repo’s default go-live instruction assumes `subidhafurniture` is the preserved admin**.

## What is preserved

Always preserved:
- Django framework tables required for boot (migrations, content types, etc.)
- the preserved admin user(s) you explicitly allowlist

Optional preservation:
- superusers (default behavior of the management command unless disabled)

## What is deleted

Deleted business domains (by app scope), including but not limited to:
- subscriptions (customers, batches, subscriptions, EMIs, payments, waivers, draws, audits, etc.)
- accounting (chart/finance accounts, journals, periods, vendors, expenses, etc.)
- branch control (branches, counters, reporting inputs)
- billing (direct sales, invoices/receipts, billing sync tables)
- inventory (stock locations, inventory items, movements, adjustments)
- crm / service desk / reminders (if enabled in this deployment)
- non-preserved users (only if explicitly enabled)

Notes:
- the reset prints the model list and row counts so you can verify the exact scope before execution.

## Option A: Management command (recommended for operators)

1) Preview the plan (no deletion):

`venv/bin/python backend/manage.py reset_business_data --plan-only --keep-usernames subidhafurniture --no-preserve-superusers --delete-non-kept-users --clear-auth-artifacts`

2) Execute (requires confirmation string):

`venv/bin/python backend/manage.py reset_business_data --keep-usernames subidhafurniture --no-preserve-superusers --delete-non-kept-users --clear-auth-artifacts --confirm RESET_SUBIDHA_CORE`

Behavior notes:
- `--no-preserve-superusers` is required if you truly want **only** `subidhafurniture` to survive
- `--delete-non-kept-users` removes all other users (customers/partners/cashiers/admins)
- `--clear-auth-artifacts` clears sessions and JWT blacklist/outstanding token tables (if installed)
- `--confirm RESET_SUBIDHA_CORE` is required to actually delete data

## Option B: Admin UI (controlled)

Routes:
- Checklist + reset panel: `/admin/settings/business-setup/checklist`

Rules:
- only the preserved username may execute the reset (prevents deleting the login you want to keep)
- dry-run is supported and should be used before executing

## Operational cautions

- Run during an off-hours window.
- Export anything you need before reset (reports, invoices, audit snapshots).
- Confirm that `subidhafurniture` can log in successfully before executing.
- After reset, complete the first-run setup flow before starting live collections:
  - `docs/operations/first-run-business-setup.md`

