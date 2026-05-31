# Business Compliance Governance

Branch: `update`

Status: **Phase BC-2 compliance review workflow and admin evidence UI implemented**

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
Do not approve seeded checklist rows without real evidence files.
Do not expose private files publicly.
Do not create public downloadable ownership/rental/bank/PAN/GST files.
Seeded checklist rows do not make readiness complete.
Public summary exposure requires separate summary approval after document approval.
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
GET  /api/v1/admin/settings/business-compliance/documents/
POST /api/v1/admin/settings/business-compliance/documents/
GET  /api/v1/admin/settings/business-compliance/documents/:id/
PATCH /api/v1/admin/settings/business-compliance/documents/:id/
POST /api/v1/admin/settings/business-compliance/documents/:id/submit-review/
POST /api/v1/admin/settings/business-compliance/documents/:id/approve/
POST /api/v1/admin/settings/business-compliance/documents/:id/reject/
POST /api/v1/admin/settings/business-compliance/documents/:id/expire/
POST /api/v1/admin/settings/business-compliance/documents/:id/approve-public-summary/
POST /api/v1/admin/settings/business-compliance/documents/:id/revoke-public-summary/
GET  /api/v1/admin/public-site/business-compliance/summary/
```

Compatibility document list/detail routes remain:

```text
GET  /api/v1/admin/public-site/business-compliance/documents/
POST /api/v1/admin/public-site/business-compliance/documents/
PATCH /api/v1/admin/public-site/business-compliance/documents/:id/
```

Public API:

```text
GET /api/v1/public/business-compliance/summary/
```

## Review-state model

BC-2 adds an additive table:

```text
business_compliance_document_review_states
```

It stores workflow state without replacing the existing `BusinessComplianceDocument` row.

Fields include:

```text
review_status
reviewed_at
rejected_reason
expires_at
approved_public_summary
public_summary_approved_at
public_summary_approved_by
source_template_key
evidence_uploaded_at
last_action_reason
```

Existing BC-1 compliance documents are backfilled by migration `0079_backfill_business_compliance_review_state.py`.

## Review workflow

Valid review statuses:

```text
PENDING
UNDER_REVIEW
APPROVED
REJECTED
EXPIRED
```

Service-layer actions:

```text
update_document_metadata
mark_under_review
approve_document
reject_document
expire_document
approve_public_summary
revoke_public_summary
```

Approval rules:

```text
Approval requires a real evidence file.
Seeded empty rows cannot be approved.
Reject requires a reason.
Expire/deactivate requires a reason.
Replacing evidence resets review status to PENDING and revokes public summary approval.
Changing public summary or visibility revokes public summary approval.
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
creates review_status = PENDING
attaches no fake file
sets no verified/approved status
is idempotent
never overwrites existing matching rows
```

A seeded row is an operator checklist placeholder, not evidence.

## Public/private exposure

Private files are never public-downloadable by default.

The public summary API exposes only rows where:

```text
is_active = true
public_visibility = PUBLIC_SUMMARY_ONLY
verification_status = VERIFIED
review_status = APPROVED
approved_public_summary = true
public_summary is not empty
```

It does not expose file URLs.

GST/Udyam public text must remain honest:

```text
Not provided / will be updated after registration.
```

unless actual approved evidence/status exists.

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
rejected_count
expired_count
missing_file_count
public_summary_pending_count
recommended_missing_count
required_checks
recommended_checks
templates
privacy_rule
```

Readiness is `BLOCKED` when:

```text
active business profile is missing
required premises proof is missing/unapproved/missing file
required business address proof is missing/unapproved/missing file
required PAN/tax proof is missing/unapproved/missing file
required bank proof is missing/unapproved/missing file
any active compliance row has no evidence file
```

Readiness warns when:

```text
GST evidence is missing/unapproved
Udyam/MSME evidence is missing/unapproved
shop/trade license evidence is missing/unapproved
any compliance rows are pending review
any compliance rows are rejected
any compliance rows are expired/deactivated
any public summary waits for separate summary approval
```

Readiness can be `READY` only when required evidence is approved and warning conditions are clear.

## Setup Readiness integration

Setup Readiness includes:

```text
business_compliance
```

Launch checklist includes:

```text
can_complete_business_compliance
```

Setup Readiness remains read-only. It does not seed rows, upload files, approve documents, or mutate financial records.

BC-2 metadata exposed inside Setup Readiness:

```text
missing_required_count
pending_review_count
approved_required_count
required_count
recommended_missing_count
rejected_count
expired_count
missing_file_count
public_summary_pending_count
required_checks
recommended_checks
```

## Frontend behavior

The Business Compliance page shows:

```text
compliance review status cards
required/recommended/optional template checklist
seed required/recommended rows action
safe add-row form with optional evidence file upload
human document type labels
document register with evidence, review status, public summary state, reviewer, and actions
row-level evidence upload/replace
submit review action
approve evidence action
reject with reason action
expire/deactivate with reason action
approve public summary action
revoke public summary action
document review detail panel
public summary preview
links to Setup Readiness and Policy Governance
```

The page does not expose a manual `VERIFIED` status dropdown.

## Existing data impact

Existing compliance rows are preserved.

Existing files are not exposed publicly.

Existing BC-1 rows receive additive review-state rows through migration `0079`.

No existing business profile data is modified.

No transaction records are touched.

## Financial integrity impact

No payment, receipt, journal, settlement, reconciliation, invoice, subscription, rent/lease, deposit, commission, payout, inventory, delivery, amendment, Lucky ID, batch, or draw logic is changed.

## Auditability impact

Audit events are recorded for:

```text
seed rows
metadata update
evidence upload/replace
submit review
approve evidence
reject evidence
expire/deactivate evidence
approve public summary
revoke public summary
```

Audit metadata includes:

```text
document_id
document_type
old_status
new_status
actor
reason
changed fields
approved_public_summary
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
expiry/deactivation history
```

Future tenant/asset proof or branch-specific compliance can be added as new templates without changing old documents.
