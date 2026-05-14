# Public Content Management Runbook (Phase 8)

## Scope in production now
Use admin path `/admin/settings/business-setup/public-site` to manage:
- display name/tagline
- hero title/subtitle
- support contact
- social links
- public address/map/business hours
- public logo URL

This UI writes to `/api/v1/admin/public-site/profile/`.

## Safety checks before publish
1. Confirm edited content is informational only.
2. Do not use this flow to represent price overrides, stock promises, or winner claims.
3. Validate URLs are `https://`.
4. Ensure support contact values are correct and branch-owned.

## Operational constraints
- Public profile has one active record at a time.
- Changes are logged via `PUBLIC_SITE_UPDATED` audit events.
- Public pages consume data from `/api/v1/public/business-profile/` plus live public product/winner APIs.

## Incident handling
If incorrect public content is published:
1. Admin immediately patches corrected values in the same endpoint.
2. Verify public pages (`/`, `/contact`, footer/nav) reflect corrected values.
3. Record corrective action in operations logs with actor/time context.

## Non-supported CMS workflows (current)
No endpoint-backed workflows yet for:
- banner rotation
- FAQ/policy block editing
- campaign page authoring
- media library approvals

Treat these as controlled backlog work, not live operations.
