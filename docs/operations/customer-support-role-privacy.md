# Customer Support Role Privacy

## Role access policy in current code

### Admin
- Can access CRM admin workspace and party timeline APIs.
- Can access admin support-ticket APIs.
- Can access service-desk case APIs.

### Customer
- Can access only own support tickets:
  - list/create own tickets
  - view own ticket detail
  - comment on own ticket
  - reopen own closed/resolved/rejected ticket
- Internal notes are excluded from customer responses.

### Partner
- Partner payment/subscription APIs are partner-scoped.
- Partner does not receive admin CRM/service-desk controls through admin endpoints.

### Cashier
- Cashier operational APIs remain collection/workflow scoped.
- Cashier does not receive admin CRM/service-desk controls through admin endpoints.

## Privacy and finance controls
- CRM/service-desk links are contextual references only.
- Private customer finance is not exposed through partner-scoped endpoints outside partner-owned records.
- Customer support pages do not expose admin-only internal notes or controls.

## Endpoint-level guardrails
- Admin CRM and admin support APIs require admin role.
- Customer support APIs require customer role and ownership checks.

## Future additive proposals (not implemented yet)
- Field-level masking policies by role for additional personal/contact fields.
- Configurable branch-level support visibility overlays for larger multi-branch deployments.
