# Collection Control Center

Branch: `update`

Status: **Operator-proof finance account readiness integrated**

## Purpose

The Collection Control Center gives admin and cashier users a read-only operational view of collection readiness before they use existing payment collection workflows.

It centralizes:

- EMI due posture
- direct-sale outstanding posture
- rent/lease demand visibility
- operational finance account collection readiness
- diagnostic/system posting profile visibility
- blocked finance account reasons
- recent collection visibility
- receipt/reconciliation posture where backend data is available
- route hints to existing safe collection workflows

Inline readiness banners reuse the same read-only payload inside:

```text
/admin/finance/collect
/cashier/collect
```

The inline banner is visibility-only. It does not post money, create receipts, create journals, create reconciliation records, or alter collection form behavior.

## Frontend routes

```text
/admin/collections/control-center
/cashier/collections/control-center
/admin/finance/collect
/cashier/collect
```

## API routes

```text
GET /api/v1/admin/collections/control-center/
GET /api/v1/cashier/collections/control-center/
```

Both endpoints are read-only and are reused by the full control-center pages and the compact inline banners.

## Finance account readiness separation

The control-center payload separates:

```text
operational_collection_accounts
diagnostic_system_accounts
```

### Operational collection accounts

Operational collection accounts are real money destinations:

```text
cash desks
bank accounts
UPI accounts
payment gateway settlement accounts
```

These are eligible for collection selectors only when:

- finance account is active
- finance account is not diagnostic-only
- mapped COA exists
- mapped COA is active
- mapped COA allows manual posting
- mapped COA is a leaf/non-control account
- mapped COA account type is `ASSET`
- finance account kind is compatible with the collection method

Blocked copy:

```text
Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account.
```

### Diagnostic system posting profiles

System posting profile rows are not money destinations.

```text
Ledger posting profiles (system)
```

These must remain:

```text
diagnostic_only = true
system_posting_profile = true
operational_collection_account = false
collection_ready = false
selectable_for_collection = false
```

Operator copy:

```text
System posting profile diagnostic only; not a customer collection destination.
```

The control center may display diagnostic rows in a separate diagnostic section, but existing collection selectors must never include them as selectable accounts.

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

The inline admin banner shows:

- ready/selectable finance account count
- blocked operational account count
- overdue EMI count
- pending EMI amount
- direct-sale outstanding amount
- rent/lease due amount
- nullable receipt/reconciliation posture as `Not exposed`
- top operational finance account blockers and recommended action
- link to full control center
- link to accounting setup when exposed by the backend payload

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

These roles do not receive collection control-center routes, inline collection readiness banners, or navigation exposure.

## Unknown metrics

Receipt and reconciliation values remain nullable when no authoritative backend value is exposed:

```text
pending_receipt_count = null
unreconciled_collection_count = null
```

The UI displays these as:

```text
Not exposed
```

It must not render unknown values as `₹0.00` or infer fake counts.

## Collection lanes

| Lane | Status | Behavior |
|---|---|---|
| Advance EMI collection | Enabled | Navigates to the existing EMI collection page. |
| Direct-sale collection | Enabled | Navigates to the existing direct-sale collection workflow. |
| Rent/lease collection | Deferred | Shows demand visibility but no fake collection action. |
| Customer advance | Enabled only through existing page context | Navigates to existing collection page; no new posting endpoint is introduced. |

## Read-only rule

The control-center endpoints and inline banners do not:

- post payment
- create receipts
- create journal entries
- create reconciliation records
- create settlement records
- create day-close records
- create direct-sale collections
- create EMI collections
- collect rent/lease demands
- collect deposits
- mutate subscriptions, EMIs, demands, invoices, inventory, delivery, commission, payout, lucky draw, Lucky ID, batch, amendment, or recontract records
- remap finance accounts
- bypass finance-account posting readiness

All money-changing actions remain in existing approved collection endpoints.

## Existing data impact

No migration is required.

No existing business records are changed by the control-center read endpoints or inline readiness banners.

## Financial integrity impact

Financial integrity is preserved.

The control center and inline banners do not weaken finance account posting-readiness validation. They only display readiness and route hints. Collection continues through existing backend services that enforce payment and finance account validation.

## Auditability impact

Auditability improves by making collection readiness and finance-account blockers visible before payment collection. The control center itself and inline banners create no audit records because they perform no mutation.

## Daily shop usability impact

Admin and cashier users can inspect collection readiness, blocked accounts, receivable lane posture, and recent payments from one page before collecting money.

Cashiers receive actionable blocker explanations without being exposed to accounting setup edit controls.

## Future rent/lease compatibility

Rent/lease demand counts and outstanding amounts are visible in the summary.

The rent/lease collection lane remains deferred until a confirmed approved collection endpoint is available. The inline readiness banner shows rent/lease due posture but does not add a fake rent/lease collection action.

This keeps the future rent/lease workflow compatible without inventing fake actions or bypassing controls.

## Validation commands

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
