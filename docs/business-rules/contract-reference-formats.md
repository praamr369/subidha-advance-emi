# Contract Reference Formats

## Purpose

Contract references provide a stable search and display identifier across sales models. They are not financial records and do not decide balances, payment status, waivers, or reconciliation state.

Financial truth remains in the original source records:

- Advance EMI: `Subscription`, `Emi`, `Payment`, ledger, waiver, reconciliation records
- Rent and lease: rent/lease subscription profiles and billing demand records
- Direct sale: `DirectSale`, billing invoice, receipt, and collection service records

## Formats

| Contract type | Format |
| --- | --- |
| Advance EMI | `SUB/ADVEMI/{BATCH_CODE_OR_NUMBER}/L{LUCKY_ID}/{YEAR}/{SEQ}` |
| Rent | `SUB/RENT/{YEAR}/{SEQ}` |
| Lease | `SUB/LEASE/{YEAR}/{SEQ}` |
| Direct sale | `SALE/DIRECT/{YEAR}/{SEQ}` |

Rules:

- `reference_no` is unique and immutable.
- Product or item names must not be included in `reference_no` because they can change.
- Product or item labels belong in `product_summary_snapshot`.
- Batch and Lucky ID values are stored in snapshots for search and counter display.
- The sequence is allocated transactionally per reference scope.

## Snapshot Fields

`ContractReference` stores snapshots for search and display:

- masked-safe customer/KYC reference
- phone and customer name snapshots
- product summary
- batch and Lucky ID
- partner label
- source creation timestamp
- source metadata

Snapshots help staff find the correct contract quickly. They do not replace the source customer, subscription, invoice, payment, or ledger records.

