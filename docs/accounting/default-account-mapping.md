# Default Finance Account to COA Mapping

## Day-one default mappings

| Finance Account | Purpose | Default COA Ledger | Expected COA Type |
|---|---|---|---|
| Main Cash Desk | CASH_COLLECTION | Cash in Hand | Asset |
| UPI Account | UPI_COLLECTION | UPI/Payment Gateway | Asset |
| Main Bank Account | BANK_COLLECTION | Bank Account | Asset |
| Customer Receivable | CUSTOMER_RECEIVABLE | Customer Receivables | Asset |
| Security Deposit Liability | SECURITY_DEPOSIT_LIABILITY | Rent/Lease Security Deposit Liability | Liability |
| Advance EMI Collection | EMI_INCOME | Advance EMI Collection Income | Income |
| Rent Income | RENT_INCOME | Rent Income | Income |
| Lease Income | LEASE_INCOME | Lease Income | Income |
| Direct Sale Income | DIRECT_SALE_INCOME | Direct Sale Revenue | Income |
| Waiver/Loss | WAIVER_LOSS | Lucky Winner Waiver/Loss | Expense/Equity |
| Partner Commission Payable | COMMISSION_PAYABLE | Partner Commission Payable | Liability |
| Damage Deduction/Recovery | DAMAGE_RECOVERY | Damage Recovery Income | Income |
| Inventory Stock Value | INVENTORY_ASSET | Inventory Asset | Asset |

## Validation rules

- Every active finance account used in operations must have an active mapping.
- Security deposit mappings must be liability ledgers.
- Waiver/loss mappings must be expense/equity ledgers.
- Customer receivable mappings must be asset ledgers.
- Commission payable mappings must be liability ledgers.
- Income-purpose mappings must map to income ledgers.

## Bootstrap behavior

- Command: `python manage.py bootstrap_accounting_setup --dry-run`
- Command: `python manage.py bootstrap_accounting_setup`
- Bootstrap is idempotent and safe to run repeatedly.
# Default Finance-to-COA Mapping

Day-one defaults created by `bootstrap_accounting_setup`:

- Main Cash Desk -> Cash in Hand (`CASH_COLLECTION`)
- UPI Account -> UPI/Payment Gateway (`UPI_COLLECTION`)
- Main Bank Account -> Bank Account (`BANK_COLLECTION`)
- Customer Receivable -> Customer Receivables (`CUSTOMER_RECEIVABLE`)
- Security Deposit Liability -> Rent/Lease Security Deposit Liability (`SECURITY_DEPOSIT_LIABILITY`)
- Advance EMI Collection -> Advance EMI Collection Income (`EMI_INCOME`)
- Rent Income -> Rent Income (`RENT_INCOME`)
- Lease Income -> Lease Income (`LEASE_INCOME`)
- Direct Sale Income -> Direct Sale Revenue (`DIRECT_SALE_INCOME`)
- Waiver/Loss -> Lucky Winner Waiver/Loss (`WAIVER_LOSS`)
- Partner Commission Payable -> Partner Commission Payable (`COMMISSION_PAYABLE`)
- Damage Deduction/Recovery -> Damage Recovery Income (`DAMAGE_RECOVERY`)
- Inventory Stock Value -> Inventory Asset (`INVENTORY_ASSET`)

## Validation guardrails

- Deposit liability cannot map to income.
- Receivable cannot map to liability/income.
- Waiver/loss must map to expense/equity category.
- Income purposes cannot map to asset/liability.
- Inactive chart accounts are flagged as warnings.
