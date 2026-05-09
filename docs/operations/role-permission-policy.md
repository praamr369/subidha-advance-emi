# Role Permission Policy (Username Change)

## Allowed Username Actions
- `CUSTOMER`:
  - can change own username via `/api/v1/customer/profile/username/`
  - cannot change any other user's username
- `PARTNER`:
  - can change own username via `/api/v1/partner/profile/username/`
  - cannot change any other user's username
- `ADMIN`:
  - can change usernames for `CUSTOMER` and `PARTNER` users via `/api/v1/admin/users/{id}/username/`
  - reason is mandatory
  - cannot use this endpoint for non-customer/non-partner role targets

## Protected Targets
- Staff/superuser target username updates are blocked for non-superuser admins.
- Non-admin users are denied access to admin username-change routes.

## Operational Guarantees
- Username changes are additive and audit-logged.
- Customer ID, partner ID, subscription/contract IDs, invoice numbers, receipt numbers, payment rows, commission rows, and KYC records remain unchanged.
- Financial posting logic, draw logic, reconciliation, waiver logic, and stock/accounting posting remain unchanged.
