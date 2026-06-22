# Admin Vite Boundary

This document defines the non-negotiable boundary for the admin-vite migration.

The purpose of admin-vite is to create a new admin client without disturbing the systems that already hold operational truth.

## Boundary statement

admin-vite is only a frontend client.

It must not become a second business system, a second financial system, or a second source of stock truth.

The backend remains authoritative for:

- EMI schedule rules
- payment posting
- reconciliation state
- accounting postings
- inventory truth
- delivery truth
- role enforcement
- audit history

The database remains authoritative for persisted business records.

## Hard boundary rules

| Boundary | Rule |
|---|---|
| Backend business logic | Must remain unchanged unless a separate approved backend change is requested. |
| Database schema and migrations | Must remain unchanged in this phase. |
| EMI logic | Must remain unchanged. |
| Payment logic | Must remain unchanged. |
| Accounting logic | Must remain unchanged. |
| Stock / inventory logic | Must remain unchanged. |
| Customer-facing Next.js app | Must remain active. |
| Partner-facing Next.js app | Must remain active. |
| Vendor-facing Next.js app | Must remain active. |
| Public site | Must remain active. |
| Existing Next.js admin | Must remain the fallback until parity is proven. |

## Role boundary

admin-vite is for internal admin use only.

It must preserve role separation and must not blur admin access with public, customer, partner, or vendor access.

If a workflow is not clearly admin-owned, it does not belong in the new admin client until ownership is confirmed.

## Module boundary

Target admin modules are defined as the operational surface area that may be migrated into admin-vite over time.

| Module | Boundary note |
|---|---|
| Dashboard | Command-center entry for operational queues and overview cards. |
| Customers | Customer profile, search, and linked operational records. |
| Products | Product catalog and product-operational maintenance. |
| Lucky Plan | Lucky Plan setup, batch, draw, and plan administration. |
| Subscriptions | Subscription lifecycle and contract management. |
| Payments | Payment capture, review, and payment history. |
| Billing | Billing and invoice-facing admin operations. |
| Inventory | Stock, movement, and stock-related admin control. |
| Delivery | Delivery and fulfillment administration. |
| Rent/Lease | Future and current rent/lease operational surfaces. |
| Accounting | Journals, ledgers, books, and posting oversight. |
| Reconciliation | Mismatch review and settlement verification. |
| Reports | Read-only operational and financial reporting. |
| Settings | Configuration, masters, and governance surfaces. |

## What admin-vite is not

admin-vite is not:

- a backend rewrite
- a schema migration program
- a replacement database
- a place to invent missing API fields
- a place to shortcut reconciliation or accounting
- a place to bypass current Next.js admin before parity is proven

## Cutover boundary

A module is not considered migrated until the new admin-vite version is functionally equivalent for the approved scope and the old Next.js admin version can safely remain as fallback.

The cutover is module-by-module.

There is no global flip until each replaced module has passed parity testing.

## Parity criteria

Parity for a module should confirm:

- same route intent
- same data shown to the same role
- same read/write permissions
- same validation and error feedback
- same money-sensitive guardrails
- same safe empty-state behavior
- same audit-sensitive handling

## Safety principle

When there is any ambiguity about ownership, the safest rule applies:

keep the existing source of truth and document the gap before changing behavior.
