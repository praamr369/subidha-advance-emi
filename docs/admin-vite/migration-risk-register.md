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
