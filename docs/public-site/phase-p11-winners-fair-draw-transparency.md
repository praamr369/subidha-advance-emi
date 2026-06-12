# Phase P11 — Public winners and Fair Draw transparency

Scope: public winner publication, draw transparency, certificate presentation, privacy boundaries, and customer-readable evidence explanation.

## Implemented

- Added `DrawTransparencyHero` for winner, archive, Fair Draw, and certificate pages.
- Added `DrawEvidenceExplainer` to explain what is public, what stays private, and what public pages cannot do.
- Added `WinnerPublicationCard` for consistent recent winner records.
- Refreshed `/winners` with:
  - animated transparency hero
  - evidence explainer
  - reusable winner cards
- Refreshed `/winner-history` with:
  - animated archive hero
  - evidence explainer
  - existing backend-driven carousel and table preserved
- Refreshed `/lucky-plan/fair-draw` with:
  - animated Fair Draw hero
  - evidence explainer
  - existing latest draw API preserved
- Refreshed `/lucky-plan/fair-draw/[id]` with:
  - animated certificate hero
  - evidence explainer
  - existing summary, certificate, verification, and winner API calls preserved

## Safety contract

Public draw pages may:

- show backend-returned public draw records
- show masked winner display data
- show commitment hash and verification status when available
- explain future-EMI-only winner benefit
- show honest error and empty states

Public draw pages must not:

- execute draw selection
- assign Lucky IDs
- create or modify subscriptions
- create EMI waiver records
- reverse or rewrite paid EMI/payment history
- create payments, receipts, invoices, delivery records, accounting, reconciliation, commission, or payout records
- expose private customer identifiers, phone numbers, addresses, KYC IDs, private documents, or staff-only evidence

## Required checks

```bash
cd frontend
npm run lint
npm run typecheck
npm run build:smoke
```

Manual routes to inspect:

```text
/winners
/winner-history
/lucky-plan/fair-draw
/lucky-plan/fair-draw/<published-draw-id>
/lucky-plan
```
