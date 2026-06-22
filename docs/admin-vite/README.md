# Admin Vite Migration Documentation

This directory documents the admin-only Vite migration boundary for SUBIDHA CORE.

This is documentation only.
It does not change backend behavior, database state, or frontend code.

## What admin-vite is

Admin-vite is a new frontend admin client.
It is being documented as a separate admin presentation layer that will consume the existing backend and existing database.

## What stays the source of truth

- Existing Django backend remains the source of truth for business logic.
- Existing database remains the source of truth for persisted operational data.
- Existing Next.js frontend remains active for public, customer, partner, and vendor experiences.
- Existing Next.js admin remains available as the fallback admin client during migration.

## Hard restrictions for this migration

- no backend business logic change
- no database migration change
- no EMI behavior change
- no payment behavior change
- no accounting behavior change
- no stock behavior change

## Target admin modules

The admin-vite client is expected to cover these modules:

- Dashboard
- Customers
- Products
- Lucky Plan
- Subscriptions
- Payments
- Billing
- Inventory
- Delivery
- Rent/Lease
- Accounting
- Reconciliation
- Reports
- Settings

## Cutover rule

A module may be replaced only after parity testing confirms the new admin-vite surface matches the current admin behavior closely enough for operational use.

Parity means the replacement module must match:

- route coverage
- role visibility
- data visibility
- loading, empty, and error states
- safe action availability
- source-of-truth data
- audit-sensitive behavior

## Read these files first

- [admin-vite-boundary.md](./admin-vite-boundary.md)
- [api-contract.md](./api-contract.md)
- [migration-risk-register.md](./migration-risk-register.md)
- [phase-roadmap.md](./phase-roadmap.md)

## Implementation status

| Phase | Description | Status |
|---|---|---|
| A0 | Boundary documentation | Done |
| A1 | Vite + React + TS scaffold | Done |
| A2 | Admin shell and enterprise layout | Done |
| A3 | Auth and permission bridge | Done |
| A4 | API client and server-state layer | Done |
| A5 | Shared enterprise UI foundation | Done |
| A6 | Foundation verification and hardening | Done |

## Verified auth contract

Backend auth endpoints (confirmed against `backend/api/v1/routes/auth.py`):

| Action | Method | Path |
|---|---|---|
| Login | POST | `/api/v1/auth/login/` |
| Refresh | POST | `/api/v1/auth/refresh/` |
| Logout | POST | `/api/v1/auth/logout/` |
| Current user | GET | `/api/v1/auth/me/` |

Backend roles (from `backend/api/v1/permissions.py`): ADMIN, PARTNER, CUSTOMER, CASHIER, VENDOR, STAFF.
