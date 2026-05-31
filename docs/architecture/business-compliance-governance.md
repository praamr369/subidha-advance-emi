# Business Compliance Governance

Branch: `update`

Status: **Phase BC-1 business compliance templates and readiness implemented**

## Purpose

Business Compliance is the operational evidence layer for SUBIDHA CORE shop identity and compliance records.

It is separate from Policy Governance:

```text
Policy Governance = legal/policy text templates.
Business Compliance = actual shop identity, registration evidence, premises proof, bank proof, tax proof, certificates, and public-safe summaries.
```

## Core rules

```text
Do not fake GST registration.
Do not fake Udyam/MSME registration.
Do not mark missing documents as verified.
Do not expose private files publicly.
Do not create public downloadable ownership/rental/bank/PAN/GST files.
Seeded checklist rows do not make readiness complete.
```

## Admin routes

Frontend:

```text
/admin/settings/business-compliance
```

Admin APIs:

```text
GET  /api/v1/admin/settings/business-compliance/templates/
POST /api/v1/admin/settings/business-compliance/seed-rows/
GET  /api/v1/admin/settings/business-compliance/readiness/
GET  /api/v1/admin/public-site/business-compliance/documents/
POST /api/v1/admin/public-site/business-compliance/documents/
PATCH /api/v1/admin/public-site/business-compliance/documents/:id/
GET  /api/v1/admin/public-site/business-compliance/summary/
```

Public API:

```text
GET /api/v1/public/business-compliance/summary/
```

## Template catalog

The read-only template catalog lives in:

```text
backend/subscriptions/services/business_compliance_governance_service.py
```

Each item exposes:

```text
key
label
document_type
required_level
visibility_default
allowed_public_exposure
description
recommended_action
readiness_impact
```

## Default templates

Required:

```text
ownership-proof
rental-agreement
business-address-proof
pan-or-tax-proof
bank-proof
```

Recommended:

```text
udyam-certificate
gst-certificate
shop-license
```

Optional:

```text
proprietor-id-proof
other-compliance-proof
```

## Seed row behavior

Seed endpoint:

```text
POST /api/v1/admin/settings/business-compliance/seed-rows/
```

Behavior:

```text
creates required/recommended rows only
skips optional templates
creates empty metadata rows only
sets public_visibility = PRIVATE
sets verification_status = PENDING
attaches no fake file
sets no verified/approved status
is idempotent
never overwrites existing matching rows
```

A seeded row is an operator checklist placeholder, not evidence.

## Verification/status mapping

Existing stored statuses are reused:

```text
PENDING      -> Pending review
VERIFIED     -> Approved / verified
REJECTED     -> Rejected
NOT_PROVIDED -> Not provided
inactive row -> Expired display state
```

No migration was required for BC-1.

## Public/private exposure

Private files are never public-downloadable by default.

The public summary API exposes only rows where:

```text
public_visibility = PUBLIC_SUMMARY_ONLY
verification_status = VERIFIED
is_active = true
```

It does not expose file URLs.

GST/Udyam public text must remain honest:

```text
Not provided / will be updated after registration.
```

unless actual verified evidence/status exists.

## Readiness behavior

Readiness endpoint:

```text
GET /api/v1/admin/settings/business-compliance/readiness/
```

Returns:

```text
status
blockers
warnings
route_hint
missing_required_count
pending_review_count
approved_required_count
required_count
recommended_missing_count
required_checks
recommended_checks
templates
privacy_rule
```

Readiness is `BLOCKED` when:

```text
active business profile is missing
required premises proof is missing/unapproved
required business address proof is missing/unapproved
required PAN/tax proof is missing/unapproved
required bank proof is missing/unapproved
```

Readiness warns when:

```text
GST evidence is missing/unapproved
Udyam/MSME evidence is missing/unapproved
shop/trade license evidence is missing/unapproved
any compliance rows are pending review
```

Readiness can be `READY` only when required evidence is approved and no warning remains.

## Setup Readiness integration

Setup Readiness now includes:

```text
business_compliance
```

Launch checklist includes:

```text
can_complete_business_compliance
```

Setup Readiness remains read-only. It does not seed rows, upload files, approve documents, or mutate financial records.

## Frontend behavior

The Business Compliance page shows:

```text
compliance status cards
required/recommended/optional template checklist
seed required/recommended rows action
human document type labels
safe add-row form defaults
private/public-summary warning copy
document register with status, visibility, summary state, review state, and expiry placeholder
public summary preview
link to Policy Governance without mixing policy templates and compliance rows
```

## Existing data impact

No existing compliance rows are overwritten by default.

No existing files are exposed publicly.

No existing business profile data is modified.

No transaction records are touched.

## Financial integrity impact

No payment, receipt, journal, settlement, reconciliation, invoice, subscription, rent/lease, deposit, commission, payout, inventory, delivery, amendment, Lucky ID, batch, or draw logic is changed.

## Auditability impact

Seed row creation records an audit event when rows are created.

Document create/update/review paths continue to record actor fields through existing model fields:

```text
uploaded_by
reviewed_by
verified_at
created_at
updated_at
```

## Future rent/lease compatibility

Rent/lease readiness benefits from:

```text
rental-agreement
ownership-proof
business-address-proof
security/deposit-related public policy separation
private proof handling
approved public summary control
```

Future tenant/asset proof or branch-specific compliance can be added as new templates without changing old documents.
