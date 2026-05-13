# ERP Module Map (Repo-Grounded)

## Confirmed backend module boundaries
- Finance + Accounting: `backend/accounting/**`, `backend/api/v1/routes/accounting.py`, `backend/api/v1/views/accounting*.py`, `backend/api/v1/views/admin_accounting_setup.py`
- Billing + sales documents: `backend/billing/**`, `backend/api/v1/routes/billing.py`, `backend/api/v1/views/billing.py`
- Subscription + EMI + draw + waiver + payout + reconciliation: `backend/subscriptions/**`, `backend/services/payments/**`, `backend/services/reconciliation/**`, `backend/api/v1/views/payment*.py`, `backend/api/v1/views/admin_reconciliation.py`, `backend/api/v1/views/reversal*.py`
- Inventory / MM: `backend/inventory/**`, `backend/api/v1/routes/inventory.py`, `backend/api/v1/views/inventory*.py`, `backend/api/v1/views/admin_inventory_ops.py`
- Purchase / vendor / manufacturer: `backend/api/v1/routes/vendor.py`, `backend/api/v1/views/vendor_ops.py`, `backend/manufacturing/**`, `backend/api/v1/routes/manufacturing.py`
- CRM + service desk: `backend/crm/**`, `backend/service_desk/**`, `backend/api/v1/routes/crm.py`, `backend/api/v1/routes/service_desk.py`
- HR/workforce (accounting-linked): `backend/accounting/services/workforce_service.py`, `backend/api/v1/views/admin_hr.py`, employee/attendance/payroll endpoints in accounting routes
- CMS/public business content: `backend/api/v1/views/admin_public_site.py`, `backend/api/v1/views/public_site.py`, `backend/api/v1/routes/public.py`
- Delivery/return/cancellation: `backend/api/v1/views/admin_deliveries.py`, `backend/api/v1/serializers/delivery.py`, `backend/api/v1/serializers/operational_cancellation.py`
- ERP summary/orchestration surfaces: `backend/api/v1/views/admin_erp.py`, `backend/api/v1/views/admin_phase5_control.py`, `backend/api/v1/views/admin_operations_queues.py`

## Confirmed frontend module boundaries
- Accounting + setup: `frontend/src/services/accounting.ts`, `frontend/src/services/accounting-setup.ts`, `frontend/src/app/(dashboard)/admin/accounting/**`, `frontend/src/app/(dashboard)/admin/settings/business-setup/**`
- Billing + direct sale: `frontend/src/services/billing.ts`, `frontend/src/app/(dashboard)/admin/billing/**`, `frontend/src/app/(dashboard)/admin/sales/direct-sale/**`
- Inventory/MM: `frontend/src/services/inventory.ts`, `frontend/src/services/inventory-ops.ts`, `frontend/src/app/(dashboard)/admin/inventory/**`
- CRM/service desk: `frontend/src/services/crm*.ts`, `frontend/src/services/service-desk.ts`, `frontend/src/app/(dashboard)/admin/crm/**`, `frontend/src/app/(dashboard)/admin/service-desk/**`
- HR: `frontend/src/services/admin-hr.ts`, `frontend/src/app/(dashboard)/admin/hr/**`
- Delivery/returns: `frontend/src/services/deliveries.ts`, `frontend/src/app/(dashboard)/admin/delivery/**`, `frontend/src/app/(dashboard)/admin/deliveries/**`
- BI/reports: `frontend/src/services/admin-bi.ts`, `frontend/src/services/reports*`, `frontend/src/app/(dashboard)/admin/bi/**`, `frontend/src/app/(dashboard)/admin/reports/**`

## Current status by requested ERP area
- Direct Sale: Implemented route/service/page surfaces exist (billing + admin sales + direct sale workspace).
- Lucky Plan EMI / Advance EMI: Implemented (subscriptions/payments/reconciliation surfaces and tests).
- Rent / Lease: Partial implementation present in contract and accounting mapping surfaces; expansion still pending.
- Finance / Accounting: Implemented and active, with setup-health/defaults plus books/reports/posting controls.
- Inventory / MM: Implemented core + phase-2 demand/planning endpoints.
- Purchase / Vendor / Manufacturer: Implemented core vendor + purchase + manufacturing surfaces.
- Sales Distribution: Partial via admin sales workspace and billing sync surfaces.
- Delivery: Implemented admin delivery operations and status transitions.
- Return / Cancellation: Implemented through delivery/service-desk/operational-cancellation surfaces.
- CRM: Implemented core CRM and party/follow-up surfaces.
- HR: Implemented under accounting/admin HR surfaces.
- CMS: Implemented via public business profile/public-site admin routes.
- Automation: Partial via system jobs, bridge runs, setup defaults/bootstrap.
- BI / Reports: Implemented report and BI endpoints/pages.
