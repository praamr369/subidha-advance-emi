# Reversal Reconciliation Workflow

- Reconciliation queue endpoint is available at `/api/v1/admin/finance/reversal-reconciliation/`.
- Response includes summary counts and rows that are not fully reconciled.
- Reconciliation actions run checklist evaluation and update `reconciliation_status` (`BLOCKED`, `READY`, `RECONCILED`) without posting new accounting entries.
- Operators should run sync first, then reconcile, then close/archive when no critical blockers remain.
