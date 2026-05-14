# Rent/Lease Contracts (Current Code)

This document describes the **current implemented behavior** in this repository.

## Confirmed current implementation
- Rent and lease are first-class contract types using `Subscription.plan_type` = `RENT` or `LEASE`.
- Contract creation runs through service-layer workflows:
  - `subscriptions.services.rent_lease_contract_service.create_rent_contract`
  - `subscriptions.services.rent_lease_contract_service.create_lease_contract`
- Rent/lease profile models are separate and additive:
  - `RentSubscriptionProfile`
  - `LeaseSubscriptionProfile`
- Security deposit percent is validated to 20%–30%.
- Rent/lease contract creation creates:
  - subscription row
  - rent/lease profile row
  - contract number/reference
  - product possession record
  - audit log event

## Contract lifecycle and operations
- Admin APIs exist for:
  - contract create (rent/lease)
  - contract PDF
  - possession create/handover/return-initiate
  - return inspection create/record/approve
- Return inspection approval triggers append-only deposit deduction/refund workflows where amounts are provided.

## Financial separation (current behavior)
- Rent/lease monthly demand rows and security deposit demand rows are separate (`RentLeaseBillingDemand`).
- Deposit transactions are append-only (`RentLeaseDepositTransaction`) and include deduction/refund events.
- Unified cashier/admin receivable collection intentionally does **not** post rent/lease monthly collections yet; it is view-only with explicit disabled reason.

## Direct-sale compatibility rule (current hardening)
- Direct-sale creation/update now blocks products with active rent/lease possession records (non-`CLOSED`) to prevent selling assets currently under rent/lease custody.

## Proposed future additive work (not implemented here)
- Dedicated rent/lease monthly collection posting bridge with controlled accounting entries.
- Unit/serial-level asset identity for multi-unit products to avoid product-level blocking limits.
