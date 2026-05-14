# Customer 360 and CRM

## Scope in current code
Customer 360 is built from real records aggregated in `crm.services.timeline_service.build_party_detail_payload` and served by admin CRM endpoints:
- `GET /api/v1/crm/overview/`
- `GET /api/v1/crm/parties/`
- `GET /api/v1/crm/parties/{id}/`
- `POST /api/v1/crm/parties/{id}/interactions/`
- `POST /api/v1/crm/interactions/{id}/status/`

These surfaces are admin-only (`IsAdmin`).

## Authoritative source models currently used
- Lead context: `subscriptions.PublicLead`
- Customer context: `subscriptions.Customer`
- Subscription context: `subscriptions.Subscription`
- Payment context: `subscriptions.Payment`
- Invoice context: `billing.BillingInvoice`
- Receipt context: `billing.ReceiptDocument`
- Delivery context: `subscriptions.SubscriptionDelivery`
- Support context: `subscriptions.CustomerSupportRequest`
- Service desk context: `service_desk.ServiceDeskCase`
- Follow-up and communication context: `crm.PartyInteraction`
- Reminder context: `reminders.PaymentReminder`

CRM does not mutate financial truth records. It references them.

## Timeline event sources in current implementation
Timeline entries are assembled from persisted records only:
- `LEAD`
- `SUBSCRIPTION`
- `DIRECT_SALE`
- `INVOICE`
- `RECEIPT`
- `PAYMENT`
- `DELIVERY`
- `SUPPORT`
- service-desk case type events (for example `COMPLAINT`, `SERVICE`, `SALES_RETURN`)
- `REMINDER`
- `INTERACTION`

## Financial integrity guardrails
- CRM timeline is read-only over payment, EMI, invoice, receipt, direct-sale, and delivery records.
- No CRM endpoint posts or reverses payments.
- No CRM endpoint changes EMI status or lucky-draw winner waiver semantics.

## Follow-up and communication rules
- Follow-up notes are stored in `crm.PartyInteraction`.
- Follow-up status lifecycle is explicit: `OPEN`, `DONE`, `CANCELLED`.
- Reminder linkage is optional and traceable through `reminder` foreign key.

## Future additive proposals (not implemented yet)
- Optional explicit communication-channel fields (`call`, `sms`, `whatsapp`, `email`) on interaction metadata.
- Optional attachment support for CRM interactions.
- Optional SLA fields for follow-up task aging analytics.
