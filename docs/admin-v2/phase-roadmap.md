# Admin V2 Phase Roadmap

This roadmap follows the handover sequence for the Vite migration.

## Phase 0 - Audit and architecture docs

Status:

- current phase

Deliverables:

- this documentation pack
- workbench map
- legacy route map
- backend API map
- backend gap log
- duplicate route removal plan
- Customer 360 spec
- Revenue Workbench spec

Exit criteria:

- the intended V2 shape is documented
- backend gaps are visible
- no UI behavior has been changed as part of phase 0

## Phase 1 - Vite admin shell

Goal:

- create the desktop-style shell around the 8 workbenches

Deliverables:

- admin shell
- sidebar with 8 workbenches only
- top command bar
- auth guard
- permission guard
- API health indicator
- right drawer framework
- reusable grid and drawer primitives

## Phase 2 - Customer 360

Goal:

- build the first full workbench

Exit criteria:

- customer list
- create/edit drawers
- KYC visibility
- operational summary
- linked subscriptions, EMIs, payments, receipts, delivery, and service data

## Phase 3 - Revenue Workbench

Goal:

- unify sales, billing, Lucky Plan, subscriptions, rent/lease, and collections

Exit criteria:

- direct sale
- Lucky Plan review
- EMI review
- payments
- receipts
- outstanding
- settlement visibility

## Phase 4 - Inventory & Fulfillment

Goal:

- consolidate products, stock, vendors, deliveries, returns, and service desk

## Phase 5 - Finance Control

Goal:

- consolidate money truth, reconciliation, accounting visibility, and audit review

## Phase 6 - CRM, Operations, Reports, Setup

Goal:

- finish the remaining workbenches

## Phase 7 - Parity and cleanup

Goal:

- verify parity
- remove duplicate V2 route noise
- keep the legacy Next.js admin only as long as fallback is needed

Validation targets:

- typecheck
- lint
- build
- smoke checks for key admin workflows

