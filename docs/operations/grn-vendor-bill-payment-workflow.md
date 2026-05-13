# GRN -> Vendor Bill -> Vendor Payment Workflow

## GRN
- Draft receipt can be edited.
- Posting writes `PURCHASE_IN` stock movement rows.
- PO status updates to partial/received from cumulative receipt quantity.
- Over-receive is blocked unless explicit override reason is supplied.

## Vendor Bill
- Posting writes accounting bridge entry: inventory/expense/input-gst debit, accounts-payable credit.
- Vendor-ledger `PURCHASE_BILL` entry is appended for payable trace.

## Vendor Payment
- Posting writes accounting bridge entry: accounts-payable debit, finance account credit.
- Linked-bill overpayment is rejected.
- Vendor-ledger `PAYMENT_TO_VENDOR` entry is appended.
