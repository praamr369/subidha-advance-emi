# Admin No-Flip Route Policy

Branch: `update`. Established: 2026-06-16.

This document defines the permanent policy for admin route ownership during the
Phase 9B no-flip operational UI improvement sequence and beyond.

## Policy statements

### 1. Existing content-owner routes stay stable

Legacy routes that currently host real page content remain the authoritative
content-owner pages. No phase of this cleanup may silently remove, rename, or
redirect away from a content-owner route until that route's page content has been
explicitly migrated to its canonical target, reviewed, and approved.

Content-owner routes (classified `keep` or `keep_temporarily` in the migration
map) include:

```
/admin/customers
/admin/partners
/admin/vendors
/admin/hr/staff
/admin/branches
/admin/crm/parties
/admin/batches
/admin/lucky-ids
/admin/lucky-draws
/admin/outstandings
/admin/customer-advances
/admin/online-enquiries
/admin/support-requests
/admin/subscription-requests
```

### 2. Canonical module routes are aliases for navigation clarity

Canonical routes (`/admin/profiles/*`, `/admin/lucky-plan/{batches,lucky-ids,draws}`,
`/admin/finance/{outstandings,customer-advances}`, `/admin/requests/*`) are thin
page-level redirects that point **back** to the legacy content-owner routes.

**Alias direction (canonical → legacy):**

```
/admin/profiles/customers        → /admin/customers
/admin/profiles/partners         → /admin/partners
/admin/profiles/vendors          → /admin/vendors
/admin/profiles/branches         → /admin/branches
/admin/profiles/staff            → /admin/hr/staff
/admin/profiles/parties          → /admin/crm/parties
/admin/lucky-plan/batches        → /admin/batches
/admin/lucky-plan/lucky-ids      → /admin/lucky-ids
/admin/lucky-plan/draws          → /admin/lucky-draws
/admin/finance/outstandings      → /admin/outstandings
/admin/finance/customer-advances → /admin/customer-advances
/admin/requests/online-enquiries → /admin/online-enquiries
/admin/requests/support          → /admin/support-requests
/admin/requests/subscriptions    → /admin/subscription-requests
```

Permanent exceptions (canonical IS the content owner, no flip needed):
- `/admin/profiles/vendors` stays under Profiles & Parties as identity alias to procurement `/admin/vendors`
- `/admin/profiles/staff` stays as alias to `/admin/hr/staff` (HR owns the workflow)

### 3. No route ownership flip without explicit approval

A "flip" means moving real page content from the legacy path into the canonical
path and making the legacy path the redirect. Flips are deferred to a future
explicitly approved release. No phase may:

- Move `page.tsx` content from a legacy path to a canonical path
- Change a canonical `redirect()` to point to a new location
- Delete a legacy `page.tsx` that still owns its content
- Add `delete_later` status to any route without explicit sign-off

Violation guard: `frontend/tests/unit/route-cleanup-phase-9b1.test.ts` locks
the pre-flip topology so any redirect direction change fails the test suite.

### 4. Cleanup focuses on UI consistency, page usefulness, fake UI removal, and operational clarity

During Phase 9B-NF (no-flip) the only permitted changes to content-owner pages are:

- Improve command headers, eyebrow labels, and statusBadges to reflect module ownership
- Add safe helper copy that attributes each concern to the correct module
  (Finance Operations, Collections & Cashier, Accounting & Reconciliation,
  Delivery & Service, HR & Staff, etc.)
- Remove or relabel copy that implies posting, payment, reconciliation, stock
  movement, or approval happens from that page
- Improve section organisation, filter UX, and register readability
- Add context links that navigate to the correct module (not duplicate its UI)
- Add focused unit tests for safety boundaries

Forbidden during Phase 9B-NF:

- Do not invent backend endpoints
- Do not fake stock counts, valuation, draw readiness, winner state, or BI numbers
- Do not create Payment, ReceiptDocument, JournalEntry, MoneyMovement,
  StockLedger, AccountingBridgePosting, ReconciliationItem, SalaryPayment,
  Commission, or Payout records
- Do not alter EMI schedule or payment behaviour
- Do not add dead buttons (buttons that link nowhere or pretend to post)
- Do not change EMI calculation, payment posting, receipt generation, or
  lucky draw winner waiver semantics

### 5. Deletion is postponed until a future approved release

No route, `page.tsx`, backend endpoint, model, migration, or database field is
deleted during Phase 9B-NF. The `delete_later` status classification remains
unused until:

1. Page content is migrated to the canonical path (future Phase 9B flip)
2. The legacy redirect has operated safely through at least one release cycle
3. Explicit sign-off is recorded in the migration map

## Module ownership reference

| Concern | Owning module | Canonical route |
|---|---|---|
| Customer identity | Profiles & Parties | `/admin/profiles/customers` → `/admin/customers` |
| Linked contracts | Sales & Contracts | `/admin/subscriptions` |
| Money posture / outstandings | Finance Operations | `/admin/finance/outstandings` → `/admin/outstandings` |
| Collection / receipt | Collections & Cashier | `/admin/collections/*`, `/admin/finance/collect` |
| Accounting bridge / reconciliation | Accounting & Reconciliation | `/admin/accounting/*` |
| Stock truth / inventory | Inventory & Stock | `/admin/inventory/*` |
| Delivery / handover | Delivery & Service | `/admin/deliveries/*` |
| Lucky batch / IDs / draws | Lucky Plan Control | `/admin/lucky-plan/*` |
| Purchase / vendor chain | Purchases & Vendors | `/admin/purchases/*`, `/admin/vendors/*` |
| HR / payroll | HR & Staff | `/admin/hr/*` |
| Analytics / reports | BI & Reports | `/admin/bi/*`, `/admin/reports*` |

## Change log

| Date | Phase | Change |
|---|---|---|
| 2026-06-16 | 9B-NF | Policy document created |
