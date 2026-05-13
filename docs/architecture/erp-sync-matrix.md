# ERP Sync Matrix

## Confirmed sync lanes from code
| Source module | Target module | Mechanism | Current state |
|---|---|---|---|
| Billing direct sale | Accounting journals | Accounting bridge run `run-retail-sale` | Implemented |
| Inventory postings | Accounting journals | Accounting bridge run `run-inventory-posting` | Implemented |
| EMI subscription | Accounting journals | Accounting bridge run `run-emi-subscription` | Implemented |
| EMI payment | Accounting journals | Accounting bridge run `run-emi-payment` | Implemented |
| EMI waiver | Accounting journals | Accounting bridge run `run-emi-waiver` | Implemented |
| Commission settlement | Accounting journals | Accounting bridge run `run-commission-settlement` | Implemented |
| Payout batch | Accounting journals | Accounting bridge run `run-payout-batch` | Implemented |
| Setup wizard/business setup | Accounting control state | `/admin/accounting/setup/*` + checklist APIs | Implemented |
| CRM/service desk | Operations dashboards | Admin workspace/report surfaces | Implemented |

## Control assertions for all sync lanes
- Financial posting readiness must be `READY` before go-live posting.
- Reconciliation readiness must be `READY` before period close.
- Sync lanes are additive; no historical mutation of posted journals/payments.

## Additive gaps to fill later phases
- Rent/lease dedicated bridge purposes and lifecycle sync checks.
- Cross-module BI lineage reports (document -> bridge posting -> journal -> reconciliation).
