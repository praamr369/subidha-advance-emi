# Returns, Voids & Reversals Center

## Scope
Admin-only workflows for:
- direct sale pre-invoice cancellation (reason required)
- direct sale return -> credit note -> stock return -> customer credit
- receipt void with reason and reversal journal
- customer refund from credit balance (cash/UPI/bank)
- purchase return with stock-out and payable adjustment

## Control rules
- No deletion/mutation of historical invoices, receipts, stock ledger, journals, or payments.
- Reversals are additive records with approval/posting stages.
- Receipt void keeps original receipt row and posts reversal journal.
- Refunds consume customer credit through separate ledger debit entries.

## Admin endpoints
- `POST /api/v1/admin/billing/direct-sales/{id}/cancel/`
- `POST /api/v1/admin/billing/direct-sales/{id}/returns/`
- `GET /api/v1/admin/billing/returns/`
- `GET /api/v1/admin/billing/returns/{id}/`
- `POST /api/v1/admin/billing/returns/{id}/approve/`
- `POST /api/v1/admin/billing/returns/{id}/post/`
- `POST /api/v1/admin/billing/receipts/{id}/void/`
- `GET /api/v1/admin/customers/{id}/credits/`
- `POST /api/v1/admin/customers/{id}/refunds/`
- `POST /api/v1/admin/customers/refunds/{id}/approve/`
- `POST /api/v1/admin/customers/refunds/{id}/pay/`
- `POST /api/v1/admin/purchases/{id}/returns/`
- `POST /api/v1/admin/purchases/returns/{id}/post/`

## Daily workflow
1. If sale not invoiced/posted: cancel with reason.
2. If invoiced: create return line(s), approve, post.
3. Credit auto-enters customer credit ledger.
4. If cash-out needed: create refund, approve, pay.
5. For posted receipt mistakes: void with reason.
6. For vendor-side return: create purchase return and post.
