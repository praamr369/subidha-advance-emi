# Direct Sale Return and Exchange Workflow

## Daily Shop Flow

1. Open the direct sale in the admin Direct Sale Workspace.
2. Use View Return Eligibility to confirm invoice status, delivery status, sold lines, already returned quantities, receipt summary, and allowed actions.
3. For draft or confirmed sales, use Cancel Sale with a reason.
4. For posted but undelivered sales, use Post-Invoice Cancel/Reversal. The system opens a return case for credit-note processing.
5. For delivered returns, open Returns, Voids & Reversal Center and create a return with reason, return kind, sale line, quantity, stock destination, and stock location when required.
6. For damaged returns, choose DAMAGED_RETURN and a non-sellable destination such as INSPECTION, DAMAGED, or SERVICE.
7. For exchanges, enter the old returned sale line and replacement inventory item, quantity, and price.
8. Approve and post the return when the manager has verified the product and amount.
9. Process any customer refund only through the separate approved refund workflow.

## Operator Notes

Original invoices and receipts remain unchanged. The system creates reversal records, credit notes, customer credit entries, and stock ledger movements instead.

## Stock Impact

Delivered returns post SALE_RETURN_IN. Exchanges also post SALE_OUT for replacement stock. Damaged and inspection returns use the selected non-sellable stock location.

## Accounting Impact

Posted returns create credit notes and customer credit entries. Higher-value exchanges record customer payable amount on the exchange return. Lower-value exchanges create customer credit after posting.

## Reconciliation

The workflow is additive. Existing invoices, receipts, payment rows, journal entries, EMI rows, waivers, reconciliation records, commission records, payout records, and lucky draw records are not directly mutated.
