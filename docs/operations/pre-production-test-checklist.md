# Pre-Production Test Checklist (Phase 6)

Use this checklist for final UAT + deployment gate.

## A) Manual Workflow Checklist

- [ ] admin login
- [ ] cashier login
- [ ] partner login
- [ ] customer login
- [ ] create customer
- [ ] create product
- [ ] create batch
- [ ] create advance EMI contract
- [ ] collect EMI payment
- [ ] reverse payment
- [ ] run lucky draw
- [ ] winner waiver
- [ ] delivery request
- [ ] rent contract
- [ ] lease contract
- [ ] security deposit demand
- [ ] monthly rent/lease demand
- [ ] deposit deduction/refund
- [ ] direct sale
- [ ] invoice generation
- [ ] receipt generation
- [ ] PDF download
- [ ] stock reservation
- [ ] stock movement
- [ ] reconciliation queue/action
- [ ] accounting control center loads
- [ ] operations command center loads
- [ ] customer dashboard scope check
- [ ] partner dashboard scope check
- [ ] public lead/product/apply flow

## B) Sync-Chain Validation (Deploy Gate)

### 1. Advance EMI Chain

- [ ] Customer -> Product -> Batch -> Lucky ID -> Contract exists and linked
- [ ] Activated contract has EMI schedule
- [ ] Payment creates receipt and finance trace
- [ ] Delivery flow links back to source contract
- [ ] Customer dashboard reflects own contract + docs + payments
- [ ] CRM and admin reports show same authoritative totals

### 2. Rent Chain

- [ ] Contract linked to customer/product
- [ ] Security deposit demand exists
- [ ] Monthly rent demand exists
- [ ] Receipts and deposit ledger are traceable
- [ ] Return inspection and refund/deduction trail exists

### 3. Lease Chain

- [ ] Contract linked to customer/product
- [ ] Security deposit + monthly lease demand created
- [ ] Receipt and deposit liability traceable
- [ ] Return inspection + refund/deduction traceable

### 4. Direct Sale Chain

- [ ] Sale links to product/customer or walk-in source
- [ ] Invoice/receipt generated
- [ ] stock-out movement created by stock service
- [ ] Delivery trace links to sale source
- [ ] finance/report totals are not double-counted

## C) Security Checklist

- [ ] customer isolation validated
- [ ] partner scope isolation validated
- [ ] cashier privilege boundaries validated
- [ ] protected APIs reject unauthenticated users
- [ ] admin-only endpoints reject non-admin users
- [ ] JWT refresh works
- [ ] logout invalidation works
- [ ] expired token behavior is controlled
- [ ] document/PDF authorization enforced
- [ ] no server file paths leaked in response payloads

## D) Performance Readiness Plan

Target rehearsal dataset (non-production environment):

- 1,000 customers
- 100 batches
- 10,000 EMI rows
- 5,000 payments
- 1,000 invoices/receipts

Measure and document:

- [ ] admin dashboard load time
- [ ] accounting control center load time
- [ ] report page load time
- [ ] customer lookup speed
- [ ] cashier payment flow speed
- [ ] product search speed

## E) Validation Commands

- [ ] `python manage.py check --deploy`
- [ ] `python manage.py makemigrations --check --dry-run`
- [ ] backend targeted/RC tests
- [ ] frontend typecheck
- [ ] frontend lint
- [ ] frontend build
- [ ] `bash scripts/run-release-candidate.sh`

## F) Blocker Rules

Deploy blocker if any:

- missing source link in sync chain
- orphan receipt/payment artifact
- stock-affecting flow bypasses stock movement service
- non-admin can access global report/control data
- waived EMI appears in collectible due
- deposit liability counted as income
- reconciliation actions mutate payment amount/method/date
