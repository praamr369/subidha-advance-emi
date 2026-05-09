# Username Change Policy

## Scope
- Username is a login identifier only.
- Username changes must never mutate customer, partner, subscription, invoice, receipt, payment, commission, KYC, or audit business identities.

## Role Policy
- Customer self-service is allowed with current password verification.
- Partner self-service is allowed with current password verification.
- Admin-assisted username change is allowed for customer and partner accounts only, and requires a reason.
- Non-admin roles cannot use admin username-change endpoints.
- Vendor username flow remains unchanged.

## Validation Rules
- Username is normalized to lowercase and trimmed.
- Username must be unique case-insensitively across users.
- Username must not be blank, must not contain spaces, and must only use letters, numbers, `.`, `_`, and `-`.
- Username must respect length limits (minimum 4, maximum auth model limit).
- Reserved values are blocked, including: `admin`, `root`, `superuser`, `support`, `subidha`, `subidhafurniture`, `cashier`, `customer`, `partner`, `vendor`, `api`, `login`, `logout`, `test`, `null`, `system`.
- Old usernames are reserved in `reserved_usernames` to avoid reuse confusion.

## Audit and Safety
- Every username change writes `username_change_audits` with:
  - target user
  - old/new username
  - actor and actor role
  - source (`SELF` or `ADMIN`)
  - reason (required for admin)
  - changed_at
  - ip_address and user_agent when available
- Existing `AuditLog` entries are appended (no historical deletion).

## Session / Token Behavior
- Existing outstanding refresh tokens are blacklisted after a username change.
- API returns `requires_relogin: true` when change is applied.
- Frontend forces sign-out and asks user to sign in again after self-service success.

## API Endpoints
- `PATCH /api/v1/customer/profile/username/`
- `PATCH /api/v1/partner/profile/username/`
- `PATCH /api/v1/admin/users/{id}/username/`
