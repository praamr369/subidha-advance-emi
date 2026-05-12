# Customer, HR, CRM, Operations — operational map

This document ties together the **existing** admin operator surfaces.

## Operations workspace surfaces

- Operations working screen: `/admin/operations`
- Operations command center: `/admin/operations/command-center`
- Today’s work (ERP queues): `/admin/operations/today-work`

## Customer / CRM surfaces

- Customer register: `/admin/customers`
- Customer detail: `/admin/customers/[id]`
- CRM home: `/admin/crm`
- Leads: `/admin/leads`
- Online enquiries: `/admin/online-enquiries`

## HR surfaces

- HR workspace: `/admin/hr/workspace`
- Staff register: `/admin/accounting/staff`
- Staff detail: `/admin/accounting/staff/[id]`
- Attendance: `/admin/accounting/attendance`
- Leave: `/admin/accounting/leave`
- Expense claims: `/admin/accounting/expense-claims`
- Salary / payroll: `/admin/accounting/salary`

## How these connect in daily operations

- **Operations → Customer follow-ups**
  - Start: `/admin/operations`
  - Investigate customer: `/admin/customers` → `/admin/customers/[id]`
  - CRM handling: `/admin/crm` / `/admin/leads` / `/admin/online-enquiries`

- **Operations → HR actions**
  - Start: `/admin/operations`
  - Daily staff actions: `/admin/accounting/attendance`, `/admin/accounting/leave`, `/admin/accounting/expense-claims`

## Notes (guardrails)

- These pages are for **internal roles only** (admin/cashier). Do not expose these links in customer/partner/public navigation.
- Do not derive KPIs here unless backed by real API data used in the actual page implementations.

