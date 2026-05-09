# Role Notification Policy

## Objective

Notifications must be role-scoped, readable, and operationally actionable without leaking private data.

## Role Scope

- Customer notifications: only recipient customer account events
- Partner notifications: only recipient partner account events
- Vendor notifications: only recipient vendor account events
- Admin/cashier use existing scoped channels

## Display Rules

- Show unread count, latest items, and created time
- Prefer business language over raw model/ID terminology
- Keep mark-read optional based on available endpoint support
- Show loading, empty, and error states explicitly.
- Show actionable links only when provided by payload/API.
- On mobile, use a viewport-safe dropdown/sheet with touch-friendly targets.
- Unread badge must remain visible and not clipped by shell chrome.

## Exclusion Rules

- Exclude cross-user data leakage
- Exclude admin-only internals from non-admin roles
- Exclude cancelled/reversed/void/archived records from active alerts where source producer already suppresses them

## Technical Notes

- Role-specific read-only notification routes are available under:
  - `/api/v1/customer/notifications/`
  - `/api/v1/partner/notifications/`
  - `/api/v1/vendor/notifications/`
- Summary routes are available under each role namespace.
- Bell/dropdown and full notification pages must consume the same role-scoped APIs.
- If a mark-read endpoint is unavailable for a role/surface, hide mark-read action instead of simulating success.
