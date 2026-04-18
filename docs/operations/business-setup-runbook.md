# Business Setup Runbook

## Purpose

This runbook describes the minimal operational setup required before go-live, using the **existing** core modules in SUBIDHA CORE plus the additive Business Profile.

Canonical reference:
- `docs/operations/first-run-business-setup.md`

This setup should be completed from:
- `/admin/settings/business-setup` (guided links + checklist)
- existing modules:
  - Branch Control (`/admin/branches`, `/admin/counters`)
  - Accounting (`/admin/accounting/chart-of-accounts`, `/admin/accounting/periods`)
  - Products (`/admin/products`)
  - Internal users (`/admin/settings/users`)

## FinanceAccount vs ChartAccount

Finance accounts are the operational collection endpoints (cash/bank/UPI) used by counters and billing.

Chart of accounts is the accounting classification tree used for controlled posting and reporting. It is not a collection endpoint.

## First live setup order

1. Create or update the Business Profile.
2. Create at least one active branch and mark one as primary.
3. Create at least one active counter mapped to a finance account.
4. Create active finance accounts for:
   - cash
   - at least one bank or UPI account
5. Create chart accounts as needed for accounting setup.
6. Add at least one product.
7. Review the checklist screen and confirm go-live readiness.

## Safe data practices

Never store these in repo source, fixtures, migrations, or frontend defaults:

- real bank account numbers
- full UPI credentials beyond business-approved masked identifiers
- production passwords
- API keys
- secret banking credentials
- private settlement credentials

Use environment variables or direct admin entry for secret or live credentials.
