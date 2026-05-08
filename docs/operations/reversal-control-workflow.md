# Reversal Control Workflow

- Reversal control now supports full case management under `/admin/finance/reversal-control`.
- Cases can be opened manually, synced from source documents, reconciled, assigned, noted, closed, and archived through audited admin endpoints.
- Close is blocked when checklist items are still `REQUIRED` or `BLOCKED` unless an explicit override reason is supplied.
- Sync/reconcile only update case metadata, checklist state, and document links; they do not mutate financial posting history.
