# Go-Live Reset Runbook

Canonical reference:
- `docs/operations/business-reset-runbook.md`

## Purpose

Provide a controlled reset path that removes business data while preserving only the chosen admin login.

## Safe usage rule

Use reset preview first. Review:

- core business counts (customers/subscriptions/payments)
- accounting / branch control / inventory counts

Then execute using:
- the management command `reset_business_data`, or
- the admin UI reset panel (`/admin/settings/business-setup/checklist`)

## Why this is conservative

The existing project already contains financially sensitive entities such as subscriptions, EMI rows, payments, ledger entries, draws, commissions, and audit logs. This pass intentionally keeps reset behavior conservative to avoid accidental loss of configuration or referential breaks.

## Recommended process

1. Review reset preview in admin.
2. Export or note the current setup masters.
3. Use existing transactional reset tooling only with explicit confirmation.
4. Re-validate the business setup checklist before re-opening live operations.
