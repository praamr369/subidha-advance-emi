# Database Backup / Restore Runbook

## App-level backup packages
- Created via admin backend endpoint.
- Stored under backend private backup directory.
- Protected by admin-only endpoints.

## PostgreSQL full backup (server CLI)
- Backup:
```bash
pg_dump -Fc -h <host> -U <user> -d <db_name> > subidha-full-$(date +%F-%H%M).dump
```
- Restore:
```bash
pg_restore -c -h <host> -U <user> -d <db_name> subidha-full-YYYY-MM-DD-HHMM.dump
```

Why UI restore forbids raw SQL:
- Prevents arbitrary SQL execution risk.
- Enforces auditable, scoped, typed-confirmation workflows.
- Preserves admin account safety controls.

## Admin Restore Checklist: Setup Snapshot
- When to use: local/dev/test setup recovery, localhost regression prep, setup master rehydration.
- When not to use: full production rollback, transactional data recovery, financial history restoration.
- Includes: business profile, tax profile, COA, finance accounts, mappings/posting profiles, branch/counter, warehouse/stock location, product categories, product tax readiness.
- Excludes: customers, partners, subscriptions, EMI/payments, direct sales, purchase bills, rent/lease contracts, invoices/receipts, commissions/payouts, audit logs, stock movements.
- Checklist: preview PASS/WARNING/BLOCKED rows, transactional excluded, preserved admin verified, local-safety verified, dry-run completed.
- Confirmation phrase: RESTORE SETUP SNAPSHOT.
- Localhost workflow: preview -> resolve blockers -> exact confirmation -> execute -> run readiness check.
- Production warning: setup snapshot restore is disabled in production-like environments by default.

