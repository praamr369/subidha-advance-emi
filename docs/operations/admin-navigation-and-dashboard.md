# Admin Navigation and Dashboard

This pass consolidates admin navigation and dashboard surfaces into an operations-first structure without removing existing routes.

## Navigation

- Admin sidebar groups are normalized into operational domains.
- Duplicate top-level create entries are demoted from sidebar grouping (routes remain available via quick actions and direct URLs).
- Sidebar collapsed flyouts now include:
  - quick actions
  - live badge counts (from `/api/v1/admin/dashboard/navigation-badges/`)
  - recent route shortcuts
  - one primary action link

## Badge Contract

`GET /api/v1/admin/dashboard/navigation-badges/` returns:

- `outstanding_count`
- `overdue_count`
- `pending_delivery_count`
- `pending_return_count`
- `pending_refund_count`
- `pending_reversal_count`
- `open_support_ticket_count`
- `low_stock_count`
- `inspection_stock_count`
- `unreconciled_count`
- `pending_draw_count`

Counts are read-only and scoped to active operational queues.

## Dashboard usability notes

- Admin dashboard should present a command-center structure with:
  - financial posture highlights
  - queue pressure indicators
  - launch cards for key operational workflows
- If any summary endpoint is unavailable, show safe empty/error cards instead of synthetic KPI values.
- Keep reversal and return controls visible only in relevant operational contexts.
