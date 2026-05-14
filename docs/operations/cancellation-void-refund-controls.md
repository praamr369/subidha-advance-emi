# Cancellation, Void, and Refund Controls

## Invoice cancellation
Service: `subscriptions/services/operational_cancellation_service.py::cancel_billing_invoice`

Controls:
- admin-only actor
- mandatory reason
- blocks if posted receipts are still active
- posted invoice cancellation creates reversal journal and sets `VOID`
- unposted invoice cancellation sets `CANCELLED`
- audited operational cancellation record is created

## Receipt void
Services:
- `billing/services/billing_service.py::void_receipt_document`
- `billing/services/reversal_service.py::void_receipt_with_reason`

Controls:
- reason required
- status transitions preserve receipt history
- reversal traces are recorded
- collectible posture is recalculated from active documents

## Direct-sale cancellation
Service: `subscriptions/services/operational_cancellation_service.py::cancel_direct_sale`

Controls:
- blocks delivered direct sale from straight cancellation
- blocks cancellation when active posted receipts exist
- cancels active linked invoices through controlled invoice cancellation
- cancels open direct-sale purchase needs
- closes active direct-sale delivery service-desk cases
- records audited operational cancellation

## Refund controls
Service: `billing/services/reversal_service.py`

Workflow:
- create refund (`DRAFT`)
- approve refund (`APPROVED`)
- pay refund (`PAID`) with accounting journal posting

Controls:
- refund amount cannot exceed available customer credit
- only approved refunds can be paid
- refund payment writes customer credit ledger debit entry

## Operational outcome
- cancelled invoices and voided receipts are not treated as active collectible documents
- financial and stock history remains immutable in-place; reversals are additive
