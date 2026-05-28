# Collection Control Center

Branch: `update`

Status: **Phase 7D implemented**

## Purpose

The Collection Control Center gives admin and cashier users a read-only operational view of collection readiness before they use the existing payment collection workflows.

It centralizes:

- EMI due posture
- direct-sale outstanding posture
- rent/lease demand visibility
- finance account collection readiness
- blocked finance account reasons
- recent collection visibility
- receipt/reconciliation posture where backend data is available
- route hints to existing safe collection workflows

## Frontend routes

```text
/admin/collections/control-center
/cashier/collections/control-center
```

## API routes

```text
GET /api/v1/admin/collections/control-center/
GET /api/v1/cashier/collections/control-center/
```

Both endpoints are read-only.

## Role behavior

### Admin

Admin can see all collection readiness data and receives a real setup link when finance accounts are blocked:

```text
/admin/accounting/setup
```

Admin collection lanes navigate only to existing collection routes:

```text
/admin/finance/collect?workflow=advance-emi
/admin/finance/collect?workflow=direct-sale
/admin/payments
```

### Cashier

Cashier receives a cashier-safe payload scoped by branch where branch scoping applies.

Cashier sees blocker explanations but does not receive an accounting setup edit route. The cashier UI displays operational guidance:

```text
Ask admin to fix accounting setup
```

Cashier collection lanes navigate only to existing cashier collection routes:

```text
/cashier/collect
/cashier/collect?workflow=direct-sale
/cashier/payments
```

### Customer / partner / vendor

These roles do not receive collection control-center routes or navigation exposure.

## Backend behavior

The control-center service reads existing operational data and returns a summary payload.

It reports:

- `due_today_count`
- `overdue_count`
- `pending_emi_count`
- `pending_emi_amount`
- `direct_sale_outstanding_count`
- `direct_sale_outstanding_amount`
- `rent_lease_due_count`
- `rent_lease_due_amount`
- `blocked_finance_account_count`
- `ready_finance_account_count`
- finance account readiness rows
- collection lanes
- route hints
- recent subscription payment rows

Receipt and reconciliation values remain nullable when no authoritative backend value is exposed:

```text
pending_receipt_count = null
unreconciled_collection_count = null
```

The UI displays these as `Not exposed` instead of inventing values.

## Finance account readiness behavior

Finance account readiness uses the existing finance-account readiness service.

A finance account is collection-ready only when:

- the finance account is active
- the finance account kind is valid for collection
- a chart account is mapped
- the chart account is active
- the chart account is an asset account
- the chart account allows manual posting
- the chart account is a leaf/posting account, not a group/control account

Blocked finance accounts remain visible for diagnosis. The UI shows the specific blocker, for example:

```text
This account cannot receive payments because it is mapped to a non-posting Chart of Account.
```

The control center does not silently remap accounts.

## Collection lanes

| Lane | Status | Behavior |
|---|---|---|
| Advance EMI collection | Enabled | Navigates to the existing EMI collection page. |
| Direct-sale collection | Enabled | Navigates to the existing direct-sale collection workflow. |
| Rent/lease collection | Deferred | Shows demand visibility but no fake collection action. |
| Customer advance | Enabled only through existing page context | Navigates to existing collection page; no new posting endpoint is introduced. |

## Read-only rule

The control-center endpoints do not:

- post payment
- create receipts
- create journal entries
- create reconciliation records
- create settlement records
- day-close records
- create direct-sale collections
- create EMI collections
- collect rent/lease demands
- collect deposits
- mutate subscriptions, EMIs, demands, invoices, inventory, delivery, commission, payout, lucky draw, Lucky ID, batch, amendment, or recontract records

All money-changing actions remain in existing approved collection endpoints.

## Existing data impact

No migration is required.

No existing business records are changed by the control-center read endpoints.

## Financial integrity impact

Financial integrity is preserved.

The control center does not weaken finance account posting-readiness validation. It only displays readiness and route hints. Collection continues through existing backend services that enforce payment and finance account validation.

## Auditability impact

Auditability improves by making collection readiness and finance-account blockers visible before payment collection. The control center itself creates no audit records because it performs no mutation.

## Daily shop usability impact

Admin and cashier users can inspect collection readiness, blocked accounts, receivable lane posture, and recent payments from one page before collecting money.

Cashiers receive actionable blocker explanations without being exposed to accounting setup edit controls.

## Future rent/lease compatibility

Rent/lease demand counts and outstanding amounts are visible in the summary.

The rent/lease collection lane remains deferred until a confirmed approved collection endpoint is available. This keeps the future rent/lease workflow compatible without inventing fake actions or bypassing controls.

## Validation commands

Backend, because backend files changed:

```bash
cd backend
../.venv/bin/python manage.py makemigrations --check --dry-run
../.venv/bin/python manage.py check
../.venv/bin/python manage.py test tests.api.test_collection_control_center -v 2
../.venv/bin/python manage.py test tests.accounting.test_finance_account_collection_guard -v 2
../.venv/bin/python manage.py test tests.api.test_accounting_setup_health_defaults_api -v 2
```

Frontend:

```bash
cd frontend
npm run typecheck
npm run lint
npm run build
npm run check:routes
npx playwright test tests/e2e/collection_control_center.spec.ts --project=chromium-smoke --timeout=180000
```

Do not run:

```bash
bash scripts/run-release-candidate.sh
```
