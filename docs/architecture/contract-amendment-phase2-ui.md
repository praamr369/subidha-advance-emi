# Contract Amendment Phase 2 UI Addendum

Status: implemented on `update`.

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

## Endpoint usage

The frontend service uses only the Phase 1 amendment endpoints:

- customer list/create/detail
- partner list/create/detail
- admin list/detail/review/approve/reject

There is no frontend method for implementation/apply.

## Boundary

Phase 2 is UI only. Customer and partner pages submit amendment requests. Admin pages support review, approval, and rejection only.

Direct Sale is not supported by this UI.

## Deferred work

- Sidebar/registry link polishing if route registry updates are required.
- Phase 3 low-risk implementation actions.
- Phase 4 product change implementation.
- Phase 5 lucky ID and batch change implementation.
- Phase 6 future financial obligation recalculation.
