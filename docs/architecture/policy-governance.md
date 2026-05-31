# Policy Governance

Branch: `update`

Status: **Phase PG-2A coverage matrix and public/internal separation implemented**

## Purpose

Policy Governance controls public legal pages and internal operating-control policies for SUBIDHA CORE.

It must keep three rules clear:

```text
Seeded policies remain DRAFT.
DRAFT is never public.
INTERNAL is never served by public policy APIs.
```

Public launch requires reviewed and published public policies. Internal governance policies support audit/control but do not replace legal review.

## Current implementation model

The existing `PolicyPage` model remains backward-compatible. No schema migration is required in Phase PG-2A.

Current stored fields include:

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

Phase PG-2A adds governance behavior through a policy coverage catalog and computed serializer/service fields rather than immediately changing existing data.

Computed metadata includes:

```text
visibility: PUBLIC | INTERNAL
governance_category
coverage_group
public_visible
internal_only
public_ready
internal_ready
requires_legal_review
review_due_date
last_published_at
```

## Coverage catalog

The coverage catalog lives in:

```text
backend/subscriptions/services/policy_coverage_catalog.py
```

It defines all required policy slugs, labels, coverage groups, visibility, governance categories, compatible stored categories, and seed template body.

Because the current database enum has fewer category choices, PG-2A stores a compatible category while exposing the richer governance category through the API.

Example:

```text
governance category: COOKIE_CONSENT
stored compatible category: PRIVACY
```

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
```

Explicit draft overwrite remains controlled by the existing `overwrite_existing_drafts` request flag.

## Public/internal separation

Public policy APIs only return policies when both conditions are true:

```text
status = PUBLISHED
visibility = PUBLIC
```

Internal governance policies are excluded from public policy list/detail services even if a row is accidentally published.

Admin policy APIs show both public and internal policy rows to authorized admins.

## Coverage matrix API

Admin read-only endpoint:

```text
GET /api/v1/admin/settings/policies/coverage/
```

Response includes:

```text
summary
groups
results
```

Each row includes:

```text
required_policy_key
label
coverage_group
category
stored_category
visibility
status
policy_id
slug
public_ready
internal_ready
blocker_reason
recommended_action
requires_legal_review
requires_admin_acceptance
```

Coverage groups:

```text
Public Legal
Customer Operations
Lucky Plan / EMI
Rent / Lease / Deposit
Service / Delivery / Warranty
Privacy / Data
Finance / Accounting Controls
Staff / Access / Audit
Inventory / Vendor / Commission
Backup / Incident Response
```

## Lifecycle behavior

Existing backend lifecycle states remain:

```text
DRAFT
PUBLISHED
ARCHIVED
```

The frontend type accepts future states:

```text
UNDER_REVIEW
APPROVED
```

Those future states are not stored yet in PG-2A. A later migration can add them additively.

Current readiness rule:

```text
PUBLIC ready = PUBLISHED and PUBLIC
INTERNAL ready = PUBLISHED and INTERNAL
```

Internal DRAFT rows generate setup warnings, not public API exposure.

## Setup readiness integration

Setup Readiness includes a `policy_governance` section.

It blocks readiness when:

```text
required public policy templates are missing
required public policy templates exist only as DRAFT/ARCHIVED
```

It warns when:

```text
internal governance templates are missing
internal governance templates are still DRAFT
```

Launch checklist includes:

```text
can_publish_public_policies
```

## Frontend behavior

Admin route:

```text
/admin/settings/policies
```

The page shows:

```text
All/Public/Internal/Draft/Published/Missing coverage filters
Policy Coverage Matrix grouped by governance area
PUBLIC/INTERNAL visibility badges
DRAFT/PUBLISHED/ARCHIVED lifecycle badges
public/internal readiness
blocker and recommended action
Open policy when row exists
Seed missing template when row is missing
```

The policy editor route remains:

```text
/admin/settings/policies/[slug]
```

The dynamic route uses unwrapped App Router params and does not access `params.slug` directly.

## Existing data impact

No existing policies are deleted.

No existing policy content is overwritten by default.

No payments, receipts, subscriptions, accounting, reconciliation, inventory, delivery, rent/lease, deposit, commission, payout, amendments, Lucky IDs, or batch records are changed.

## Financial integrity impact

No financial posting behavior changes.

Policy Governance is read/setup/legal-governance only. It does not mutate money-moving records.

## Auditability impact

Policy creation, update, publish, archive, draft creation, and seed actions continue to use the existing audit path.

Internal governance templates improve audit coverage for reversal, posting, reconciliation, day close, mapping, commission, vendor, inventory, amendment, access, audit retention, backup, and incident response.

## Future migration recommendation

A future additive migration should add stored fields for:

```text
visibility
owner
reviewer
approved_by
archived_at
review_due_date
requires_legal_review
requires_admin_acceptance
```

A future additive lifecycle update should add:

```text
UNDER_REVIEW
APPROVED
```

This was intentionally deferred from PG-2A to avoid breaking existing policy rows and public policy behavior.
