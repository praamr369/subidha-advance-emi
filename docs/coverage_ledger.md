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
| `AdminOnlyModelViewSet` | ⬜ | |
| `SubscriptionAdminViewSet` / `PaginatedSubscriptionAdminViewSet` | ⬜ | |
| `AdminAccountingModelViewSet` / Phase2 / Phase3 | ⬜ | |
| `AdminInventoryModelViewSet` | ⬜ | |
| `AdminBillingModelViewSet` | ⬜ | |
| `ReadOnlyModelViewSet` / plain `ModelViewSet` | ⬜ | |

### Shared service patterns (verify the contract once)

| Pattern | Status | Proof / notes |
|---|---|---|
| Accounting **bridge** (operational event → journal) | ⬜ | |
| Pagination helpers (`AdminListPagination`/`AdminOptInPagination`, `build_paginated_payload`) | ⬜ | |
| Audit helper (`log_audit`) | ⬜ | |
| `secret_crypto` (Fernet) | ✅ | `test_secret_crypto.py` — round-trip, real ciphertext, tamper→"", key bound to SECRET_KEY |

### Frontend shared parts (verify once, light+dark, mobile+desktop)

| Part | Status | Proof / notes |
|---|---|---|
| `ERPPageShell` + the 20 layouts | ⬜ | partially exercised by existing e2e smokes |
| Nav + auth-redirect | ⬜ | |
| `PaginationControls` | ⬜ | |
| Shared table / shared form + validation | ⬜ | |
| Toast / error handling | ⬜ | |
| `ROUTES` map correctness | 🟡 | `npm run check:routes` guards it |

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
- [ ] Layer B ledger: every shared base class, gate, service pattern, frontend part signed off.
- [ ] Layer C: every module section delta-reviewed.
