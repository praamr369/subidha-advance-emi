# Setup Readiness Center

Branch: `update`

Status: **Phase 7C implemented**

## Purpose

The Setup Readiness Center gives admin users one guided place to verify whether SUBIDHA CORE is ready for live shop operation.

It focuses on the master data and control setup needed before daily workflows such as customer onboarding, product registration, batch/Lucky ID creation, payment collection, receipt printing, reconciliation, day close, and product recontract execution.

## Routes

Frontend:

```text
/admin/setup/readiness
```

Canonical API:

```text
GET /api/v1/admin/setup/readiness/
```

Compatibility API alias retained:

```text
GET /api/v1/admin/setup-readiness/
```

## Security

The page and API are admin-only.

Customer, partner, cashier, and vendor users must not see the Setup Readiness navigation link and must not be able to access the API payload.

## Read-only rule

The readiness center is strictly read-only.

It does not:

- create chart accounts
- create finance accounts
- remap finance accounts
- repair accounting setup
- post payments
- issue receipts
- post journal entries
- create reconciliation runs/items/evidence
- execute product recontract
- reset, restore, seed, or import data
- mutate historical records

The endpoint performs ORM reads and in-memory classification only.

## Readiness sections

The API returns these sections:

| Key | Meaning |
|---|---|
| `business_profile` | Active legal/trade/contact business identity exists. |
| `print_branding` | Print/PDF display identity and signature/branding settings are configured. |
| `chart_of_accounts` | Required active COA/system ledgers exist. |
| `finance_accounts` | Active cash/bank/UPI finance accounts are mapped to posting-ready asset accounts. |
| `branch_cash_counter` | Active primary branch and active collection counter exist. |
| `staff_roles` | Admin/cashier staffing and role separation readiness. |
| `product_catalog` | Active products exist for sale/EMI/rent/lease workflows. |
| `batch_lucky_ids` | Lucky Plan batch and Lucky ID setup exists. |
| `payment_collection` | Collection accounts and mappings support safe payment collection. |
| `document_templates` | Document numbering and print terms/templates are sufficiently ready. |
| `accounting_reconciliation` | COA, mappings, and posting profiles support accounting and reconciliation gates. |
| `amendment_recontract` | Product recontract prerequisites are ready: accounting, reconciliation, and document evidence setup. |

## Status definitions

| Status | Meaning |
|---|---|
| `READY` | Minimum operational criteria are satisfied for that section. |
| `NEEDS_SETUP` | Optional or important setup is incomplete but does not always block live operation. |
| `BLOCKED` | Live operation would be unsafe or likely fail until setup is completed. |

## Finance account readiness

Finance account readiness uses the same posting-readiness rule as collection flows:

- finance account must be active
- kind must be suitable for collection (`CASH`, `BANK`, or `UPI`)
- mapped chart account must exist
- mapped chart account must be active
- mapped chart account must be an `ASSET`
- mapped chart account must allow manual posting
- mapped chart account must be a leaf/posting account, not a group/control account

The readiness center reports blockers and recommended actions. It does not auto-create posting child accounts and does not silently remap accounts.

## Launch checklist

The frontend renders a backend-supported checklist:

- Can create customer
- Can create product
- Can create batch / Lucky IDs
- Can collect payment
- Can issue receipt
- Can print documents
- Can reconcile
- Can day-close
- Can handle amendment/recontract

Items are marked ready only when the backend readiness payload supports them.

## Existing data impact

No existing business data is changed.

No migration is required for Phase 7C.

## Financial integrity impact

Financial controls remain enforced.

The readiness center reports configuration blockers but does not weaken collection, posting, receipt, reconciliation, day-close, or product recontract gates.

## Auditability impact

Auditability improves by exposing one admin evidence surface for setup health and blockers.

The readiness center itself does not create audit records because it does not mutate data.

## Daily shop usability impact

Admin users can see setup blockers from one page instead of visiting multiple setup screens before go-live.

The page links to real implemented setup routes only. Fake action buttons are not exposed.

## Future rent/lease compatibility

The readiness model is reusable for rent/lease expansion because it treats business profile, print branding, finance accounts, deposits, accounting/reconciliation readiness, products, delivery, and document controls as shared setup foundations.

Future rent/lease-specific readiness can add sections without changing existing EMI setup truth.
