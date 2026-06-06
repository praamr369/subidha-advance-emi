# First-Run Business Operating Setup (SUBIDHA CORE)

This document describes the canonical “Start from Zero” setup flow for a fresh Subidha Furniture installation.

## Canonical setup route

Use:

- `/admin/settings/business-setup` — canonical Fresh Start Business Setup cockpit
- `/admin/setup/readiness` — compatibility alias to the canonical cockpit

Do not maintain two competing setup UIs.

## Production readiness categories

The business setup cockpit groups readiness as:

1. `CORE_REQUIRED`
2. `FINANCE_ACCOUNTING_REQUIRED`
3. `RENT_LEASE_REQUIRED`
4. `DIRECT_SALE_REQUIRED`
5. `SUBSCRIPTION_EMI_REQUIRED`
6. `INVENTORY_REQUIRED`
7. `STAFF_HR_PAYROLL_REQUIRED`
8. `CRM_REQUIRED`
9. `RESET_DRY_RUN_REQUIRED`
10. `OPTIONAL_OR_FUTURE`

Status labels are `READY`, `REQUIRED_PENDING`, `BLOCKED`, `WARNING`, `INFO`, `APPROVAL_GATED`, and `FUTURE_UNSUPPORTED`.

## Safe setup rule

The **Ensure Fresh Start Setup** action may repair setup metadata only, such as default COA, finance accounts, mappings, branch/counter setup, document-numbering profiles, print branding posture, and accounting setup metadata.

It must not create live operational records, post journals, allocate issued document numbers, create stock quantity, create salary/payroll results, or create customer contracts.

## Required live workflows

### Rent / Lease

Rent/Lease is live for this business and is production-required, not optional/future.

Required setup includes rent income, lease income, security deposit liability, damage recovery income, settlement finance account, deposit workflow, monthly demand workflow, collection workflow, and bridge readiness. Posting may remain approval-gated.

Routes:

- `/admin/rent-lease`
- `/admin/accounting/bridges`
- `/admin/accounting/bridge-reconciliation`
- `/admin/settings/business-setup/finance-accounts`

### Inventory

Inventory is a required admin workflow, but setup must not fake stock quantity.

The cockpit should show:

- CSV stock upload as an admin workflow
- manual opening stock as an admin workflow
- current stock entry may remain `REQUIRED_PENDING`
- missing stock does not make fake stock ready
- only explicit opening-stock/import confirmation workflows may create real stock records

Routes:

- `/admin/inventory/readiness`
- `/admin/inventory/opening-stock`
- `/admin/inventory/items`
- `/admin/inventory/ledger`

### Staff / HR / Payroll

Staff setup, staff login, attendance, payroll setup, payslip readiness, salary expense COA, and salary payable COA are required admin workflows.

Setup pages must not create fake salary outputs.

Routes:

- `/admin/hr/staff`
- `/admin/hr/attendance`
- `/admin/hr/payroll`
- `/admin/hr/salary-payments`
- `/admin/settings/business-setup/staff`

### CRM

CRM enrichment is a required admin workflow for production setup. PartyMaster, leads/followups, and customer/partner/staff linking should be visible where supported.

Setup pages must not create fake CRM interactions.

Routes:

- `/admin/crm`
- `/admin/crm/parties`
- `/admin/crm/leads`
- `/admin/crm/follow-ups`

## Reset and dry-run safety

Dry-run preview is read-only. Reset/restore actions require typed confirmation and must preserve the configured primary admin user.

Routes:

- `/admin/settings/business-setup/dry-runs`
- `/admin/settings/business-setup/reset`

## Unsupported future workflows

Staff Advance remains `FUTURE_UNSUPPORTED` unless a real audited StaffAdvance source workflow is implemented. Do not fake Staff Advance posting readiness.
