# Vendor Ledger and Outstanding Rules

- Vendor payable ledger is isolated from customer credit ledgers and partner commission ledgers.
- Ledger entry effects:
  - `PURCHASE_BILL` increases payable (debit)
  - `PAYMENT_TO_VENDOR` decreases payable (credit)
  - `PURCHASE_RETURN` and debit-note style entries reduce payable according to accounting workflow
- Outstanding read model combines:
  - opening balance
  - posted/approved purchase bills
  - posted vendor payments
  - posted purchase returns
  - debit notes and approved adjustments
- Purchase return remains vendor-side and must not write to customer credit ledger.
- Existing journal posting and settlement posting logic remains unchanged.
