# Selected Restore / Import Workflow

1. Choose existing backup job.
2. Run restore preview first.
3. Review warnings/blockers and selected scope row estimates.
4. Execute restore with typed confirmation phrase.
5. Verify restore job status and audit trail.

Safety:
- Arbitrary SQL uploads are forbidden from web UI.
- Full raw PostgreSQL dump restore is CLI-only.

## Admin Restore Checklist: Setup Snapshot
- When to use: local/dev/test setup recovery, localhost regression prep, setup master rehydration.
- When not to use: full production rollback, transactional data recovery, financial history restoration.
- Includes: business profile, tax profile, COA, finance accounts, mappings/posting profiles, branch/counter, warehouse/stock location, product categories, product tax readiness.
- Excludes: customers, partners, subscriptions, EMI/payments, direct sales, purchase bills, rent/lease contracts, invoices/receipts, commissions/payouts, audit logs, stock movements.
- Checklist: preview PASS/WARNING/BLOCKED rows, transactional excluded, preserved admin verified, local-safety verified, dry-run completed.
- Confirmation phrase: RESTORE SETUP SNAPSHOT.
- Localhost workflow: preview -> resolve blockers -> exact confirmation -> execute -> run readiness check.
- Production warning: setup snapshot restore is disabled in production-like environments by default.

