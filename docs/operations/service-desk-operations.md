# Service Desk Operations

This guide defines the additive return, exchange, complaint, and after-sales service workflow introduced in the service-desk pass.

## Scope

The service desk does not replace:

- support request truth
- delivery truth
- billing document truth
- inventory ledger truth
- accounting journal truth

It coordinates those modules through explicit service-layer actions.

## Core records

- Complaint intake remains anchored in `CustomerSupportRequest`.
- Service-desk work is tracked in `ServiceDeskCase`.
- Item-level return or service detail is tracked in `ServiceDeskCaseLine`.
- Credit notes and debit notes remain billing documents.
- Stock return for EMI delivery remains the delivery bridge.
- Stock return for direct-sale return remains the posted credit note stock effect.

## Case types

- `COMPLAINT`
  Use when a support issue needs a bounded operator case beyond the original intake request.
- `SALES_RETURN`
  Use for direct-sale or invoice-linked retail returns.
- `DELIVERY_RETURN`
  Use for subscription delivery pickup return flows.
- `EXCHANGE`
  Use for return-plus-replacement scenarios. Do not edit the original sale lines in place.
- `SERVICE`
  Use for after-sales service, repair, inspection, or warranty handling.

## Return workflow

1. Create a service-desk case and link the source invoice, direct sale, delivery, support request, or subscription.
2. Review the line-level quantity, amount, and stock disposition.
3. Move the case to `AUTHORIZED` before posting finance documents.
4. For direct-sale returns or exchanges:
   - post the service-desk credit note action
   - let the posted credit note create the stock inward when `stock_effect` is required
5. For delivery-linked EMI returns:
   - request the delivery return from the case
   - complete the delivery return from the case
   - let the existing delivery bridge create the stock inward
6. Resolve and close the case explicitly after operational completion.

## Exchange workflow

1. Create an `EXCHANGE` case.
2. Authorize the return side first.
3. Post the credit note on the original billing side when applicable.
4. Create the replacement direct sale through the existing direct-sale workflow.
5. Link the replacement direct sale back onto the exchange case.
6. Keep the original sale, return note, and replacement sale as separate auditable records.

## Complaint and service workflow

1. Review complaint intake from `/admin/service-desk/complaints`.
2. If escalation is needed, create or review the linked service-desk case.
3. Track warranty posture on the case only; do not overload customer or product master with temporary service state.
4. Use `IN_SERVICE`, `RESOLVED`, and `CLOSED` as explicit operator milestones.
5. If service charges are billable, post a debit note from the service case instead of editing the original invoice.

## Credit and debit note governance

- Credit and debit notes are still billing documents.
- Service-desk posting actions create or finish those documents explicitly; they do not mutate invoices directly.
- Accounting impact comes from the posted note through the existing billing posting path.
- Inventory impact comes from the posted note only when `stock_effect` is required.
- Delivery returns without a billing effect do not create fake accounting entries.

## CRM timeline behavior

Party detail now surfaces:

- support requests
- service-desk cases
- return cases
- exchange events
- service tickets

This is read-through continuity only. CRM does not own the operational truth of the return or service workflow.
