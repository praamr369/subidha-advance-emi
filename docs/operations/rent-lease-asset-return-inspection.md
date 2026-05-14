# Rent/Lease Asset Return Inspection (Current Code)

## Flow
1. Initiate possession return (`UNDER_INSPECTION`).
2. Create/record return inspection with condition and outcome.
3. Approve inspection.

## Approval effects
- Inspection must be `COMPLETED` before approval.
- On approval:
  - optional damage deduction is posted through deposit deduction transaction flow
  - optional deposit refund approval is recorded
  - possession is closed
  - stock movement routing runs by outcome where inventory item exists

## Stock routing outcomes
- `SELLABLE` -> customer return movement.
- `MAINTENANCE_REQUIRED` -> maintenance hold movement.
- `DAMAGED`/`SCRAPPED` -> damage movement.

## Audit
- Inspection creation and approval generate audit log events.
