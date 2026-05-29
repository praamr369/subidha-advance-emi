# Developer Change Workflow

This workflow applies to all future SUBIDHA CORE backend, frontend, documentation, deployment, and operational changes.

Before starting any change, read:

1. `AGENTS.md`
2. `docs/SUBIDHA_CORE_PROJECT_RULEBOOK.md`

The project rulebook is the canonical business and technical reference. This file is only the lightweight execution workflow for applying that rulebook during daily development.

## 1. Start with the rulebook

Do not begin by proposing code. First confirm the expected behavior from the current repository and the canonical rulebook.

Required first checks:

- Read `AGENTS.md`.
- Read `docs/SUBIDHA_CORE_PROJECT_RULEBOOK.md`.
- Inspect the current code paths before suggesting or applying changes.
- Do not invent models, serializers, services, endpoints, routes, pages, or business rules.

## 2. Classify the change risk

Every change must be classified before implementation.

| Risk | Meaning | Examples |
|---|---|---|
| P0 financial/audit/security | Can affect money, payment truth, audit trail, reconciliation, permissions, data integrity, or deployment safety. | EMI/payment/waiver/commission/payout/reconciliation/accounting/auth/migration changes. |
| P1 workflow/API/role integration | Can affect operational workflow, API contracts, role routing, or backend/frontend integration. | New admin workflow, customer/partner/cashier route, serializer field, endpoint integration. |
| P2 UI/docs/cleanup | Low-risk UI, documentation, copy, dead UI cleanup, or non-operational refactor. | Docs, labels, layout improvements, tests for selectors, safe cleanup. |

When uncertain, classify higher.

## 3. Identify impacted domains

List the domains touched by the change before editing files.

Common domains:

- Customer
- Partner
- Product
- Batch
- Lucky ID
- Subscription / contract
- EMI schedule
- Payment
- Customer advance
- Waiver / winner benefit
- Lucky draw
- Commission
- Payout
- Reconciliation
- Accounting / finance accounts
- Direct sale / invoice / receipt
- Delivery / fulfillment
- Inventory / stock movement
- Rent / lease / security deposit
- Contract amendment
- Auth / roles / permissions
- Dashboard / reporting
- Import / onboarding / reset / backup
- Deployment / environment

## 4. Inspect existing code first

Before implementation, inspect the relevant current files.

### Backend inspection checklist

List affected backend items:

- Models
- Serializers
- Services
- Views/viewsets
- Routes
- Permissions
- Admin/configuration files
- Tests
- Management commands/scripts

Use existing service-layer patterns. Views should remain thin. Financial workflows must stay explicit and transactional.

### Frontend inspection checklist

List affected frontend items:

- Service modules
- API client/session/auth utilities
- Route constants
- App Router pages
- Role guards/layouts
- Components
- Forms/tables/dashboards
- Tests

Use real endpoints only. Keep pages thin. Normalize backend payloads in services/adapters, not scattered across pages.

## 5. State impact before coding

Every change plan must state:

- Existing data impact
- Migration impact
- API contract impact
- Reconciliation/accounting impact
- Audit impact
- Role/permission impact
- Daily shop usability impact
- Future rent/lease compatibility impact
- Deployment/rollback impact

For P0 and P1 changes, include the exact affected files and the intended safety boundary before implementation.

## 6. Implementation rules

- Prefer additive, non-breaking changes.
- Do not silently mutate historical money records.
- Do not move financial business logic into the frontend.
- Do not weaken permissions for convenience.
- Do not create fake UI buttons or mocked production data.
- Do not delete compatibility routes/fields without checking frontend, tests, and docs.
- Keep commits focused and reviewable.
- Update documentation when behavior changes.

## 7. Testing and validation

Add or update tests according to risk.

### P0 changes

Expected coverage:

- Service/domain tests
- Permission tests
- Reconciliation/accounting tests where relevant
- Migration/backfill tests where relevant
- Frontend tests for operational UI if UI changes are included
- Release-candidate validation before push/deploy

### P1 changes

Expected coverage:

- API/serializer tests where backend behavior changes
- Frontend integration tests where routes/services/components change
- Role navigation and permission checks where applicable

### P2 changes

Expected coverage:

- Lint/typecheck/build or existing documentation checks where available
- UI smoke or selector tests if the change affects rendered operational pages

Run the strongest practical validation for the change. For release work, use:

```bash
bash scripts/run-release-candidate.sh
```

If a check cannot be run, state why.

## 8. Commit rules

Before committing:

- Confirm the working tree contains only intended files.
- Review the diff.
- Verify no backend/frontend logic changed for documentation-only work.
- Verify no migrations or API contracts changed unless explicitly required.
- Use a clear commit message.

Recommended commands:

```bash
git status --short
git diff --stat
```

For focused review:

```bash
git diff -- <path>
```

## 9. Required completion report

Every completed change must include the summary format from:

`docs/development/CHANGE_REVIEW_TEMPLATE.md`

At minimum, report:

- Summary
- Files changed
- Existing data impact
- Financial integrity impact
- Auditability impact
- Daily shop usability impact
- Future rent/lease compatibility impact
- API contract impact
- Migration impact
- Role/permission impact
- Reconciliation/accounting impact
- Tests/checks run
- Deployment/rollback notes
- Uncertainty or gaps
