# Business Setup Runbook

## Purpose

This module configures the operational business masters used before go-live:

- Business Profile: legal and identity data for the business
- Branch: operating location master
- Finance Account: operational money account master used to classify cash, bank, and UPI collection destinations
- Cash Desk: branch-level collection counter or terminal
- Staff Operational Assignment: sidecar operational setup for internal users
- Chart Account: accounting classification head, separate from operational money accounts

## FinanceAccount vs ChartAccount

FinanceAccount is the operational collection account master. It tells the system which real-world money destination is being used, such as cash in hand, bank account, or UPI handle.

ChartAccount is the accounting classification master. It groups balances and reporting heads such as cash, bank, revenue, commission, waiver, and expense. It is not a receipt collection endpoint.

## First live setup order

1. Create or update the Business Profile.
2. Create the active head office branch.
3. Create active finance accounts for:
   - cash
   - at least one bank or UPI account
4. Create the active cash desk for the operating branch.
5. Create staff operational assignments for admin and cashier operators.
6. Create the minimum chart of accounts classification heads.
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
