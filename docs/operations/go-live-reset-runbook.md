# Go-Live Reset Runbook

## Current boundary

The new business setup module includes a read-only reset preview surface. It reports counts for business setup masters without changing data.

This pass does not change the behavior of the existing `reset_business_data` command.

## Safe usage rule

Use reset preview first. Review:

- business profiles
- branches
- finance accounts
- cash desks
- staff operational assignments

Do not assume that resetting transactional data should also delete finance setup masters.

## Why this is conservative

The existing project already contains financially sensitive entities such as subscriptions, EMI rows, payments, ledger entries, draws, commissions, and audit logs. This pass intentionally keeps reset behavior conservative to avoid accidental loss of configuration or referential breaks.

## Recommended process

1. Review reset preview in admin.
2. Export or note the current setup masters.
3. Use existing transactional reset tooling only with explicit confirmation.
4. Re-validate the business setup checklist before re-opening live operations.
