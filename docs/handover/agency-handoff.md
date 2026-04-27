# SUBIDHA CORE - Agency Handoff (Phase 6)

This handoff is for deployment and operations agencies taking SUBIDHA CORE from release-candidate readiness to VPS production rollout.

## Scope

- Platform is feature-complete through Phase 5.
- Latest release-candidate validation is green.
- Deterministic and auth smokes are green.
- This phase is **deployment readiness + operations reliability**, not new feature development.

## Non-Negotiable Guardrails

- Do not rewrite architecture.
- Do not alter business-critical logic for EMI/lucky draw/waiver/payment/reconciliation/commission/payout/rent-lease/inventory/accounting.
- Only additive/safe changes for:
  - deployment configuration
  - security hardening
  - performance and observability
  - docs/runbooks
  - production blockers

## Handover Deliverables

- Deployment guide: `docs/deployment/vps-deployment-guide.md`
- Environment variable matrix: `docs/deployment/environment-variables.md`
- Shop-floor ops runbook: `docs/operations/daily-shop-operations.md`
- Backup/restore runbook: `docs/operations/backup-restore-runbook.md`
- Troubleshooting matrix: `docs/operations/troubleshooting.md`
- Roles and permissions matrix: `docs/operations/roles-permissions.md`
- Pre-production checklist: `docs/operations/pre-production-test-checklist.md`

## Required Agency Validation

1. Production env sanity:
   - `DJANGO_ENV=production`
   - `DEBUG=false`
   - strict host/origin/csrf setup
   - strong secrets
2. Database readiness:
   - migrations clean
   - no pending model changes
   - rollback-tested backup/restore
3. Security posture:
   - role boundaries proven with real API checks
   - no unauthorized data leakage across customer/partner scopes
4. Operations rehearsal:
   - complete end-to-end real-world workflow checklist (Phase 6 docs)
5. Performance baseline:
   - acceptable response times under practical load scenarios

## Release Ownership Boundaries

- Product/business team owns business rule sign-off.
- Agency owns infrastructure rollout and deployment correctness.
- Engineering owns code-level fixes only when blocker is proven and safe.

## Final Release Gate

Do not switch traffic to production until all are true:

- validation suite is green
- backup + restore drill is successful
- health/readiness are green behind Nginx/SSL
- role-based security checks pass
- cross-module sync-chain checks pass (EMI, rent, lease, direct sale)
- no unresolved critical blockers in pre-production checklist
