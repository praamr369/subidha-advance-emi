# Support ticket lifecycle (TKT)

## Categories

Tickets use `SupportTicketCategory` values such as `SERVICE_REQUEST`, `RETURN_REQUEST`, `WARRANTY_CLAIM`, `DELIVERY_ISSUE`, `PRODUCT_DAMAGE`, `PAYMENT_ISSUE`, `EMI_QUERY`, `RENT_QUERY`, `LEASE_QUERY`, `DIRECT_SALE_QUERY`, `DOCUMENT_CORRECTION`, `CUSTOMER_PROFILE_UPDATE`, `LUCKY_DRAW_QUERY`, `PARTNER_COMPLAINT`, `GENERAL_SUPPORT`.

Categories describe **intent** only; they do not trigger financial workflows.

## Status model

| Status | Meaning |
|--------|---------|
| OPEN | New |
| ACKNOWLEDGED | Seen by staff |
| IN_REVIEW | Under analysis |
| WAITING_FOR_CUSTOMER | Need customer input |
| WAITING_FOR_INTERNAL_ACTION | Need internal follow-up |
| RESOLVED | Outcome recorded (`resolved_at`) |
| REJECTED | Declined with reason (`resolution_summary`, closed timestamps) |
| CLOSED | Closed (`closed_at`) |
| REOPENED | Customer or staff reopened from a terminal state |

**PATCH** `status` adjusts workflow states only. Terminal outcomes should use **resolve**, **reject**, or **close** actions so timestamps and audit events stay consistent.

## Priority

`LOW`, `NORMAL`, `HIGH`, `URGENT` — operational only; not exposed to customers on create (defaults to `NORMAL`).

## Audit events

`SupportTicketEvent` records: `created`, `commented`, `internal_note_added`, `assigned`, `linked`, `priority_changed`, `status_changed`, `resolved`, `closed`, `reopened`.

Customer-facing timeline omits `commented` events (comment bodies live on `SupportTicketComment`) and omits `internal_note_added` events.

## Linking rules

`SupportTicketLink` connects one operational row per link row: customer, subscription, EMI, payment, product, batch, lucky ID, direct sale, billing invoice, delivery, rent profile, lease profile, or CRM partner.

Links are **references**; they must not mutate linked rows.

## Financial integrity

Tickets and comments **must not** post payments, change EMI status, apply waivers, alter reconciliation, commissions, payouts, or lucky-draw outcomes. Those actions stay in their dedicated services and APIs.

## Rent / lease

Rent and lease “contracts” link to `RentSubscriptionProfile` and `LeaseSubscriptionProfile` IDs, keeping parity with subscription-centric contracts without duplicating contract financial logic.
