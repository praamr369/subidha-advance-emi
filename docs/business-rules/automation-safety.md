# Automation Safety Rules (Phase 9)

## Scope
This document defines currently implemented automation safety controls for SUBIDHA CORE Lucky Plan EMI operations.

## Implemented automation boundaries
- Automation in this repo is read-only advisory, reminder generation, or notification dispatch.
- Financial posting, refunding, payout finalization, ledger mutation, invoice voiding, EMI schedule changes, draw-result changes, and contract-term changes are not auto-executed.
- Sensitive operations remain explicit human actions through protected admin endpoints and service-layer controls.

## Implemented safe automations
- EMI due reminders:
  - `backend/system_jobs/tasks.py` -> `daily_emi_due_reminders`
  - `backend/reminders/services/emi_reminder_jobs.py`
- EMI overdue reminders:
  - `backend/system_jobs/tasks.py` -> `daily_emi_overdue_reminders`
  - `backend/reminders/services/emi_reminder_jobs.py`
- Rent/lease due reminders:
  - `backend/system_jobs/tasks.py` -> `daily_rent_due_reminders`
  - `backend/reminders/services/rent_reminder_generation.py`
- Inventory low-stock advisory alerts:
  - `backend/system_jobs/tasks.py` -> `daily_inventory_reorder_check`
  - source signal from `backend/inventory/services/demand_service.py` (`get_purchase_suggestions`)
- Accounting health warning alerts:
  - `backend/system_jobs/tasks.py` -> `daily_accounting_health_check`

## Idempotency and dedupe
- Background jobs use idempotency key + durable log:
  - `backend/system_jobs/services/job_runner.py`
  - `SystemJobLog.idempotency_key` prevents repeated successful execution.
- Notifications support dedupe key:
  - `backend/system_jobs/services/notifications.py` (`emit_notification`)
  - `system_jobs.Notification.dedupe_key` unique constraint.
- Reminder generators check existing reminder records before create:
  - `backend/reminders/services/reminder_generation_service.py`
  - `backend/reminders/services/emi_reminder_jobs.py`

## Forbidden direct automations (enforced by architecture)
The current backend does not expose any auto workflow that directly:
- approves refunds/payouts
- deletes payment history
- edits ledger history
- voids invoices automatically
- rewrites stock/EMI/lucky draw/customer contract outcomes

## Auditability
- Reminder create/send/cancel operations write audit events through reminder service:
  - `backend/reminders/services/reminder_service.py`
- Job execution states and outcomes are persisted in `SystemJobLog`.
- Notification payloads include source metadata where available.

## Future additive work (proposed, not implemented)
- Dedicated durable alert-state model for lifecycle states (OPEN/ACK/CLOSED) per source key.
- SLA/escalation routing matrix configuration per module/branch.
