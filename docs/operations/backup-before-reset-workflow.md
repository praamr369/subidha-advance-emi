# Backup Before Reset Workflow

1. Open Admin Settings -> Business Setup -> Reset / Backup / Restore.
2. Select scopes.
3. Run reset preview and resolve blockers.
4. Create backup job (`SELECTED_SCOPES_EXPORT` or `FULL_DATABASE_LOGICAL` metadata job).
5. Verify job status `COMPLETED` and checksum.
6. Run reset with typed confirmation phrase.

Notes:
- Backup files are stored in backend private storage, not frontend public assets.
- Backup files must not be committed to Git.

## Admin Restore Checklist: Setup Snapshot
- When to use: local/dev/test setup recovery, localhost regression prep, setup master rehydration.
- When not to use: full production rollback, transactional data recovery, financial history restoration.
- Includes: business profile, tax profile, COA, finance accounts, mappings/posting profiles, branch/counter, warehouse/stock location, product categories, product tax readiness.
- Excludes: customers, partners, subscriptions, EMI/payments, direct sales, purchase bills, rent/lease contracts, invoices/receipts, commissions/payouts, audit logs, stock movements.
- Checklist: preview PASS/WARNING/BLOCKED rows, transactional excluded, preserved admin verified, local-safety verified, dry-run completed.
- Confirmation phrase: RESTORE SETUP SNAPSHOT.
- Localhost workflow: preview -> resolve blockers -> exact confirmation -> execute -> run readiness check.
- Production warning: setup snapshot restore is disabled in production-like environments by default.

