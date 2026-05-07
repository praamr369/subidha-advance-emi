# Direct Sale Cancel, Return, and Exchange Policy

## Scope

This policy applies to Subidha Furniture direct sales after quotation, invoice, delivery, return, and exchange events. It does not change EMI, payment posting, reconciliation, waiver, lucky draw, commission, or payout rules.

## Immutable Records

Posted invoices, receipts, payment records, stock ledger rows, and journal entries remain historical records. Corrections must use cancellation cases, credit notes, customer credit/refund records, and new stock ledger rows.

## Allowed Workflows

| Sale state | Controlled action | Required record path |
| --- | --- | --- |
| Draft or confirmed, not posted | Pre-invoice cancellation | Audited direct-sale cancellation |
| Posted invoice, not delivered | Post-invoice cancellation | DirectSaleReturn with POST_INVOICE_CANCEL, credit note, customer credit if applicable |
| Delivered | Delivered return | DirectSaleReturn with DELIVERED_RETURN, credit note, SALE_RETURN_IN stock movement |
| Delivered and damaged | Damaged return | DirectSaleReturn with DAMAGED_RETURN, non-sellable stock destination |
| Delivered partial line return | Partial return | DirectSaleReturn with PARTIAL_RETURN and quantity validation |
| Delivered exchange | Exchange | DirectSaleReturn with DELIVERED_EXCHANGE, SALE_RETURN_IN for returned item, SALE_OUT for replacement item |

## Quantity Controls

Returned quantity cannot exceed sold quantity minus quantities already included in approved or posted returns. This applies per direct-sale line.

## Stock Destination Rules

Sellable returns can use the item default stock location. Inspection, damaged, and service returns require an explicit stock location and must not automatically return to sellable stock.

## Customer Credit and Refund

Credit notes create customer credit. Refund payout remains a separate approved refund workflow and is not automatically paid from the return form.

For exchanges:
- Higher-value replacement creates a customer amount due.
- Lower-value replacement creates customer credit after the exchange return is posted.

## Accounting

Credit notes are posted as reversal accounting documents. Original invoice and receipt accounting entries remain unchanged.
