# Customer service & issue management desk

## Purpose

The **Issue Management Desk** gives customers a structured way to raise operational questions (TKT numbers) and gives admins a single queue to triage, assign, link to subscriptions/payments/deliveries, and close work **without** changing financial truth (EMI rows, payments, waivers, ledger, commissions, payouts, lucky draw).

Legacy **support-requests** (`CustomerSupportRequest`) and **service-desk cases** (`ServiceDeskCase`) remain unchanged; TKT tickets are additive.

## Ticket numbers

- Format: `TKT-{FY}-{NNNNN}` (Indian financial year from `financial_year_for`, 5-digit sequence).
- Sequences use `DocumentSequence` rows per FY (`series_code` like `SUPPORT_TKT_2025_26`, `prefix` `TKT-2025-26`).

## APIs

### Customer (`/api/v1/customer/support/tickets/`)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/` | Query `tab`: `open`, `waiting_customer`, `resolved`, or omit for all |
| POST | `/` | Create; optional `link_type` + `link_object_id` |
| GET | `/{id}/` | Detail; no internal notes or internal timeline events |
| POST | `/{id}/comment/` | Public comment |
| POST | `/{id}/reopen/` | After resolved/closed/rejected |

### Admin (`/api/v1/admin/support/`)

| Method | Path |
|--------|------|
| GET | `/dashboard/` |
| GET/POST | `/tickets/` |
| GET/PATCH | `/tickets/{id}/` |
| POST | `/tickets/{id}/assign/` (body: `assignee_id`, null to unassign) |
| POST | `/tickets/{id}/comment/` |
| POST | `/tickets/{id}/internal-note/` |
| POST | `/tickets/{id}/link/` |
| POST | `/tickets/{id}/resolve/` |
| POST | `/tickets/{id}/reject/` |
| POST | `/tickets/{id}/close/` |
| POST | `/tickets/{id}/reopen/` |

## Frontend

- Customer: `/customer/support`, `/customer/support/new`, `/customer/support/[id]`.
- Admin: `/admin/service-desk` (queue + KPI), `/admin/service-desk/[id]` (detail).

## Operations notes

- Linking validates that operational rows belong to the ticket’s customer when a customer is set.
- **Attachment** `FileField` exists on `SupportTicketAttachment`; upload wiring can be added later without schema breaks.
- Cashier-specific scopes were not added; only **CUSTOMER** and **ADMIN** are enforced on these routes.

## Deployment

Apply migration `service_desk.0003_support_ticket_desk` after deploy.
