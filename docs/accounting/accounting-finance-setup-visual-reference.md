# Accounting Finance Setup Visual Reference

This guide documents how Subidha Core admins should interpret Accounting Bridge Readiness, accounting setup, and bridge reconciliation screens.

## Bridge Readiness chapter

The `/admin/accounting/bridges` page is a read-only operational interpretation layer. It must not post journals, allocate document numbers, reconcile rows, create payments, mutate invoices, mutate receipts, mutate subscriptions, mutate stock, or silently create mappings.

### What Postable means

**Postable** means the accounting setup gates are ready for the event:

- Chart of Accounts mapping is present where required.
- Finance account/profile setup is present where required.
- Active financial year and current/open period are available.
- Journal-entry numbering readiness is satisfied.

Postable does **not** mean the row is final-ready for close. A postable row can still require reconciliation evidence or controlled approval.

### What Ready means

**Ready** is stricter than postable. For this register, Ready means:

```text
postable + reconciled + not blocked by approval + not unsupported
```

A row should not be treated as Ready only because setup is postable.

### What Reconciled means

**Reconciled** means the source event has reconciliation evidence. Reconciliation pending rows should route to:

```text
/admin/accounting/bridge-reconciliation
```

Reconciliation exceptions are operational accounting work, not Chart of Accounts setup work.

### What Unsupported Source means

**UNSUPPORTED_SOURCE** means the source workflow is not implemented or not approved for posting. The current hard blocker is **Staff advance**.

Admins must not create fake posting readiness for Staff advance. The correct choices are:

1. Implement the real StaffAdvance source workflow with audit, approval, accounting, and reconciliation semantics.
2. Keep Staff advance unsupported/non-postable.
3. Disable or hide the source workflow if it is not part of the approved operating model.

### What Blocked by Approval means

**BLOCKED_BY_APPROVAL** is not a mapping setup error. It means accounting setup exists, but a controlled approval gate is required before bridge posting can happen.

Examples include:

- commission payout
- commission approval
- payout batch payment
- purchase inventory receive
- inventory purchase receive

These should not be fixed by random COA setup changes. They need a real approval workflow or an approved controlled posting route.

### What admin should fix first

The bridge register ranks blockers in this order:

1. Unsupported source blockers
2. Missing finance/account/profile setup
3. Approval-gated workflows
4. Reconciliation pending
5. Skipped/warning rows

For the current operating state, Staff advance should remain the top hard blocker. Reconciliation exceptions should route to Bridge Reconciliation. Approval-gated rows should explain controlled approval, not mapping setup.

### What admin must not do

Admins must not:

- auto-post journals from readiness screens
- auto-reconcile bridge rows from readiness screens
- create fake Staff advance posting readiness
- silently create mappings from bridge readiness
- mutate payments, invoices, receipts, journal entries, reconciliation items, periods, subscriptions, stock, commission, payout, or inventory records from read-only readiness pages
- downgrade close blockers to warnings for convenience

## Screenshot map

The visual reference builder expects these screenshots under `docs/accounting/screenshots/`:

```text
02-accounting-bridge-readiness-summary.png
03-accounting-bridge-readiness-groups.png
03a-accounting-bridge-staff-advance-unsupported.png
03b-accounting-bridge-approval-gated.png
03c-accounting-bridge-reconciliation-pending.png
03d-accounting-bridge-advanced-raw-readiness.png
```

Generate them with:

```bash
cd frontend
npm run test:e2e:accounting-visual
```

Build the PDF with:

```bash
cd frontend
npm run docs:accounting-visual
```
