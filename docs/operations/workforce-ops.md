# Workforce Operations

This guide covers the additive workforce, payroll, leave, reimbursement, and staff-ledger workflow in SUBIDHA CORE.

## Scope

This pass adds practical workforce operations only:

- staff master
- compensation components
- attendance calendar
- leave types and leave requests
- payroll periods with close posture
- salary-sheet accrual register
- payslip-ready salary breakdown
- salary payment register
- employee expense claims
- reimbursement payments
- staff ledger

This is not a full HRMS or payroll-compliance engine.

Deferred items include:

- leave policy entitlements beyond basic type master
- advanced overtime policy
- tax deduction engines
- payslip PDF generation
- statutory payroll filing
- branch-level roster planning

## Core routes

- `/admin/accounting/staff`
- `/admin/accounting/attendance`
- `/admin/accounting/leave`
- `/admin/accounting/salary`
- `/admin/accounting/salary/{id}`
- `/admin/accounting/expense-claims`
- `/admin/accounting/staff-ledger`
- `/admin/accounting/books/bank`
- `/admin/accounting/books/cash`
- `/admin/accounting/books/upi`
- `/admin/accounting/journals`

## Staff master rule

Use `/admin/accounting/staff` to maintain operational staff identity for salary and attendance work.

Capture only the basics needed in this pass:

- employee code
- name
- phone
- designation
- department
- joining date
- base salary
- standard daily hours
- overtime rate per hour
- recurring salary components
- active state
- notes

This staff register does not replace authentication users and does not change admin, cashier, partner, or customer role boundaries.

## Attendance and overtime workflow

Attendance remains operational and additive in this pass.

Use it when management needs a daily presence trail:

1. Open `/admin/accounting/attendance` or record directly from `/admin/accounting/staff`.
2. Select the staff member.
3. Capture date, status, worked hours, overtime hours, and notes.
4. Save the row.

Recording the same employee and date again updates the existing attendance record instead of creating uncontrolled duplicates.

Attendance now supports salary auto-generation inputs, but it is still not the payroll source of truth by itself.

Guardrails:

- closed payroll periods block new attendance edits for dates inside that period
- leave-linked attendance rows come from approved leave requests, not manual salary edits
- overtime is captured operationally here and then consumed by salary-sheet generation

## Leave workflow

1. Open `/admin/accounting/leave`.
2. Maintain leave types first, including whether the leave type is paid or unpaid.
3. Create the leave request with start date, end date, and day count.
4. Approve, reject, or cancel from the leave register.

Guardrails:

- only `DRAFT` leave requests can be approved, rejected, or cancelled
- approval writes explicit `LEAVE` attendance rows for the approved dates
- approved unpaid leave can create salary deductions during auto-generated payroll
- closed payroll periods block new leave requests for dates in the locked range

## Salary component rule

Recurring staff-level allowances and deductions should be maintained in `/admin/accounting/staff`.

Examples:

- house rent allowance
- travel allowance
- mobile allowance
- recurring deduction

These components are reused during salary-sheet generation and do not create journals on their own.

## Salary workflow

1. Confirm the staff profile exists and is active.
2. Confirm attendance, leave approvals, and recurring salary components are up to date for the period.
3. Create the salary sheet in `/admin/accounting/salary`.
4. Prefer `auto-generate` when the workforce data is ready.
5. Review the resulting salary lines from `/admin/accounting/salary/{id}`.
6. Approve the salary sheet.
7. Post the salary sheet to accrue salary expense and salary payable.
8. Record salary payments only against posted salary sheets.
9. Use the correct finance account for the actual disbursement channel.
10. Close the payroll period only after draft and approved salary sheets are resolved.

Guardrails:

- salary payment is blocked until the salary sheet is posted
- overpayment is blocked
- payroll periods cannot be closed while draft or approved salary sheets still exist
- accounting entries come from salary services, not manual journal shortcuts
- posted salary sheets are not manually editable for amount history

## Payslip-ready detail view

Use `/admin/accounting/salary/{id}` to review:

- employee and period summary
- earning and deduction lines
- source references such as base salary, component, overtime, or leave deduction
- posted journal reference
- salary payments already made

This view is the operator-facing payslip data surface for now. It is intentionally data-first rather than PDF-first.

## Expense-claim reimbursement workflow

1. Open `/admin/accounting/expense-claims`.
2. Create the draft expense claim against the employee and the correct expense account.
3. Approve the claim, optionally with a lower approved amount than the claim value.
4. Post the claim to accrue employee reimbursement payable.
5. Record reimbursement payments only after the claim is posted.

Guardrails:

- staff expense claims are not vendor expenses
- reimbursement payment is blocked until the claim accrual is posted
- overpayment is blocked
- closed payroll periods block new claims dated inside the locked period

## Staff-ledger workflow

Use `/admin/accounting/staff-ledger` to review employee financial posture across:

- salary accrual
- salary payment
- reimbursement accrual
- reimbursement payment

Interpretation:

- positive closing balance means the business still owes the staff member
- negative closing balance means the staff member is net receivable to the business
- the ledger is derived from posted source events and is not a manual adjustment register

## Book impact

Payroll and staff-side finance affect accounting books only through controlled service posting:

- salary-sheet posting creates the accrual journal
- salary payment creates the payout journal
- expense-claim posting creates the reimbursement accrual journal
- reimbursement payment creates the reimbursement payout journal
- cash, bank, and UPI books reflect the finance account used for payment

The salary register does not become a second source of finance-account truth, expense claims do not become vendor vouchers, and accounting does not become a hidden source of staff truth.
