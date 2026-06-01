# Setup Readiness Center

Branch: `update`

Status: **Read-only setup readiness with business compliance and PG-2B policy governance metadata guidance**

## Purpose

The Setup Readiness Center gives admin users one guided place to verify whether SUBIDHA CORE is ready for live shop operation.

It focuses on the master data and control setup needed before daily workflows such as customer onboarding, product registration, batch/Lucky ID creation, payment collection, receipt printing, reconciliation, day close, business compliance readiness, policy publication, and product recontract execution.

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
- seed policies
- submit policies for review
- approve policies
- accept internal policies
- publish policies
- archive policies
- sync policy governance metadata
- seed compliance checklist rows
- approve compliance documents
- upload compliance files
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
| `business_compliance` | Actual shop identity, premises proof, address proof, PAN/tax proof, bank proof, and recommended registration evidence readiness. |
| `policy_governance` | Required public/internal policies exist, have safe stored governance metadata, and have the correct lifecycle state. |
| `chart_of_accounts` | Required active COA/system ledgers exist. |
| `finance_accounts` | Active operational cash/bank/UPI finance accounts are mapped to posting-ready asset accounts. |
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

## Business compliance readiness

Business Compliance readiness uses:

```text
GET /api/v1/admin/settings/business-compliance/readiness/
```

It blocks readiness when:

```text
active business profile is missing
required premises proof is missing, unapproved, or missing real file evidence
required business address proof is missing, unapproved, or missing real file evidence
required PAN/tax proof is missing, unapproved, or missing real file evidence
required bank proof is missing, unapproved, or missing real file evidence
```

It warns when:

```text
GST evidence is missing or not approved
Udyam/MSME evidence is missing or not approved
shop/trade license evidence is missing or not approved
compliance rows are pending review
public summary needs separate approval
```

Readiness copy must stay honest:

```text
Compliance document templates are operational checklist items, not legal publication.
Private documents remain private by default.
Public summary requires separate approval.
GST/Udyam readiness requires actual data/status.
Setup readiness must not fake readiness from seeded empty rows.
```

## Policy governance readiness

Policy Governance readiness uses the coverage matrix from:

```text
GET /api/v1/admin/settings/policies/coverage/
```

PG-2B stores governance metadata separately from policy content:

```text
visibility: PUBLIC | INTERNAL
governance_category
coverage_group
requires_legal_review
requires_admin_acceptance
review_due_date
source_template_key
```

Policy lifecycle states:

```text
DRAFT
UNDER_REVIEW
APPROVED
PUBLISHED
ARCHIVED
```

It blocks readiness when:

```text
required public policies are missing
required public policies exist but are not PUBLISHED
stored metadata mismatch affects visibility/readiness
```

It warns when:

```text
internal governance policies are missing
internal governance policies are not APPROVED or internally accepted
metadata mismatch exists but is not dangerous
review due date is past
```

Coverage metadata exposed through the section includes:

```text
coverage_summary.public_required_count
coverage_summary.public_published_count
coverage_summary.public_draft_count
coverage_summary.public_under_review_count
coverage_summary.public_approved_count
coverage_summary.internal_required_count
coverage_summary.internal_ready_count
coverage_summary.internal_draft_count
coverage_summary.internal_under_review_count
coverage_summary.metadata_mismatch_count
public_missing_count
public_not_published_count
internal_missing_count
internal_draft_count
```

Readiness copy must stay honest:

```text
Seeded policies remain DRAFT.
DRAFT is not public.
APPROVED public policies are not public until PUBLISHED.
INTERNAL is never public.
Public launch requires published public policies.
Internal governance policies support audit/control but do not replace legal review.
```

## Finance account readiness

Finance account readiness follows the same posting-readiness rule as collection flows.

An operational finance account is collection-ready only when:

- finance account is active
- finance account is a real settlement/collection account
- kind is suitable for collection (`CASH`, `BANK`, or `UPI`)
- mapped chart account exists
- mapped chart account is active
- mapped chart account is an `ASSET`
- mapped chart account allows manual posting
- mapped chart account is a leaf/posting account, not a group/control account

Blocked copy:

```text
Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account.
```

System posting profiles are diagnostic only and cannot receive customer collections.

```text
Ledger posting profiles (system)
```

This row belongs in Accounting Setup diagnostics, not collection selectors.

```text
diagnostic_only = true
selectable_for_collection = false
```

## Multiple account support

Multiple active finance accounts are valid:

```text
multiple CASH accounts
multiple BANK accounts
multiple UPI accounts
```

Setup health may warn that multiple active accounts exist, but it must not block live readiness solely because more than one account of a kind exists. Each account is evaluated independently.

## Launch checklist

The frontend renders a backend-supported checklist:

- Can create customer
- Can create product
- Can create batch / Lucky IDs
- Can collect payment
- Can issue receipt
- Can print documents
- Can complete business compliance
- Can publish public policies
- Can reconcile
- Can day-close
- Can handle amendment/recontract

Items are marked ready only when the backend readiness payload supports them.

## Existing data impact

Setup Readiness itself does not change existing business data.

PG-2B adds additive Policy Governance metadata migrations, but the readiness endpoint remains read-only.

No existing policies, compliance documents, business profile records, finance records, or historical transaction records are edited by reading readiness.

## Financial integrity impact

Financial controls remain enforced.

The readiness center reports configuration blockers but does not weaken collection, posting, receipt, reconciliation, day-close, business compliance privacy, policy lifecycle, or product recontract gates.

## Auditability impact

Auditability improves by exposing one admin evidence surface for setup health and blockers.

The readiness center itself does not create audit records because it does not mutate data.

Policy Governance lifecycle actions create their own audit events outside the readiness center.

## Daily shop usability impact

Admin users can see setup blockers from one page instead of visiting multiple setup screens before go-live.

The page links to real implemented setup routes only. Fake action buttons are not exposed.

## Future rent/lease compatibility

The readiness model is reusable for rent/lease expansion because it treats business profile, print branding, business compliance, policies, finance accounts, deposits, accounting/reconciliation readiness, products, delivery, and document controls as shared setup foundations.

Future rent/lease-specific readiness can add sections without changing existing EMI setup truth.
