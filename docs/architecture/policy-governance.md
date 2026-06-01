# Policy Governance

Branch: `update`

Status: **Phase PG-2B stored governance metadata and lifecycle migration implemented**

## Purpose

Policy Governance controls public legal pages and internal operating-control policies for SUBIDHA CORE.

It keeps these rules explicit:

```text
Seeded policies remain DRAFT.
DRAFT is never public.
APPROVED public policy is not public until PUBLISHED.
INTERNAL policy is never served by public policy APIs.
Stored governance metadata decides public/internal exposure.
```

Public launch requires reviewed and published public policies. Internal governance policies support staff/admin controls and auditability, but they are not customer-facing legal pages.

## Stored data model

The existing `PolicyPage` row remains the canonical policy content/version row.

Stored fields already on `PolicyPage`:

```text
slug
version
category
title
summary
content
status
effective_date
last_reviewed_at
published_at
published_by
created_by
updated_by
```

PG-2B adds an additive one-to-one metadata table:

```text
policy_governance_metadata
```

Stored governance metadata fields:

```text
policy
visibility: PUBLIC | INTERNAL
governance_category
coverage_group
requires_legal_review
requires_admin_acceptance
owner
reviewer
approved_by
archived_by
submitted_for_review_at
approved_at
archived_at
review_due_date
internal_acceptance_at
internal_accepted_by
rejection_reason
archive_reason
source_template_key
```

The separate metadata table preserves existing policy rows, content, URLs, versions, and public behavior while making governance state durable.

## Lifecycle states

PG-2B expands policy lifecycle states additively:

```text
DRAFT
UNDER_REVIEW
APPROVED
PUBLISHED
ARCHIVED
```

Existing values remain valid:

```text
DRAFT stays DRAFT
PUBLISHED stays PUBLISHED
ARCHIVED stays ARCHIVED
```

No migration publishes drafts or changes policy content.

## Lifecycle transitions

Supported service-layer transitions:

```text
DRAFT -> UNDER_REVIEW
UNDER_REVIEW -> APPROVED
UNDER_REVIEW -> DRAFT with rejection_reason
APPROVED -> PUBLISHED for PUBLIC policies
DRAFT -> PUBLISHED only when review_now=true for backward compatibility
APPROVED/PUBLISHED -> ARCHIVED with archive_reason
DRAFT/UNDER_REVIEW/APPROVED/PUBLISHED INTERNAL -> internally accepted
```

Rules:

```text
Reject requires reason.
Archive stores reason, archived_by, archived_at.
Published/approved content is locked; use create-draft before editing legal content.
Create-draft copies governance metadata and resets lifecycle metadata.
Internal policy acceptance never exposes the policy publicly.
```

## Admin APIs

Existing admin policy APIs remain:

```text
GET  /api/v1/admin/public-site/policies/
POST /api/v1/admin/public-site/policies/
GET  /api/v1/admin/public-site/policies/by-slug/:slug/
PATCH /api/v1/admin/public-site/policies/:id/
POST /api/v1/admin/public-site/policies/:id/publish/
POST /api/v1/admin/public-site/policies/:id/archive/
POST /api/v1/admin/public-site/policies/:id/create-draft/
POST /api/v1/admin/public-site/policies/seed-defaults/
GET  /api/v1/admin/settings/policies/coverage/
```

PG-2B adds explicit admin-only lifecycle APIs:

```text
POST /api/v1/admin/public-site/policies/:id/submit-review/
POST /api/v1/admin/public-site/policies/:id/approve/
POST /api/v1/admin/public-site/policies/:id/reject/
POST /api/v1/admin/public-site/policies/:id/accept-internal/
POST /api/v1/admin/public-site/policies/:id/sync-governance-metadata/
```

Payload rules:

```text
reject: { reason }
archive: optional { reason }
publish: optional { effective_date, review_now }
sync-governance-metadata: no content/status mutation
```

All endpoints are authenticated admin-only.

## Coverage catalog

The coverage catalog lives in:

```text
backend/subscriptions/services/policy_coverage_catalog.py
```

It defines required policy slugs, labels, coverage groups, public/internal visibility, governance categories, compatible stored categories, admin-acceptance requirements, and seed template body.

## Default seed behavior

The seed endpoint creates missing templates only:

```text
POST /api/v1/admin/public-site/policies/seed-defaults/
```

Rules:

```text
all seeded policies are DRAFT
seed is idempotent by slug
existing policy content is not overwritten by default
published policies are not rewritten
internal policies are not made public
stored metadata is created from the coverage catalog
```

Explicit draft overwrite remains controlled by the existing `overwrite_existing_drafts` request flag.

## Public/internal exposure

Public policy APIs return policies only when both conditions are true:

```text
status = PUBLISHED
stored visibility = PUBLIC
```

Internal governance policies are excluded from public list/detail services even if their `status` is accidentally or historically `PUBLISHED`.

Unknown custom policy slugs can be public only when stored metadata is PUBLIC and status is PUBLISHED.

## Coverage matrix API

Admin read-only endpoint:

```text
GET /api/v1/admin/settings/policies/coverage/
```

Each row includes stored metadata plus catalog comparison:

```text
required_policy_key
label
coverage_group
catalog_coverage_group
category
stored_category
visibility
catalog_visibility
status
policy_id
slug
public_ready
internal_ready
blocker_reason
recommended_action
requires_legal_review
requires_admin_acceptance
metadata_synced
metadata_mismatches
review_due_date
```

Summary includes:

```text
required_count
missing_count
public_required_count
public_published_count
public_draft_count
public_under_review_count
public_approved_count
internal_required_count
internal_ready_count
internal_draft_count
internal_under_review_count
metadata_mismatch_count
```

Readiness meaning:

```text
PUBLIC ready = visibility PUBLIC + status PUBLISHED
INTERNAL ready = visibility INTERNAL + status APPROVED or internal_acceptance_at exists
PUBLISHED internal rows are treated as internally ready for compatibility but never public
```

Metadata mismatch behavior:

```text
visibility mismatch is dangerous and blocks readiness
category/group/admin-acceptance mismatch is surfaced for sync
sync-governance-metadata updates metadata only, not content or status
```

## Setup readiness integration

Setup Readiness includes a `policy_governance` section.

It blocks readiness when:

```text
required public policy templates are missing
required public policy templates are not PUBLISHED
stored metadata mismatch affects visibility/readiness
```

It warns when:

```text
internal governance templates are missing
internal governance templates are not approved/accepted
metadata mismatch exists but is not dangerous
review due date is past
```

Launch checklist includes:

```text
can_publish_public_policies
```

Setup Readiness remains read-only. It does not seed, submit, approve, publish, archive, sync metadata, or mutate historical rows.

## Frontend behavior

Service contract supports:

```text
submitAdminPolicyForReview(id)
approveAdminPolicy(id)
rejectAdminPolicy(id, reason)
acceptInternalPolicy(id)
syncPolicyGovernanceMetadata(id)
publishAdminPolicy(id, payload)
archiveAdminPolicy(id, reason)
createAdminPolicyDraft(id)
```

Frontend policy types now include stored governance metadata, lifecycle action flags, public/internal readiness, and metadata mismatch information.

## Existing data impact

Existing policies are not deleted.

Existing content is not overwritten.

Existing DRAFT/PUBLISHED/ARCHIVED statuses remain unchanged.

Existing rows receive additive governance metadata by migration.

Existing public URLs continue to work for PUBLIC + PUBLISHED policies.

## Public API safety

Public policy list/detail APIs rely on stored visibility metadata and status.

They never expose INTERNAL policies.

They never expose DRAFT, UNDER_REVIEW, APPROVED, or ARCHIVED policies.

## Financial integrity impact

No payment, receipt, journal, settlement, reconciliation, invoice, subscription, rent/lease, deposit, commission, payout, inventory, delivery, amendment, Lucky ID, batch, or draw logic is changed.

Policy Governance is setup/legal-governance only. It does not mutate money-moving records.

## Auditability impact

Audit events are recorded for:

```text
policy seed
policy create
policy update
submit review
approve
reject
publish
archive
create draft
internal acceptance
metadata sync
```

Governance metadata stores who reviewed, approved, archived, or internally accepted policy records.

## Future rent/lease compatibility

Policy Governance already separates rent/lease customer policies from internal operating controls.

This supports future rental/leasing expansion through durable governance around:

```text
rental/lease public terms
security deposit policy
possession/handover policy
return damage inspection policy
internal amendment controls
internal accounting/reconciliation controls
backup/restore and incident response controls
```

Future rent/lease policy additions can be catalog entries and stored metadata rows without changing historical policy content.
