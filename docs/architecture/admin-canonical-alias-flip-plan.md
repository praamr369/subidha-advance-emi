# Phase 9B.1 — Canonical Alias Flip Plan

Status: **planning + first safe lock only — no route flip, no content move, no deletion.**
Branch: `update`. Date: 2026-06-16.
Predecessor: `docs/architecture/admin-route-cleanup-phase-9a-report.md` (Phase 9A audit, complete).

Phase 9B.1 prepares — but does **not execute** — the migration that moves real
page ownership from legacy admin routes to canonical module routes. It produces
this plan, locks the current (pre-flip) topology with guard tests, and stops.
No legacy route is deleted, no redirect is flipped, no page content is moved, and
no backend endpoint, model, migration, serializer, service, payment / EMI /
lucky-draw / rent-lease / commission / payout / accounting-bridge / reconciliation
/ audit semantic is touched.

## Root cause

After Phases 0–8 the admin app carries **dual route families** for several
modules. The canonical module routes (`/admin/profiles/*`, `/admin/lucky-plan/*`,
`/admin/finance/*`, `/admin/requests/*`) were introduced as **thin page-level
redirect aliases that point BACK to the legacy routes**, which still host the
real pages. Phase 9A confirmed and documented this: the *legacy* path is the
content owner (`keep_temporarily`); the *canonical* path is the `alias`.

The eventual end state (Phase 9B) is the reverse: the **canonical** path should
own the page, and the **legacy** path should become the compatibility alias
(`migrate_then_alias`). That flip is risky if done blindly or all at once — it
changes which file renders money, collection, lucky-draw, and identity surfaces
that the shop uses every day. This document defines a **one-module-at-a-time**,
non-breaking migration order and the test lock that prevents an accidental or
premature flip.

## Terminology

| Term | Meaning |
|---|---|
| Current canonical route | The `/admin/<module>/<x>` path that *should* own the page but today only redirects. |
| Current legacy content-owner route | The original `/admin/<x>` path that today still renders the real page. |
| Proposed final content-owner route | Where the real page lives **after** the Phase 9B flip. |
| Compatibility alias route | The route that becomes a thin redirect **after** the flip, kept for backward compatibility (never deleted in 9B). |
| Flip | Swap of redirect direction: move page body to the canonical path, replace the legacy page with a redirect to canonical. |

### Flip mechanics (illustrative — NOT performed in Phase 9B.1)

```text
BEFORE (today, locked by Phase 9B.1 tests):
  /admin/profiles/customers  ──redirect──▶  /admin/customers (real page)

AFTER (Phase 9B.2+, one module at a time, separately approved):
  /admin/profiles/customers  (real page)  ◀──redirect──  /admin/customers
```

The page body is **moved**, not rewritten; backend calls, serializers, and
business logic are unchanged. Both routes keep resolving — only the redirect
direction reverses. The legacy route is **never deleted** during 9B; it only
becomes a `delete_later` candidate after the alias has redirected safely through
at least one release cycle, and even then only with explicit approval.

## Route family classification

Four alias families are in scope. Two routes inside Profiles & Parties
(`vendors`, `staff`) are **explicitly excluded from the flip** because they have
cross-module content ownership — documented under "Excluded from flip" below.

### Family 1 — Profiles & Parties

Master identity / party data. Lowest financial risk: these pages create no
journals, money movements, receipts, or stock movements.

| Logical page | Current canonical route | Current legacy content-owner route | Proposed final content-owner route | Compatibility alias route (after flip) |
|---|---|---|---|---|
| Customers | `/admin/profiles/customers` | `/admin/customers` | `/admin/profiles/customers` | `/admin/customers` |
| Partners | `/admin/profiles/partners` | `/admin/partners` | `/admin/profiles/partners` | `/admin/partners` |
| Branches | `/admin/profiles/branches` | `/admin/branches` | `/admin/profiles/branches` | `/admin/branches` |
| Parties | `/admin/profiles/parties` | `/admin/crm/parties` | `/admin/profiles/parties` | `/admin/crm/parties` |

- **Required tests (for the eventual flip):** canonical page renders the real
  register; legacy route redirects to canonical; nav links resolve; no financial
  mutation on load; profile pages absent from Finance/Accounting/Collections nav
  groups (already asserted in `profiles-routes.test.ts`).
- **Risk level:** Low.
- **Backend impact:** None. Same read endpoints (`customers`, `partners`,
  `branches`, parties directory) consumed from the new path.
- **Financial integrity impact:** None. Identity pages post nothing.
- **Auditability impact:** Neutral-to-positive. Canonical URLs make audit-log
  navigation consistent; audit semantics unchanged.
- **Daily shop usability impact:** Low. Staff who bookmarked `/admin/customers`
  still land on the page via the compatibility alias. Sidebar already points at
  canonical routes.
- **Future rent/lease compatibility impact:** None. Customer/party identity is
  shared by Advance EMI, direct sale, **and** rent/lease contracts; a stable
  canonical identity URL is a prerequisite for future rent/lease object pages.

### Family 2 — Lucky Plan Control

Lucky Plan operational surfaces (batches, Lucky IDs, draws). Operationally
sensitive but contained: draw/winner/waiver logic stays in the backend and is
untouched by a URL flip.

| Logical page | Current canonical route | Current legacy content-owner route | Proposed final content-owner route | Compatibility alias route (after flip) |
|---|---|---|---|---|
| Batches | `/admin/lucky-plan/batches` | `/admin/batches` | `/admin/lucky-plan/batches` | `/admin/batches` |
| Lucky IDs | `/admin/lucky-plan/lucky-ids` | `/admin/lucky-ids` | `/admin/lucky-plan/lucky-ids` | `/admin/lucky-ids` |
| Draws | `/admin/lucky-plan/draws` | `/admin/lucky-draws` | `/admin/lucky-plan/draws` | `/admin/lucky-draws` |

- **Required tests (for the eventual flip):** canonical page renders the batch /
  Lucky ID grid / draw register; legacy route redirects to canonical; lucky-draw
  winner-waiver controls and future-EMI-only rule remain read-only and unchanged
  (existing `lucky-plan-routes.test.ts` assertions preserved); winners gap page
  still honest.
- **Risk level:** Medium.
- **Backend impact:** None. Same batch / Lucky ID / draw read endpoints; the
  `execute-winner` action and waiver controls are not moved or re-wired.
- **Financial integrity impact:** None directly. Draw outcomes drive EMI waivers,
  but a URL flip does not call any draw/waiver/EMI mutation. No Payment,
  ReceiptDocument, or JournalEntry is created by the move.
- **Auditability impact:** Neutral. Draw evidence and audit timeline render from
  the same source records under the canonical URL.
- **Daily shop usability impact:** Medium. Lucky Plan is a daily operation;
  the legacy `/admin/batches`, `/admin/lucky-ids`, `/admin/lucky-draws`
  bookmarks must keep working (compatibility alias) so draw-day flow is not
  disrupted.
- **Future rent/lease compatibility impact:** None. Lucky Plan is plan-specific;
  rent/lease contracts do not pass through these routes. Keeping Lucky Plan
  isolated under `/admin/lucky-plan/*` protects the future rent/lease module from
  Lucky-Plan-only semantics leaking in.

### Family 3 — Finance Operations

Source-of-money operations (outstandings = who owes; customer advances =
customer liability source). **Highest risk family — migrates last** (see
"Why Finance Operations migrates last").

| Logical page | Current canonical route | Current legacy content-owner route | Proposed final content-owner route | Compatibility alias route (after flip) |
|---|---|---|---|---|
| Outstandings | `/admin/finance/outstandings` | `/admin/outstandings` | `/admin/finance/outstandings` | `/admin/outstandings` |
| Customer advances | `/admin/finance/customer-advances` | `/admin/customer-advances` | `/admin/finance/customer-advances` | `/admin/customer-advances` |

- **Prerequisite (before this family flips):** add a named `ROUTES` constant for
  the legacy `/admin/customer-advances` path (documented gap in Phase 9A) so the
  compatibility alias is referenced by constant, not string. Additive only; not
  done in Phase 9B.1.
- **Required tests (for the eventual flip):** canonical page renders the
  outstandings / customer-advance source register; legacy route redirects to
  canonical; Finance Operations nav group still excludes COA, journals, periods,
  trial balance, P&L, balance sheet (existing `finance-accounting-routes.test.ts`
  assertions preserved); page creates no Payment / JournalEntry / MoneyMovement /
  ReconciliationItem on load.
- **Risk level:** High.
- **Backend impact:** None. Same outstanding / advance read endpoints. Accounting
  bridge, reconciliation, and journal endpoints are **not** consumed from these
  Finance pages and stay in Accounting & Reconciliation.
- **Financial integrity impact:** None from the move itself, **but** outstandings
  and customer advances are the daily money-truth surfaces, so a flip error here
  is the most expensive to misread. The move must not blur the Finance (source) ↔
  Accounting (ledger) boundary.
- **Auditability impact:** Sensitive. These pages link to receipts, demands, and
  bridge state; the canonical move must preserve every source→ledger drill-down.
- **Daily shop usability impact:** High. Outstandings drives daily collection
  visibility ("who must we collect from today"); customer advances drives
  liability visibility. Both legacy bookmarks must keep resolving.
- **Future rent/lease compatibility impact:** High value. Rent/lease will add
  rent demands, security deposits, and refunds as Finance Operations source
  records. A clean, stable `/admin/finance/*` canonical home is required so
  rent/lease money-source pages slot in beside outstandings/advances without
  re-confusing the Finance↔Accounting boundary.

### Family 4 — CRM & Requests

Demand / intake queues (online enquiries, support intake, subscription
requests). No silent contract / payment / accounting creation from these queues.

| Logical page | Current canonical route | Current legacy content-owner route | Proposed final content-owner route | Compatibility alias route (after flip) |
|---|---|---|---|---|
| Online enquiries | `/admin/requests/online-enquiries` | `/admin/online-enquiries` | `/admin/requests/online-enquiries` | `/admin/online-enquiries` |
| Support intake | `/admin/requests/support` | `/admin/support-requests` | `/admin/requests/support` | `/admin/support-requests` |
| Subscription requests | `/admin/requests/subscriptions` | `/admin/subscription-requests` | `/admin/requests/subscriptions` | `/admin/subscription-requests` |

- **Required tests (for the eventual flip):** canonical page renders the request
  inbox; legacy route redirects to canonical; request queues do not create
  contracts / payments / subscriptions silently (existing
  `crm-requests-service-desk-routes.test.ts` assertions preserved); service
  execution stays in Service Desk, not Requests.
- **Risk level:** Low–Medium.
- **Backend impact:** None. Same request-list read endpoints; approve/reject
  continues to go through the existing backend workflow only.
- **Financial integrity impact:** None. Intake queues post no money; approval
  feeds Sales/Collections through existing controlled workflows, not from the
  list page.
- **Auditability impact:** Neutral. Request status transitions keep their
  existing audit trail.
- **Daily shop usability impact:** Medium. Front-desk staff triage these queues
  daily; legacy bookmarks must keep resolving.
- **Future rent/lease compatibility impact:** Positive. A canonical
  `/admin/requests/*` intake home lets future rent/lease enquiries and requests
  land in the same triage pattern without a new route family.

### Excluded from flip (cross-module ownership — keep current state)

| Logical page | Canonical alias | Content owner | Decision |
|---|---|---|---|
| Vendors | `/admin/profiles/vendors` (identity alias) | `/admin/vendors` (procurement register, Purchases & Vendors) | **Do not flip.** `/admin/vendors` is the procurement register, not pure identity. Vendor identity stays a thin alias under Profiles & Parties; procurement ownership stays under Purchases & Vendors. |
| Staff | `/admin/profiles/staff` (identity alias) | `/admin/hr/staff` (HR source workflow) | **Do not flip.** HR owns the staff source workflow (onboarding, payroll setup, attendance). `/admin/profiles/staff` stays a permanent identity alias to `/admin/hr/staff`. |

These two are deliberately **not** part of any flip phase; their current redirect
direction is the intended permanent state.

## Recommended safe migration order

Migrate **one family at a time**, lowest financial/operational blast radius
first, money-truth surfaces last:

1. **Profiles & Parties** — identity/master data, no posting, no draw logic.
   Safest possible first move; proves the flip mechanic end-to-end.
2. **CRM & Requests** — intake queues, no money posting, approval stays in
   existing backend workflow.
3. **Lucky Plan Control** — operational and daily, but draw/winner/waiver/EMI
   logic stays in the backend and is untouched by the URL move.
4. **Finance Operations** — money-source truth (outstandings, customer advances).
   Migrate **last** (see next section).

Each step is its own change, separately approved and tested, with the legacy
route kept as a working compatibility alias. No step deletes a route. No step is
started until the previous step has redirected safely through a release cycle.

## Why Finance Operations migrates last

1. **Money-source route confusion is higher risk.** `/admin/finance/*` answers
   "who owes money / who gets money / what came in / what is pending". Moving
   which file renders that, mid-cycle, is the change most likely to be misread by
   a shop operator under daily collection pressure. Doing it last means the flip
   mechanic is already proven on three lower-risk families first.
2. **Outstandings and customer advances affect daily collection visibility.**
   Outstandings is the "who must we collect from today" surface; customer
   advances is the customer-liability surface. A flip glitch here directly
   degrades daily cash collection, so it gets the most-proven, last-in-line slot.
3. **Accounting bridge boundaries must remain clear.** Finance Operations
   (source) must never present itself as Accounting (ledger). COA, journals,
   periods, trial balance, P&L, and balance sheet stay in Accounting &
   Reconciliation. Migrating Finance last — after Profiles, Requests, and Lucky
   Plan have validated the move pattern — lowers the chance of accidentally
   dragging an accounting/bridge surface into the Finance flip and blurring that
   boundary. Rent/lease will later add rent demands / deposits / refunds as
   Finance source records, so the Finance↔Accounting boundary must be crisp
   before that module arrives.

## Phase 9B.1 deliverables (this phase only)

1. **This plan document** (`docs/architecture/admin-canonical-alias-flip-plan.md`).
2. **A lock test** (`frontend/tests/unit/route-cleanup-phase-9b1.test.ts`) that
   freezes the current pre-flip topology and proves Phase 9B.1 did **not** flip
   anything:
   - canonical alias pages exist;
   - legacy content-owner pages still exist;
   - no `delete_later` route is currently deleted (every future-`delete_later`
     legacy path is present on disk);
   - Phase 9B.1 does not flip route direction yet (canonical pages still redirect
     to legacy);
   - this migration plan document exists;
   - finance aliases are not flipped in this phase;
   - lucky-plan aliases are not flipped in this phase;
   - requests aliases are not flipped in this phase.
3. **A one-line pointer** to this plan from the migration map / Phase 9A report.

Phase 9B.1 performs **no** content move. (Per the brief, content movement is
allowed only for a single, extremely safe, separately justified route; none is
justified here, so none is moved.)

## Out of scope — deferred to Phase 9B.2+

- Actually moving any page body or flipping any redirect.
- Adding the legacy `/admin/customer-advances` `ROUTES` constant.
- Building deferred backend aggregates (winners, customer-analytics,
  vendor-returns, vendor ledger/outstanding, customer-credits).
- Resolving `/admin/finance/refunds` (dedicated page vs permanent alias).
- Promoting any settled legacy path to `delete_later` or deleting it.

**Do not proceed to Phase 9B.2 from this phase.**
