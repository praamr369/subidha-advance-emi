# Daily Shop Operations (Production)

This runbook describes day-to-day execution for store staff and admin.

## Opening Routine

1. Verify backend and frontend are reachable.
2. Verify cashier counter and finance account are active.
3. Confirm `readyz` is healthy before taking money.
4. Verify no unresolved critical reconciliation alerts.

## Core Daily Flows

### Customer and Contract Intake

- Create/verify customer profile and KYC state.
- Select product + batch + lucky ID (EMI flow).
- Create contract/order only after customer and product are valid.

### Collections

- Cashier uses collection flow; no manual DB edits.
- Receipt must be generated for every collection.
- Reversal uses controlled reversal flow only.

### Delivery/Handover

- Delivery only from valid contract/sale source.
- Stock-affecting transitions must use stock movement services.

### Rent/Lease

- Deposit and monthly demand are separate.
- Refund/deduction follows return inspection workflow.

### Day-End

1. Review unreconciled/flagged payments.
2. Validate accounting control center snapshot.
3. Validate operations command queue priorities.
4. Export finance and reconciliation CSV for day-close archive.
5. Confirm backup completed.

## Mandatory Cross-Module Sync Chains

### Advance EMI

Customer -> Product -> Batch -> Lucky ID -> Subscription -> EMI schedule -> Payment/receipt -> Finance summary -> Delivery -> Customer dashboard -> CRM -> Admin reports

### Rent

Customer -> Product -> Rent contract -> KYC/signature -> Deposit demand -> Monthly demand -> Receipt -> Deposit ledger -> Delivery/possession -> Return inspection -> Refund/deduction -> CRM/reports

### Lease

Customer -> Product -> Lease contract -> KYC/signature -> Deposit demand -> Monthly demand -> Receipt -> Deposit ledger -> Delivery/possession -> Return inspection -> Refund/deduction -> CRM/reports

### Direct Sale

Customer/walk-in -> Product -> Sale order -> Invoice -> Receipt/payment -> Stock movement -> Delivery -> Finance reporting -> Customer dashboard -> CRM -> Admin reports
