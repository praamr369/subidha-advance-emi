# HR Staff Accountability (Phase 7)

## Scope
This document defines current HR/staff accountability behavior implemented in code for internal operations.

Confirmed from code:
- `backend/api/v1/views/admin_hr.py`
- `backend/accounting/services/hr_workspace_service.py`
- `backend/api/v1/views/admin_internal_users.py`
- `backend/api/v1/views/admin_role_capabilities.py`
- `backend/subscriptions/services/payment_service.py`
- `backend/billing/services/direct_sale_collection_service.py`

## Internal role boundaries
- Internal HR APIs are admin-only (`IsAdmin` + authenticated) under `/api/v1/admin/hr/*`.
- Internal user create/update is admin-only under `/api/v1/admin/internal-users/*`.
- Role/capability matrix update is admin-only under `/api/v1/admin/settings/roles-permissions/*`.
- Customer/partner/vendor are blocked from admin HR endpoints.

## Staff profile and assignment accountability
- Staff profiles are stored in `EmployeeProfile`.
- Optional internal login creation for HR staff is controlled in `create_staff_profile(...)` and only supports internal role creation from admin flow.
- Cash counter assignment is captured on `branch_control.CashCounter.assigned_user` and validated through branch/counter guards.
- Staff attendance creation stores `recorded_by` and emits audit metadata through `AuditLog`.

## Leave, expense, and payroll accountability
- Leave approval/rejection and expense approval/rejection run through service layer functions and write audit entries.
- Salary payments are recorded through admin HR APIs and write HR audit metadata.
- Payroll/attendance endpoints in the HR workspace are admin-only.

## Cashier collection accountability
- EMI collection path writes `Payment.collected_by`, `branch`, `cash_counter`, and `finance_account`.
- Branch/counter access checks are enforced before write.
- Direct-sale collections bind branch/counter/finance-account with branch-consistency validation and persist receipt trace.

## Sensitive workflow operator traceability
Current code tracks operator identity in supported flows via explicit actor fields and/or audit metadata:
- payment collection (`collected_by` + audit/event metadata)
- invoice/receipt lifecycle paths (approved/void/cancel fields where models support)
- refund approval/payment (`approved_by`, `paid_by` where supported)
- leave/expense approvals and attendance recording (`performed_by` and HR audit metadata)

## Proposed future additive work (not implemented in this phase)
- Dedicated cashier shift open/close model with immutable close snapshots and variance sign-off.
- Structured approval-action log table for cross-module reporting (while keeping existing audit logs intact).
- Branch-operator daily accountability summary endpoint with read-only reconciliation metrics.
