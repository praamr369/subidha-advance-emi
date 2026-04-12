# Rollback and Incident Handling

Use this document when a go-live step fails or a post-cutover incident threatens financial correctness or auditability.

## 1. Immediate response

- Stop new operational posting if the issue affects money, stock, delivery, or payroll truth.
- Record the exact time, user, branch, and module involved.
- Do not delete rows or hot-fix production data manually in the database.

## 2. Decide the incident type

- Deployment issue:
  app not starting, migrations failing, frontend not serving
- Data onboarding issue:
  import validation/post mismatch, wrong branch/counter mapping, wrong masters
- Operational posting issue:
  payment, billing, stock, service-desk note, or payroll posting mismatch

## 3. Rollback posture

- If migrations have not been applied, stop and fix before proceeding.
- If migrations are additive and the app booted, prefer application rollback plus controlled correction over destructive schema rollback.
- If bad imports posted only master data, correct through controlled update imports or admin edit after impact review.
- If financial or stock events posted incorrectly, use the module’s explicit reversal/correction workflow where one exists.

## 4. Mandatory evidence to preserve

- Exact commands run
- Import files used
- Preview/result output
- Screenshots or exported register rows when needed
- User ids, branch ids, counter ids, and source document ids

## 5. Resume criteria

- Root cause is understood
- Corrective action is approved
- A fresh validation or targeted UAT rerun passed
- Operators are told what is safe again and what remains blocked
