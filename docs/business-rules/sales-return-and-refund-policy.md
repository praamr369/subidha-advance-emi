# Sales Return and Refund Policy

## Returns
- Allowed only for invoiced/delivered direct sales with posted original invoice.
- Return quantity cannot exceed sold quantity minus already returned quantity.
- Return posting creates and posts billing credit note.
- Stock-tracked lines post `SALE_RETURN_IN` inventory movement.

## Credit and refund
- Return amount is captured as customer credit ledger credit.
- Refund allowed only from available credit balance.
- Refund methods: `CASH_REFUND`, `UPI_REFUND`, `BANK_REFUND`.
- Refund requires approval before pay.
- Refund pay creates money-out journal and credit-ledger debit entry.

## Receipt void
- Only posted receipts can be voided.
- Void requires reason.
- Void posts reversal journal entry; original receipt remains traceable.
