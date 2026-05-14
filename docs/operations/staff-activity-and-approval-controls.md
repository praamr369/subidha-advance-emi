# Staff Activity And Approval Controls

## Current activity trace sources
Current operator traceability is distributed across:
- `subscriptions.AuditLog`
- business event logs for payment and operational actions
- model-level actor fields (`approved_by`, `cancelled_by`, `collected_by`, `paid_by`, `recorded_by` where supported)

## HR activity controls
HR service layer writes audit records for:
- staff profile creation
- cash counter assignment via HR flow
- attendance marking
- leave approve/reject
- expense approve/reject
- salary payment recording

## Sensitive approval controls already present
Across finance/billing/accounting modules, approval/cancellation/void/refund flows persist actor trace where supported by current models.
This includes invoice/receipt/reversal and refund approval/payment paths.

## Operational review pattern
1. Use admin HR workspace for staff lifecycle, attendance, leave, payroll visibility.
2. Use cashier/admin collection views for counter-level collection trace.
3. Use audit/event logs to verify who performed sensitive operations.
4. Validate branch/counter consistency for cash-collection events.

## Proposed future additive controls (not implemented)
- Unified cross-module approval queue with normalized approval event schema.
- Read-only staff activity timeline endpoint combining HR, finance, billing, delivery, and service desk events.
