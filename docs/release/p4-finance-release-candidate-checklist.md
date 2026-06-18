# P4 Finance Release Candidate Checklist

- [ ] Worktree contains only intentional P4-RC changes.
- [ ] Backend system check passes.
- [ ] Migration dry-run reports no changes.
- [ ] Accounting, reconciliation, billing, and subscription suites pass.
- [ ] P4 endpoint contract and no-write integration tests pass.
- [ ] Admin-only access is verified for every P4 endpoint.
- [ ] Frontend route check, typecheck, lint, and smoke build pass.
- [ ] Financial Intelligence, Trial Balance, Liability Reconciliation, Close Cockpit, and Accounting Exports render.
- [ ] Empty/deferred and seeded finance postures render without console or framework errors.
- [ ] 390px viewport remains usable.
- [ ] Action items are ordered CRITICAL, WARNING, INFO.
- [ ] CSV downloads call real GET endpoints.
- [ ] No posting, sync, reconciliation, period-lock, payment, EMI, or source-mutation button exists on P4 pages.
- [ ] Full `scripts/run-release-candidate.sh` passes.
- [ ] Deployment and rollback notes in `docs/operations/p4-release-candidate-hardening.md` are reviewed.
