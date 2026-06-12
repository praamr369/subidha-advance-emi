# Phase P10 — Public policies and rules hub

Scope: public policy/rules navigation and customer-facing clarity.

## Implemented

- Replaced the old `/policies` banner with a dedicated policies hub hero.
- Added a rules navigator for:
  - Lucky Plan / Advance EMI
  - Rent and lease
  - Direct sale
  - Delivery and handover
  - Payment and receipt safety
  - KYC, service, and compliance
- Added an operational rule summary that reuses existing public policy constants from `frontend/src/lib/public-content.ts`.
- Preserved the backend-driven published policy list from `listPublicPolicies()`.
- Preserved route mapping for admin-published legal pages.

## Safety contract

The policies hub may:

- explain public-facing policy content
- link to public policy and route pages
- show admin-published legal policy cards
- guide customers to contact/apply/products routes

The policies hub must not:

- create contracts
- assign Lucky IDs
- create payment, receipt, invoice, deposit, delivery, accounting, reconciliation, commission, or payout records
- show unpublished policy drafts
- invent compliance numbers or legal registrations

## Required checks

```bash
cd frontend
npm run lint
npm run typecheck
npm run build:smoke
```

Manual routes to inspect:

```text
/policies
/lucky-plan
/rent
/lease
/direct-sale
/contact
```
