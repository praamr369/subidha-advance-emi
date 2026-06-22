# Admin Vite Migration Risk Register

This register documents the main risks for the admin-vite migration.

Phase A0 is documentation-only, so this register is for planning and control rather than execution.

| Risk | Where it appears | Why it matters | Mitigation | Status |
|---|---|---|---|---|
| Route ownership confusion | Shared admin navigation and module links | A route can appear migrated while the old Next.js admin still owns behavior. | Maintain explicit boundary docs and parity-based cutover rules. | Open |
| Source-of-truth drift | Frontend service layer | The client may accidentally become a second truth source. | Keep backend and DB authoritative; normalize only in client helpers. | Open |
| Finance behavior regression | Payments, billing, accounting, reconciliation | Any accidental change here can affect money and audit history. | Hard prohibition on behavior change until separate approval and tests exist. | Open |
| EMI schedule drift | Lucky Plan and subscriptions | EMI changes can corrupt contract history and customer expectations. | Preserve existing schedule logic and do not redesign it in the client. | Open |
| Stock truth mismatch | Inventory and delivery | Inventory and delivery status are easy to confuse in the UI. | Keep stock, delivery, and accounting as separate modules and separate states. | Open |
| Role leakage | Admin, customer, partner, vendor surfaces | Wrong roles seeing the wrong data is a privacy and operational risk. | Enforce role-based route and data boundaries in both app shell and service layer. | Open |
| Unsupported endpoint assumption | Any module | The new client may assume an API shape that does not exist. | Treat missing contract pieces as backend gaps, not frontend workarounds. | Open |
| Parity testing gap | Module cutover | A module can be flipped too early if parity is incomplete. | Require documented parity testing before replacement. | Open |
| Fallback removal too soon | Existing Next.js admin | Removing the fallback too early can break live operations. | Keep old admin until the module has proven safe after cutover. | Open |
| Audit trace loss | Payment, accounting, reconciliation, delivery | UI simplification can accidentally hide important traceability. | Preserve source-linked views and show audit-relevant references. | Open |
| Hidden migration pressure | Cross-team implementation | Teams may try to use the docs phase to sneak in code changes. | Keep this phase documentation-only and review diffs carefully. | Open |
| Data-mapping ambiguity | Reports and dashboards | Different dashboards can show the same concept differently. | Name metrics clearly and prefer backend-sourced, source-linked values. | Open |
| Rollback uncertainty | Cutover release | Without a fallback plan, a bad module swap can block work. | Keep the Next.js admin fallback and define rollback at module granularity. | Open |

## Highest priority controls

The highest-risk areas are:

1. payments
2. accounting
3. reconciliation
4. inventory
5. EMI / subscription flows

These areas should be treated as cutover-critical and never changed casually.

## Risk review rule

Before any module is replaced, the team should be able to answer:

- What changed?
- What stayed the same?
- What data is authoritative?
- What is the rollback path?
- Which role is affected?
- Which operational queue might be disrupted?

If any answer is unclear, the module is not ready for cutover.

## M1 Dashboard — risk notes

- Dashboard is read-only. No mutations, no posting, no collection actions.
- All KPI values come from `/api/v1/admin/dashboard/` which is cached 60s server-side. admin-vite does not fabricate any number.
- Money formatting is display-only (Intl.NumberFormat); no financial calculations.
- Reconciliation exceptions are shown as-is from backend; no client-side delta computation.
- Risk assessment numbers (healthy/at_risk/high_risk/defaulted) come from backend risk engine.
- API gap: no stock/inventory alerts in dashboard response. No accounting bridge alerts embedded in dashboard.
- API gap: `/admin/dashboard/` has no date-window filtering. Future enhancement may consume `/dashboards/summary-v2/` which supports window params.

## M2 Customers Workbench — risk notes

- Customer list, detail, create, edit, and KYC decisions all use existing `/admin/customers/` ViewSet endpoints. No new backend endpoints were created.
- KYC decision flow calls backend `approve_kyc()`/`reject_kyc()` service functions via the `kyc-decision` action — admin-vite does not implement any KYC state machine logic.
- Subscription aggregates (active count, due amounts, contract values) are backend-computed via annotated subqueries. The frontend displays but does not derive these.
- Money values displayed via `formatMoney()` (Intl.NumberFormat) — no financial calculations.
- Delete mutation is wired but not exposed in the UI (no delete button). Available for future use with appropriate confirmation safeguards.
- Customer form validation (Zod) is UX-only. Backend validation is authoritative for all writes.
- API gap: no inline subscription/payment detail on customer — only aggregate counts and amounts are available from the customer serializer. Individual records require separate module endpoints.
- API gap: no customer timeline/activity log endpoint confirmed in admin customer routes. `AdminCustomerTimelineView` exists but its route is not yet consumed.
- API gap: KYC document management (upload, list, download) is available via separate endpoints but not yet wired into the customers workbench UI.
