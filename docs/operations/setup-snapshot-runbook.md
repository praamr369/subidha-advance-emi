# Setup Snapshot Runbook

## What is exported
Setup/master data only:
- Business profile
- Business tax profile
- COA
- Finance accounts
- Mapping/posting profiles
- Branch/counter
- Warehouse/stock location
- Product category masters
- Product tax profile setup rows

## What is excluded
Transactional data:
- Customers/subscriptions/EMIs/payments
- Direct sales/purchase bills
- Rent/lease contracts
- Invoices/receipts
- Commissions/payout batches
- Audit logs
- Stock movements

## Commands
- Export:
`../.venv/bin/python manage.py export_setup_snapshot --output ../local_setup_snapshot.json`
- Import dry-run:
`../.venv/bin/python manage.py import_setup_snapshot --input ../local_setup_snapshot.json --dry-run`
- Import apply:
`../.venv/bin/python manage.py import_setup_snapshot --input ../local_setup_snapshot.json --confirm`
- Seed:
`../.venv/bin/python manage.py seed_local_sandbox --confirm`
- Reset:
`../.venv/bin/python manage.py reset_local_sandbox --preserve-admin subidhafurniture --preserve-setup --confirm`

## Admin Restore Checklist: Setup Snapshot
- When to use: local/dev/test setup recovery, localhost regression prep, setup master rehydration.
- When not to use: full production rollback, transactional data recovery, financial history restoration.
- Includes: business profile, tax profile, COA, finance accounts, mappings/posting profiles, branch/counter, warehouse/stock location, product categories, product tax readiness.
- Excludes: customers, partners, subscriptions, EMI/payments, direct sales, purchase bills, rent/lease contracts, invoices/receipts, commissions/payouts, audit logs, stock movements.
- Checklist: preview PASS/WARNING/BLOCKED rows, transactional excluded, preserved admin verified, local-safety verified, dry-run completed.
- Confirmation phrase: RESTORE SETUP SNAPSHOT.
- Localhost workflow: preview -> resolve blockers -> exact confirmation -> execute -> run readiness check.
- Production warning: setup snapshot restore is disabled in production-like environments by default.

