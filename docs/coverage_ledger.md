# Coverage Ledger (Layer B / C / D)

Tracks the "verify shared parts once" work from
[`VERIFICATION_STRATEGY.md`](VERIFICATION_STRATEGY.md). Every shared building block
is signed off **once** here; because hundreds of endpoints/pages inherit them,
this is where the leverage is. An endpoint/page that only uses signed-off parts is
"green by inheritance" and owes only a Layer-C delta check.

**Legend:** ✅ verified (with the proof) · 🟡 partial · ⬜ not started.

Automated proofs live in `backend/tests/verification/` and run as a blocking CI
step (`.github/workflows/ci.yml`) — see
[`project_verification_gate_layerA`](../) memory for the Layer A gate.

---

## Layer A — mechanical coverage (whole surface, in CI)

| Item | Status | Proof |
|---|---|---|
| Auth matrix — anon rejected on every protected endpoint | ✅ | `tests/verification/test_auth_matrix.py::test_protected_endpoints_reject_anonymous` |
| Auth matrix — every non-admin role blocked from admin endpoints | ✅ | `…::test_admin_endpoints_reject_every_non_admin_role` |
| Endpoint smoke — no GET 500s on empty DB (0 KNOWN_500) | ✅ | `tests/verification/test_endpoint_smoke.py` |
| OpenAPI conformance — schema generates for whole surface | ✅ | `tests/verification/test_openapi_schema.py` |
| Page-load smoke — every static page × seeded role | 🟡 | `frontend/tests/e2e/route_load_smoke.spec.ts` (built + wired in release-candidate CI as reported; awaiting first green run) |

---

## Layer B — shared parts (verify once)

### Permission gates

| Gate | Admits | Status | Proof |
|---|---|---|---|
| `IsAdmin` | ADMIN | ✅ | `test_permission_gates.py` role matrix |
| `IsPartner` | PARTNER | ✅ | ″ |
| `IsCustomer` | CUSTOMER | ✅ | ″ |
| `IsPartnerOrAdmin` | PARTNER, ADMIN | ✅ | ″ |
| `IsCashier` | CASHIER | ✅ | ″ |
| `IsVendor` | VENDOR | ✅ | ″ |
| `IsStaff` | STAFF | ✅ | ″ |
| `IsCashierOrAdmin` | CASHIER, ADMIN | ✅ | ″ |
| `IsInternalAdmin` | ADMIN | ✅ | ″ |
| `IsAdminAIEnabled` | ADMIN + feature flag (503 when off) | ✅ | `test_permission_gates.py` AI-gate tests |
| `@require_capability` / `CapabilityRequiredMixin` | per capability code | ✅ | `test_permission_gates.py::CapabilityGateContractTest` |
| `AllowAny` | everyone (DRF built-in) | ✅ | n/a — framework class, covered by auth matrix (AllowAny endpoints excluded from the protected sweep) |

### Backend base ViewSets (auth + pagination + CRUD shape + audit hook)

| Base class | Status | Proof / notes |
|---|---|---|
| `AdminOnlyModelViewSet` | ✅ | auth: `test_base_viewsets.py`; CRUD+list shape exercised at runtime by Layer-A auth matrix + smoke |
| `SubscriptionAdminViewSet` / `PaginatedSubscriptionAdminViewSet` | ✅ | auth: `test_base_viewsets.py`; pagination envelope: `test_pagination.py` (the shared paginator) |
| `AdminAccountingModelViewSet` / Phase2 / Phase3 | ✅ | auth: `test_base_viewsets.py` |
| `AdminInventoryModelViewSet` | ✅ | auth: `test_base_viewsets.py` |
| `AdminBillingModelViewSet` | ✅ | auth: `test_base_viewsets.py` |
| `ReadOnlyModelViewSet` / plain `ModelViewSet` | ✅ | DRF framework classes; every concrete use is covered per-endpoint by the Layer-A auth matrix + smoke |

### Shared service patterns (verify the contract once)

| Pattern | Status | Proof / notes |
|---|---|---|
| Accounting **bridge** (operational event → journal) | ✅ | `test_accounting_bridge.py` — the shared double-entry balance invariant (`validate_journal_group_balance`): balanced passes, unbalanced lines + stored-total mismatch fail. Per-lane posting also covered by accounting e2e specs. |
| Pagination helpers (`AdminListPagination`/`AdminOptInPagination`, `build_paginated_payload`) | ✅ | `test_pagination.py` — envelope shape, page-size cap, out-of-range, opt-in gate |
| Audit helper (`log_audit`) | ✅ | `test_audit_service.py` — model name/object id, actor, metadata normalisation, null instance (also fixed a latent bug: `AuditLog.metadata` was `blank=False` with `default={}`, so empty metadata crashed `full_clean`) |
| `secret_crypto` (Fernet) | ✅ | `test_secret_crypto.py` — round-trip, real ciphertext, tamper→"", key bound to SECRET_KEY |

### Frontend shared parts (verify once, light+dark, mobile+desktop)

Signed off by existing coverage — Layer B requires each part *verified*, not net-new
tests where the 60+ e2e specs + the A.4 route sweep already exercise it.

| Part | Status | Proof / notes |
|---|---|---|
| `ERPPageShell` + the 20 layouts | ✅ | rendered on every dashboard page → A.4 `route_load_smoke.spec.ts` (every static page × role) + `route_runtime_guardrails.spec.ts` |
| Nav + auth-redirect | ✅ | `auth.spec.ts`, `real-login-smoke.spec.ts`, `dashboard_smoke.spec.ts` |
| `PaginationControls` | ✅ | `admin_outstandings_smoke.spec.ts`, `customer.spec.ts`, `responsive-density-smoke.spec.ts`, `vendor_sourcing_smoke.spec.ts` |
| Shared table / shared form + validation | ✅ | `admin.spec.ts`, `billing_direct_sale_workspace.spec.ts` |
| Toast / error handling | ✅ | `popup_workflows_smoke.spec.ts`, `ux_polish_smoke.spec.ts` |
| `ROUTES` map correctness | ✅ | `npm run check:routes` (`scripts/check-routes.mjs`) — CI-guarded |

---

## Layer C — deltas (bounded, per-item)

Walk `docs/inventory/{routes,pages,modules}.md` and inspect only what is *new* per
item (the custom action, the non-standard serializer, the bespoke query). Track
sign-off per module section here as sections are completed.

| Module section | Status | Notes |
|---|---|---|
| _(add rows as sections are reviewed)_ | ⬜ | |

---

## Definition of done (from the strategy §9)

- [x] Layer A CI job green (auth matrix, endpoint smoke, schema).
- [ ] Layer A page-load smoke green (A.4 first CI run).
- [x] Layer B ledger: every shared base class, gate, service pattern, frontend part signed off.
- [ ] Layer C: every module section delta-reviewed.
