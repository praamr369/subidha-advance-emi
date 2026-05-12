# Subscription (Lucky Plan) → business modules

This document describes **how an existing Lucky Plan subscription connects to other modules** using current UI routes.

## Primary subscription surfaces

- Subscription register: `/admin/subscriptions`
- Create subscription: `/admin/subscriptions/create`
- Subscription detail: `/admin/subscriptions/[id]`
- EMI schedule: `/admin/subscriptions/[id]/emis`

## Subscription lifecycle touchpoints (existing routes)

### Collections / receipts

- Cashier collections (operator-first): `/cashier/billing/collections`
- Admin collections overview: `/admin/finance/collections`
- Payments register: `/admin/payments`
- Payment detail / audit: `/admin/payments/[id]`

### Waivers and draw winner impact (future EMI only)

- Waiver register: `/admin/waivers`
- Lucky draw: `/admin/lucky-draw`
- Lucky draw winners: `/admin/lucky-draw/winners`

### Reconciliation and accounting control

- Payments reconciliation: `/admin/payments/reconciliation`
- Finance reconciliation: `/admin/finance/reconciliation`
- Accounting reconciliation: `/admin/accounting/reconciliation`
- Accounting periods: `/admin/accounting/periods`
- Accounting journals: `/admin/accounting/journals`

### Customer / CRM

- Customer register: `/admin/customers`
- Customer detail: `/admin/customers/[id]`
- CRM home: `/admin/crm`

### Delivery / fulfillment (when relevant)

- Delivery workspace: `/admin/delivery/workspace`
- Deliveries register: `/admin/deliveries`
- Delivery detail: `/admin/deliveries/[id]`

### Support / service desk (when issues occur)

- Service desk: `/admin/service-desk`
- Service module: `/admin/service`

## Operator workflows (how staff typically traverse)

These are common navigation paths for staff, expressed only with existing routes:

- **Enroll / contract**: `/admin/subscriptions/create` → `/admin/subscriptions/[id]`
- **Collect EMI**: `/cashier/billing/collections` → `/admin/payments/[id]` (audit/review if needed)
- **Handle exceptions**: `/admin/operations` → drill into the routed queue targets (collections/delivery/KYC/inventory)
- **Reconcile**: `/admin/payments/reconciliation` → `/admin/finance/reconciliation` → `/admin/accounting/reconciliation`

