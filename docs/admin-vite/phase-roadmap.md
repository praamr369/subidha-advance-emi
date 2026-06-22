# Admin Vite Phase Roadmap

This roadmap describes the documentation-first migration path for admin-vite.

The roadmap is intentionally conservative:

- no backend business logic change
- no database migration change
- no EMI / payment / accounting / stock behavior change
- no premature removal of the existing Next.js admin fallback

## Phase A0 — Boundary documentation

Status: current phase.

Goal:

- define the admin-vite boundary
- lock the source-of-truth rules
- document the API contract assumptions
- register migration risks
- publish the module roadmap

Completion signal:

- these docs exist and are reviewed
- no code path has been changed as part of this phase

## Phase A1 — Client shell preparation

Goal:

- plan the admin-vite shell
- define shared layout expectations
- define route grouping and module entry points
- map role-based navigation

Non-goals:

- no backend changes
- no database changes
- no business logic migration

Completion signal:

- the client shell can be planned without depending on new backend behavior

## Phase A2 — Read-only module parity

Goal:

- establish read-only parity for non-mutating surfaces first
- cover the dashboard and review-style screens
- verify that data shown in admin-vite matches existing admin behavior

Candidate modules:

- Dashboard
- Reports
- Reconciliation views
- Settings read surfaces

Completion signal:

- users can compare admin-vite and the current admin for the same read-only surface and see equivalent operational information

## Phase A3 — Core operational module parity

Goal:

- migrate the high-use admin modules one at a time
- keep the old Next.js admin available as fallback
- preserve validation, role access, and source-trace behavior

Candidate modules:

- Customers
- Products
- Lucky Plan
- Subscriptions
- Payments
- Billing
- Inventory
- Delivery

Completion signal:

- each module passes parity testing before replacement
- no financial, stock, or audit behavior changes appear during the swap

## Phase A4 — Rent/Lease and accounting-adjacent parity

Goal:

- extend admin-vite to cover current and future rent/lease workflows
- preserve accounting and reconciliation integrity
- ensure module boundaries stay separate

Candidate modules:

- Rent/Lease
- Accounting
- Reconciliation

Completion signal:

- rent/lease and accounting-related surfaces are migrated only after they match the existing admin behavior and remain audit-safe

## Phase A5 — Full module cutover

Goal:

- replace module-by-module coverage only after parity is proven
- keep the fallback admin available until replacement is stable

Cutover rule:

- a module is replaced only after parity testing

Completion signal:

- every migrated module has been verified in production-like testing
- the old Next.js admin can remain only as fallback for whatever is still pending

## Phase A6 — Fallback retirement review

Goal:

- review whether any fallback admin routes are still needed
- identify compatibility dependencies
- decide whether the old Next.js admin can be reduced or retired

This phase should not begin until:

- all critical admin modules have parity approval
- operational staff no longer depend on the fallback for normal work
- rollback ownership is documented

## Practical parity checklist

For each module, confirm:

- route is reachable
- same role can access it
- loading state is present
- empty state is honest
- error state is clear
- data matches the source of truth
- safe actions are available
- unsafe actions are blocked
- audit-sensitive details remain visible
- rollback path is known

## Roadmap principle

We should move slowly where money, stock, and audit history are involved, and only replace a module when the replacement has proven that it behaves the same way for real shop work.

## M3.1 — Backend and existing frontend integrity check

Status: complete, with one documented route-registry warning.

Backend validation:

- `python manage.py check` passed
- `python manage.py makemigrations --check --dry-run` passed
- Focused backend tests passed: 27 tests covering product, public, and customer-facing surfaces

Existing Next.js frontend validation:

- `npm run typecheck` passed
- `npm run lint` passed
- `npm run build` passed
- `npm run check:routes` reported missing admin parent sidebar module entries for existing admin sections, but the Next.js build still enumerated the admin, public, customer, partner, and vendor routes

admin-vite validation:

- `npm run typecheck` passed
- `npm run lint` passed
- `npm run build` passed

Route and boundary verification:

- old Next.js admin routes still exist
- public website routes still exist
- customer portal routes still exist
- partner portal routes still exist
- vendor portal routes still exist
- admin-vite routes build successfully
- no backend business endpoints were changed in this phase

Blockers before M4:

- no backend or build blocker from this phase
- the route-registry warning should be tracked if `check:routes` is used as a release gate
