# Delivery, Return, and Cancellation Flow (Phase 5)

## Scope
This rule set is based on current code paths in:
- `subscriptions/services/delivery_service.py`
- `inventory/services/delivery_bridge_service.py`
- `billing/services/direct_sale_delivery_bridge_service.py`
- `billing/services/direct_sale_delivery_actions.py`
- `subscriptions/services/operational_cancellation_service.py`
- `billing/services/reversal_service.py`
- admin routes under `api/v1/routes/admin.py`

## Subscription (EMI/Contract) delivery lifecycle
Current persisted statuses (`SubscriptionDelivery.status`):
- `PENDING`
- `SCHEDULED`
- `DISPATCHED`
- `OUT_FOR_DELIVERY`
- `DELIVERED`
- `FAILED`
- `CANCELLED`
- `RETURN_REQUESTED`
- `RETURNED`

Allowed transitions are enforced in service layer (`ALLOWED_DELIVERY_TRANSITIONS`), not the frontend.

## Direct-sale delivery lifecycle
Direct-sale delivery tracking is represented by `ServiceDeskCase` (`DIRECT_SALE_DELIVERY`) and serialized into delivery workspace rows.

Operational phases are derived from:
- direct-sale status
- invoice posting state
- outstanding balance
- stock gate state

History-only direct-sale delivery rows are produced when source sale is reversed/returned/archived/cancelled.

## Cancellation controls
- `cancel_billing_invoice` blocks cancellation if posted receipts still exist.
- `cancel_direct_sale` blocks cancellation for delivered direct sales and for sales with active posted receipts.
- direct-sale cancellation closes active delivery service-desk rows and cancels open direct-sale purchase needs.
- subscription delivery cancellation (`cancel_subscription_delivery`) is transition-based and audit logged.

## Return controls
- Subscription delivery return uses `RETURN_REQUESTED -> RETURNED`.
- On `RETURNED`, inventory bridge posts return-in where inventory bridge is enabled.
- Direct-sale return posting is controlled by reversal services and can create stock return-in movements based on configured return destination.

## Financial safety rules
- No deletion of posted records; cancellation and reversals preserve history.
- Voided receipts and cancelled/voided invoices move out of active collection posture.
- Refunds are controlled through refund approval and payout workflow (`DRAFT -> APPROVED -> PAID`).

## Auditability
Delivery/cancel/return transitions record audit entries with actor and metadata. For direct-sale delivery cases, status and mutation actions are logged as service-desk case audit events.

## Proposed future additive work (not implemented)
- Dedicated explicit `DELIVERY_CANCELLED_AT_SOURCE` reason-code taxonomy for analytics-only reporting.
- Optional return inspection checklist payload per direct-sale return line (without changing existing return posting semantics).
