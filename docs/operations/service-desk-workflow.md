# Service Desk Workflow

## Current operational modules
Service Desk currently runs through two real backends:
1. Case management (`service_desk.ServiceDeskCase`) via `/api/v1/service-desk/*` (admin)
2. Ticket management (`service_desk.SupportTicket`) via:
   - `/api/v1/admin/support/*` (admin)
   - `/api/v1/customer/support/tickets/*` (customer self-service)

## Case desk flow (admin)
1. Intake from complaint/support or direct operational case creation.
2. Link source records: support request, subscription, delivery, billing invoice, direct sale.
3. Move case status through explicit transitions (`OPEN`, `UNDER_REVIEW`, `AUTHORIZED`, `IN_SERVICE`, `RESOLVED`, `CLOSED`, etc.).
4. Trigger controlled downstream actions where applicable:
   - delivery return request/complete
   - credit note posting
   - debit note posting
   - replacement sale linkage

These actions stay in existing billing/delivery/inventory/accounting services and preserve auditability.

## Ticket desk flow (customer + admin)
- Customer creates own ticket from portal (`TKT-*` numbering).
- Admin triages, assigns, links operational records, comments, resolves/rejects/closes/reopens.
- Timeline and event log are persisted in:
  - `SupportTicketEvent`
  - `SupportTicketComment`

## Data safety rules in implementation
- Ticket links validate customer ownership where the linked object is customer-attributable.
- Linking never mutates the linked financial/document records.
- Internal notes are hidden from customer responses.

## Role boundaries
- Admin: full support and case controls.
- Customer: own tickets only.
- Partner/Cashier: no admin service-desk controls through these endpoints.

## Future additive proposals (not implemented yet)
- Attachment upload endpoint activation for support tickets.
- SLA breach escalations and queue aging flags per ticket/case.
