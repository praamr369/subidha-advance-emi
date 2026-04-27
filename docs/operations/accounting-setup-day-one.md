# Accounting Setup Day-One Runbook

## Objective

Complete finance-account and chart-account setup before first live collections, while keeping cashier workflows simple.

## Steps

1. Open `/admin/accounting/setup`.
2. Verify setup cards:
   - COA ready
   - Finance accounts ready
   - Mappings complete
   - Warnings count
3. Click **Apply Recommended Mapping**.
4. Review warning list and resolve each warning.
5. Use **Advanced Edit** only for accountant/agency adjustments.
6. Re-check status until setup shows **READY**.

## Command-line fallback

- Dry run:
  - `python manage.py bootstrap_accounting_setup --dry-run`
- Apply:
  - `python manage.py bootstrap_accounting_setup`

## Admin API checklist

- `GET /api/v1/admin/accounting/setup/status/`
- `POST /api/v1/admin/accounting/setup/bootstrap/`
- `GET /api/v1/admin/accounting/finance-account-mappings/`
- `POST /api/v1/admin/accounting/finance-account-mappings/`
- `PATCH /api/v1/admin/accounting/finance-account-mappings/{id}/`
- `GET /api/v1/admin/accounting/mapping-suggestions/`

## Operational guardrails

- Do not change EMI, payment, reconciliation, rent/lease billing, direct sale, commission, payout, waiver, or inventory business logic during setup.
- Use additive mapping updates only.
- Treat warnings as go-live blockers for accounting readiness.
# Accounting Setup Day-One Runbook

## 1) Dry-run first

Run:

`python manage.py bootstrap_accounting_setup --dry-run`

Confirm expected default COA, finance account, and mapping suggestions.

## 2) Apply bootstrap

Run:

`python manage.py bootstrap_accounting_setup`

This is idempotent and additive.

## 3) Review admin setup UI

Open:

`/admin/accounting/setup`

Check:

- setup status is `READY` or actionable warnings are visible
- mapping table shows business labels and mapped ledger names
- warnings are reviewed and resolved

## 4) Validate control center health

Open:

- `/admin/accounting/control-center`
- `/admin/operations/command-center`

Ensure setup health and queue signals are visible for admin operations.

## 5) Audit expectations

Audit events must exist for:

- mapping created/updated
- bootstrap executed
- warning-resolving changes
