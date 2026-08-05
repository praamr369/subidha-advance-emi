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
| `cashier` (27 endpoints) | ✅ | Delta-reviewed `api/v1/views/cashier.py`. Confirmed: single write-path through `PaymentCollectionService`/`CustomerAdvanceService`/`collect_direct_sale_payment`, branch scoping via `scope_queryset_to_user_branches`, idempotency on collect-payment/direct-sale. **Fixed 2 findings:** (1) `CashierCollectAdvance` was missing the `@require_capability("billing.collect")` guard the other two money-collection endpoints enforce → added; (2) removed dead `_parse_amount`/`_parse_optional_int` helpers + unused import. Regression lock: `test_cashier_collection_delta.py` (revoked capability → 403 on all three). Remaining cashier views (day-close, dashboard, notifications, receivables) are list/detail read views covered by Layer-A smoke + `cashier.spec.ts`. |
| `billing` (80 endpoints) | ✅ | Delta-reviewed `api/v1/views/billing.py` (all ViewSets `IsAdmin` via `AdminBillingModelViewSet` — Layer B). Every state-changing `@action` (DirectSale confirm/collect/cancel/finalize/mark-delivered; Invoice approve/cancel/post/create-delivery; Credit/Debit-note approve/post; Receipt void/reverse) delegates to a service, maps `ValueError`→400 / `DoesNotExist`→404 / `PermissionError`→403, and destructive ops require a reason via `get_serializer_class` routing. **No bug found — section is sound.** Regression lock: `test_billing_action_delta.py` (action→serializer routing + required reason/amount). 78 business endpoints ticked in routes.md (2 APIRootView index rows excluded). |
| `accounting` (195 endpoints) | 🟡 | Delta-reviewed the journal/ledger core across `accounting.py` + `accounting_phase2.py` + `accounting_phase3.py` (178 endpoints ticked, all `IsAdmin` via the Layer-B accounting bases). Confirmed the uniform pattern: every posting/approve/cancel/reversal action delegates to a service, maps `ValueError`→400, destructive ops require a reason, and the 7 bridge-run endpoints share one sound `_BridgeRunView.post` (service delegation + audit via `log_audit`). Journal reversal (`JournalEntryViewSet.void`, `JournalGroupReverseView`) is guarded by `@require_capability("accounting.reverse_entry")` — **locked** by `test_accounting_reversal_delta.py` (revoked → 403). No bug found. **Remaining (~15, not deep-reviewed):** `admin_tds_tcs` (7 — TDS/TCS deduction + mark-deposited), `accounting_year_end_close` (2), commission/purchase bridge run views, `admin_accounting_setup`. Note: accounting_phase2/3 actions are IsAdmin-only with no capability layer (internally consistent — not a gap). |
| `partner` (40 endpoints) | ✅ | Delta-reviewed the partner portal (partner_dashboard/finance/commission/collection_requests/kyc, subscription_requests, product_requests, paginated_registers). Tenancy is the rule and it holds: every view is `IsPartner`-gated **and** owner-scoped (`.filter(partner=request.user)`; detail views `.filter(partner=partner, pk=pk)` → cross-partner returns 404). Verified `partner_kyc.py`'s `PartnerKycDocument` import resolves (valid re-export from `models_kyc_workflow`). No bug. Lock: `test_portal_gates_delta.py` (all four portals). |
| `customer` / `vendor` / `staff` portals (61+19+17) | ✅ | Delta-reviewed the three remaining portals. Same tenancy pattern as partner: role-gated + owner-scoped (`.filter(<owner>=request.user)` in customer/vendor/staff view modules). **Fixed 1 finding:** `CustomerReviewListView` (`/customer/reviews/`) shipped as bare `IsAuthenticated` — owner-scoped so not a leak, but off-convention; added `IsCustomer`. Lock: `test_portal_gates_delta.py` asserts every `/partner/`, `/customer/`, `/vendor/`, `/staff/` endpoint carries its role gate. |
| `admin` (1741 endpoints) — **in progress** | 🟡 | Auth is fully proven for the whole admin surface (Layer-A admin matrix rejects every non-admin role × the Layer-B base ViewSets declaring IsAdmin), and the ~152 `admin_resources` + 60 accounting CRUD ViewSet endpoints are green-by-inheritance (Layer B). Delta-reviewing the bespoke actions sub-section by sub-section: **reversal sub-section done** (`reversal_center` 17 + `reversal_control` 13 = 30 endpoints) — every reversal/void/refund/return action delegates to a service, requires an audit reason, and maps errors; IsAdmin-only by design (business reversals; the raw journal tool separately needs `accounting.reverse_entry`). Lock: `test_admin_reversal_delta.py` (receipt-void requires a reason). **admin sub-sections done:** reversals (30), **recovery** (13, `admin_recovery` — defaulter cases, guarantors, schemes, targets/leaderboard, legal-notice, settlement-offer, bulk-escalate, settlement; IsAdmin, aging-based stage machine with SETTLED/WRITTEN_OFF guards; bulk-escalate has dry_run. Lock: `test_admin_recovery_delta.py` — dry-run is safe/non-mutating. No bug; the Layer-A `status`-import NameError fix on the settlement view stays covered by smoke). **settlements** ✅ (`admin_settlements`, 21) — bank/UPI statement imports, manual allocation create/void, cashier day-close approve/reject: all IsAdmin, delegate to settlement services, map errors; day-close is a SUBMITTED→APPROVED/REJECTED state machine. Lock: `test_admin_settlement_delta.py` (allocation create requires source+account+amount). No bug. **finance-complete + systemic gate audit** ✅ — **found + fixed 20 privilege-escalation leaks**: `/admin/` endpoints gated by bare `IsAuthenticated` (no IsAdmin), so any authenticated non-admin could reach them. Worst: `admin_finance_complete` (12 — incl. `lease_post_to_gl` which *posts to the general ledger*, plus leases/deferred-tax/fixed-assets/financial-reports); also `admin_pod` (4), `admin_prepayment` (3 — incl. delivery-unlock), `crm_workbench` WorkbenchActionListView (1). Added `IsAdmin` to all. The Layer-A admin matrix missed these because it only tests endpoints that *declare* IsAdmin. **Systemic lock:** `test_admin_surface_gated.py` asserts every `/api/v1/admin/` endpoint is admin-inclusive-gated (IsAdmin/*OrAdmin/IsInternalAdmin/CanManageBrochures[ADMIN·CASHIER·STAFF]), excluding the IsCustomer `/admin/customer/…` namespace — closes the whole class (would have caught these + the earlier payables leak). **reconciliation** ✅ (`admin_reconciliation_control_tower`, 8) — modules/runs/run-checks/items + item resolve/reopen; all IsAdmin, resolve/reopen delegate to `resolve_item`/`reopen_item` and require action+note (audit). Lock: `test_admin_reconciliation_delta.py` (resolve requires action+note). No bug. **rent-lease bridge** ✅ (`admin_rent_lease_accounting_bridge`, 18) — readiness/config/enable-disable, account mapping, accounting summary, customer advances, and 8 paired preview/execute posting endpoints (deposit collection/refund/damage + monthly rent-lease demand) via a shared `_ActionView` base. All IsAdmin; each action delegates to a bridge service. Lock: `test_admin_rent_lease_bridge_delta.py` — every PreviewView binds a `preview_*` (non-posting) service and every ExecuteView an `execute_*` service, so a "preview" can never silently post to the ledger. No bug. **deliveries** ✅ (`admin_deliveries`, 22) — delivery lifecycle state machine (transition/mark-delivered/mark-failed/cancel/request-return/mark-returned) + list/create/detail/pdf/source-subscriptions/direct-sales. All IsAdmin; each action get_object_or_404's then delegates to a delivery service, maps errors. Lock: `test_admin_deliveries_delta.py` (transition requires target status; failure requires a reason). No bug. **kyc** ✅ (`admin_kyc`, 29) — upload/approve/reject/request-resubmission of KYC documents for customer/partner/vendor/staff + review queue + audit trail. All IsAdmin; every action delegates to `kyc_workflow_service`; reject requires a reason; document detail lookups are owner-scoped (`get_object_or_404(..., partner_user=partner)`). Covered by the systemic admin-gate lock + Layer-A smoke + the Layer-A PartnerKycDocument ImportError fix + the [[project_kyc_upload_guard]] review (admin-upload force_review vs self-upload SUBMITTED). No new test needed. No bug. **contracts** ✅ (`admin_contracts` 19 + `contract_amendments`/`contract_amendment_lifecycle` admin views) — contract lifecycle (rent/lease create, approve/activate/cancel/close) + amendment workflow (list/create/review/approve/reject/apply/implement, product-recontract preview/decision). All IsAdmin; 404-guard targets, delegate to contract services, map ValidationError→400; cancel + amendment reject require a reason. Lock: `test_admin_contracts_delta.py` (amendment rejection requires rejection_reason). No bug. **Remaining admin sub-sections ⬜:** rent-lease bridge(18), deliveries(22), kyc(29), policy-site(30), business-setup(24), migration(22), crm-module(21), contracts(19), hr(18), opening-stock(14), + the admin_resources custom actions. |
| _(add rows as sections are reviewed)_ | ⬜ | |

---

## Definition of done (from the strategy §9)

- [x] Layer A CI job green (auth matrix, endpoint smoke, schema).
- [ ] Layer A page-load smoke green (A.4 first CI run).
- [x] Layer B ledger: every shared base class, gate, service pattern, frontend part signed off.
- [ ] Layer C: every module section delta-reviewed.
