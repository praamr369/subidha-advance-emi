# P4 Finance Release Candidate Hardening

## Scope

P4 finance intelligence is an admin-only, read-only diagnostic and export layer. It does not post journals, create accounting bridge postings, reconcile records, lock periods, collect payments, alter EMI schedules, or mutate source financial records.

## Operator pages and endpoints

| Page | Endpoint |
|---|---|
| `/admin/accounting/financial-intelligence` | `GET /api/v1/admin/financial-intelligence/` |
| `/admin/accounting/trial-balance-check` | `GET /api/v1/admin/financial-intelligence/trial-balance/` |
| `/admin/accounting/liability-reconciliation` | `GET /api/v1/admin/financial-intelligence/liability-reconciliation/` |
| `/admin/accounting/close-cockpit` | `GET /api/v1/admin/accounting/close-cockpit/?year=N&month=N` |
| `/admin/accounting/exports` | `GET /api/v1/admin/accounting/exports/` and its six report endpoints |

Export report endpoints are:

- `trial-balance/`
- `journals/`
- `ledgers/`
- `receivables/`
- `liabilities/`
- `bridge-audit/`

All are beneath `/api/v1/admin/accounting/exports/`. JSON is the default. CSV uses `export_format=csv`. Unsupported formats return HTTP 400.

## Month-end operator workflow

1. Select the target year, month, and as-of date in Financial Intelligence.
2. Review CRITICAL items first, then WARNING, then INFO/deferred items.
3. Review Trial Balance Check. Confirm debit equals credit and investigate draft journals. Opening balances remain deferred and must not be treated as historical opening truth.
4. Review Liability Reconciliation. Compare source liabilities and bridge coverage. A null posted GL liability is an explicit deferred INFO state, not zero.
5. Open the Close Cockpit. Resolve every blocker and review every warning.
6. If the cockpit reports that locking is allowed, use the existing Accounting Periods workflow. The cockpit itself never locks or closes a period.
7. Re-run all views after operational corrections are completed through their canonical workflows.

## Accountant export workflow

1. Open `/admin/accounting/exports`.
2. Select the period and as-of date.
3. Use **View JSON** for an on-screen row/totals check.
4. Use **Download CSV** for manual accountant review or controlled import preparation.
5. Verify the period, warnings, row count, truncation state, and totals before handing off the file.

There is no Tally, Zoho, or other external accounting synchronization in P4-RC.

## Deferred behavior

- Historical opening-balance automation is deferred.
- Posted general-ledger comparison for customer-advance and security-deposit liabilities may be deferred and is shown as INFO.
- Export endpoints prepare JSON/CSV only; they do not submit data externally.
- Diagnostic gaps are never auto-fixed.

## Production validation checklist

- [ ] `python manage.py check`
- [ ] `python manage.py makemigrations --check --dry-run`
- [ ] Accounting, reconciliation, billing, and subscription test suites pass.
- [ ] All eleven P4 endpoints return HTTP 200 for an admin.
- [ ] All P4 endpoints reject cashier, customer, partner, and unauthenticated access.
- [ ] Combined P4 endpoint calls leave financial model counts unchanged.
- [ ] `npm run check:routes`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build:smoke`
- [ ] Desktop and 390px Playwright/manual render checks pass without console or framework errors.
- [ ] Empty, seeded, deferred, WARNING, CRITICAL, INFO, and OK states render.
- [ ] Every CSV download uses a GET request to a real P4E endpoint.
- [ ] No external-sync, posting, reconciliation, payment, period-lock, or other mutation control appears on the P4 pages.
- [ ] `bash scripts/run-release-candidate.sh`

## Seeded smoke posture

The deterministic test posture should contain a balanced posted journal, a draft journal warning, an accounting period, and available customer-advance, rent/lease-deposit, bridge, and month-end blocker fixtures where existing factories support them. Test fixtures may create these records inside isolated test databases only. No management command automatically seeds production data.

## Rollback

P4-RC hardening is additive and contains no migration. Rollback consists of reverting the frontend guards, integration tests, and this runbook. No financial data rollback or ledger repair is required because the P4 paths are read-only.

If a deployment check fails, keep the prior frontend/backend release active, retain generated logs/screenshots outside production data storage, and do not attempt to repair accounting gaps through P4 endpoints.

## Known safe test constraints

- Browser validation uses Playwright because the Browser plugin is not available in this environment.
- CSV download is validated as an authenticated GET request and response path; external accountant software import is outside P4-RC.
