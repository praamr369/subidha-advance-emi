# Two-account finance setup

This setup is the day-to-day operating model for a single admin / owner-managed shop.

## Rule

The operator-facing Finance Accounts must stay simple:

1. **Main Cash Desk** — all physical cash collections and cash payouts.
2. **Main UPI / Bank Account** — all UPI, bank, card, settlement, and digital collections or payouts.

These are the only real settlement accounts that should appear in collection selectors.

## What does not change

The Chart of Accounts is still complete. It must keep separate ledger categories for:

- Customer receivable
- Customer advance / unearned revenue
- EMI income
- Rent income
- Lease income
- Direct sale income
- Security deposit liability
- Commission payable and commission expense
- Purchase / inventory asset
- Salary expense
- Delivery income and expense
- GST and tax ledgers
- Waiver / loss ledgers

These COA rows are required for correct books, reports, balance sheet, P&L, audits, and later rent/lease expansion.

## How the mapping works

| Business flow | Real money account used by admin | COA / ledger mapping behind it |
| --- | --- | --- |
| EMI collection | Main Cash Desk or Main UPI / Bank Account | Cash/Bank debit, customer receivable / EMI bridge credit |
| Rent collection | Main Cash Desk or Main UPI / Bank Account | Cash/Bank debit, rent income / receivable credit |
| Lease collection | Main Cash Desk or Main UPI / Bank Account | Cash/Bank debit, lease income / receivable credit |
| Direct sale receipt | Main Cash Desk or Main UPI / Bank Account | Cash/Bank debit, customer receivable credit |
| Security deposit receipt | Main Cash Desk or Main UPI / Bank Account | Cash/Bank debit, security deposit liability credit |
| Customer advance | Main Cash Desk or Main UPI / Bank Account | Cash/Bank debit, customer advance liability credit |
| Vendor / PO purchase payment | Main Cash Desk or Main UPI / Bank Account | Vendor payable debit, cash/bank credit |
| Commission payout | Main Cash Desk or Main UPI / Bank Account | Commission payable/expense debit, cash/bank credit |
| Salary payout | Main Cash Desk or Main UPI / Bank Account | Salary payable/expense debit, cash/bank credit |
| Stock purchase / inventory | Not a separate finance account | Inventory asset / payable mapping stays in COA |

## Hidden system anchor

`Ledger posting profiles (system)` remains as an internal, non-settlement Finance Account only because existing mapping tables require a FinanceAccount foreign key.

It is not a cash desk, not a bank account, and must not appear in receipt selectors.

## Legacy rows

Old standard rows such as `Branch Cash Desk`, `Main Bank Account`, `UPI Account`, and `Payment Gateway Settlement Account` are deleted by Accounting Setup defaults when they are unused.

If a legacy row already has protected business references such as historical payments, counters, receipts, day-close records, or posted documents, setup preserves that row and reports it under `legacy_cleanup.preserved` instead of corrupting data.

## Setup endpoint behavior

Running Accounting Setup defaults now applies the `TWO_REAL_SETTLEMENT_ACCOUNTS` model:

- Creates or repairs `Main Cash Desk`.
- Creates or repairs/reuses `Main UPI / Bank Account`.
- Reassigns default bank, UPI, and payment-gateway collection mappings to `Main UPI / Bank Account`.
- Keeps all semantic COA mappings active through the hidden system anchor.
- Deletes unused legacy standard settlement rows and their mapping rows.
- Preserves legacy rows only when existing business references require it.
