# Simple Finance Accounts vs Chart of Accounts

## Why both exist

SUBIDHA CORE uses two accounting layers intentionally:

- **Finance Accounts** are business-facing and cashier-friendly (Cash Desk, UPI Account, Main Bank Account).
- **Chart of Accounts (COA)** is accounting-facing and reporting-accurate (Asset, Liability, Income, Expense, Equity ledgers).

This split keeps daily operations simple while preserving audit-grade accounting precision.

## How daily users should think

- Cashiers and operations users work with **Finance Accounts** during collection, payout, and transfer workflows.
- They should not need to choose technical ledger heads for normal day-to-day posting.
- Finance accounts are named in business language for speed and fewer mistakes.

## How accounting remains precise

- Each active finance account is mapped to a COA ledger through `FinanceAccountCoaMapping`.
- Mapping purpose enforces accounting intent, for example:
  - security deposit -> liability
  - customer receivable -> asset
  - waiver/loss -> expense/equity
  - commission payable -> liability
- Setup validation warns on missing mappings, invalid account-type mappings, inactive ledgers, and duplicate defaults.

## Governance and auditability

- Mapping creation/updates and bootstrap actions are audit logged.
- Mapping changes are additive and do not mutate historical transaction records.
- Accountants/agency can refine mapping setup later without changing operational UX.
# Simple Finance Accounts vs Chart of Accounts

`Finance Accounts` are operator-facing channels used in daily work (cash desk, UPI, bank, receivable lane).

`Chart of Accounts (COA)` is accounting-facing structure used for ledger correctness, reporting, and audit.

## Practical rule

- Operators pick a finance account for real-world collection or payout flow.
- Backend maps that finance account to one authoritative COA ledger through `FinanceAccountCoaMapping`.
- Mapping purpose controls account-type correctness (asset/liability/income/expense).

## Why this split matters

- Daily users avoid accounting jargon and keep screens operational.
- Finance and auditors still get precise ledger grouping and trial-balance consistency.
- Mapping updates remain additive and auditable.
