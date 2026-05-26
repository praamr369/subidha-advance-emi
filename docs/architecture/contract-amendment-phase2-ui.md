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

The frontend service uses the Phase 1 amendment endpoints plus the Phase 3 admin-only implementation endpoint:

- customer list/create/detail
- partner list/create/detail
- admin list/detail/review/approve/reject
- admin implement for approved whitelisted non-financial corrections

There is no frontend apply/execute/update-contract method. Customer and partner UI never call implementation.

## Phase 3 boundary

Phase 2 is UI only. Phase 3 adds a guarded admin action for only whitelisted non-financial corrections.

Admin approval records a decision. Implementation requires a separate admin action after approval.

Direct Sale is not supported by this UI.

## Safety copy

All amendment surfaces must keep the guarded safety notice clear:

- Phase 3 supports only whitelisted non-financial corrections
- financial and contract-value amendments remain blocked/deferred
- no EMI, payment, lucky ID, product, rent/lease billing, deposit, accounting, inventory, reconciliation, commission, payout, delivery, stock, or source contract financial record is changed from this UI

Do not introduce UI labels or actions named `Apply change`, `Execute`, `Update contract`, or `Implement amendment`. The allowed Phase 3 button label is `Implement approved non-financial correction`.

## Deferred work

- Phase 3 low-risk implementation actions.
- Phase 4 product change implementation.
- Phase 5 lucky ID and batch change implementation.
- Phase 6 future financial obligation recalculation.
