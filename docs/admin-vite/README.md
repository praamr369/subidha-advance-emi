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

## Status

Phase A0 is documentation-only and does not authorize implementation work.
