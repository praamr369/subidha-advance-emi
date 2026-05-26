# Contract Amendment Phase 2 UI Addendum

Status: implemented and stabilized on `update`.

## UI routes

Customer:

```text
/customer/contract-amendments
/customer/contract-amendments/new
/customer/contract-amendments/[id]
```

Partner:

```text
/partner/contract-amendments
/partner/contract-amendments/new
/partner/contract-amendments/[id]
```

Admin:

```text
/admin/contract-amendments
/admin/contract-amendments/[id]
```

## Component ownership

Phase 2 UI components are role-scoped:

- `CustomerList.tsx`, `CustomerCreate.tsx`, and `CustomerDetail.tsx` are customer-only.
- `PartnerList.tsx`, `PartnerCreate.tsx`, and `PartnerDetail.tsx` are partner-only.
- `AdminList.tsx` and `AdminDetail.tsx` are admin-only.

Admin components must not be exported from partner component files.

## Role-safe navigation

The workflow is discoverable through the existing role navigation shell and registry files:

- Customer: `My amendment requests`.
- Partner: `Customer amendment requests`.
- Admin: `Contract Amendments`.

Admin amendment register links are sourced from the admin route registry and are not exposed to customer, partner, cashier, vendor, or public shells. Customer and partner request pages remain scoped to their own route families.

## Endpoint usage

The frontend service uses only the Phase 1 amendment endpoints:

- customer list/create/detail
- partner list/create/detail
- admin list/detail/review/approve/reject

There is no frontend service method for implementation/apply, and no UI calls a contract implementation endpoint.

## Boundary

Phase 2 is UI only. Customer and partner pages submit amendment requests. Admin pages support review, approval decision, and rejection decision only.

Admin approval records a decision. It does not implement the approved values into any source contract or financial schedule.

Direct Sale is not supported by this UI.

## Safety copy

All amendment surfaces must keep the decision-only safety notice clear:

- approval records an admin decision only
- approved amendments are not implemented in this phase
- no EMI, payment, lucky ID, product, rent/lease, accounting, inventory, reconciliation, commission, payout, delivery, stock, or source contract record is changed from this UI

Do not introduce UI labels or actions named `Apply`, `Implement`, `Execute`, or `Update contract` for amendment decisions. Admin approval wording should remain `Approve decision` or `Approve request`.

## Deferred work

- Phase 3 low-risk implementation actions.
- Phase 4 product change implementation.
- Phase 5 lucky ID and batch change implementation.
- Phase 6 future financial obligation recalculation.
