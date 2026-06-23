# Customer 360 Specification

Customer 360 is the first full linked-data workbench.

## Route

`/admin/customer-360`

## Primary backend anchor

`GET /api/v1/admin/customers/{id}/operational-summary/`

The endpoint is confirmed in the Django admin route family. Payload fields must
still be normalized through the existing frontend service layer.

## Required areas

- customer list and search
- create and edit drawer
- KYC status and approved actions
- business summary
- subscriptions
- EMIs
- payments
- receipts
- direct sales
- rent and lease contracts
- deliveries
- service and support
- CRM timeline
- documents
- notes

## Rules

- do not calculate balances in the browser
- do not merge payment, waiver, delivery, and contract states
- do not invent missing timeline or document records
- use backend validation messages for create, edit, and KYC actions
- keep current customer routes available until parity is proven

## Phase 1 state

The route shell exists and links to current customer, KYC, party, advance, and
support workflows. Joined-data rendering is deferred to Phase 2.
