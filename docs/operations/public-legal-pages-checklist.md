# Public Legal Pages Checklist

## Routes
Ensure these public routes load without authentication:
- `/terms`
- `/privacy`
- `/refund-cancellation`
- `/warranty`
- `/delivery-policy`
- `/rental-lease-policy`
- `/lucky-plan-policy`
- `/direct-sale-policy`
- `/payment-policy`
- `/service-policy`
- `/grievance`
- `/data-requests`
- `/business-compliance`
- `/udyam-msme`
- `/policies`

## API checks
- `GET /api/v1/public/policies/` returns published rows only.
- `GET /api/v1/public/policies/<slug>/` returns 404 for draft/archived rows.
- `GET /api/v1/public/business-compliance/summary/` excludes private document fields.

## Content safety checks
- No fake GST/Udyam/license numbers.
- Registration absent -> show safe placeholder text.
- No private document exposure in public pages.
- Lucky Plan policy preserves future-EMI waiver-only rule.
- Refund/warranty/delivery language avoids unsupported guarantees.

## Footer/navigation checks
- Public footer includes policy links and works without login.

## Regression checks
- Policy publish/edit flows do not alter:
  - product base price
  - EMI/payment/ledger truth
  - draw/commission/payout/reconciliation history
