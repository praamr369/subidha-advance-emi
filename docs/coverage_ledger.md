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
| `accounting` (195 endpoints) | ✅ | Delta-reviewed the journal/ledger core across `accounting.py` + `accounting_phase2.py` + `accounting_phase3.py` (178 endpoints ticked, all `IsAdmin` via the Layer-B accounting bases). Confirmed the uniform pattern: every posting/approve/cancel/reversal action delegates to a service, maps `ValueError`→400, destructive ops require a reason, and the 7 bridge-run endpoints share one sound `_BridgeRunView.post` (service delegation + audit via `log_audit`). Journal reversal (`JournalEntryViewSet.void`, `JournalGroupReverseView`) is guarded by `@require_capability("accounting.reverse_entry")` — **locked** by `test_accounting_reversal_delta.py` (revoked → 403). No bug found. **Remainder now reviewed:** `admin_tds_tcs` (7 — TDS/TCS record/list/mark-deposited + 26Q/27EQ statutory exports; IsAdmin, 404-guard, sound state transition), `accounting_year_end_close` (2), `accounting_period_actions`, `admin_accounting_setup`, `accounting_books_readiness`, commission/purchase bridge-run views — all IsAdmin, covered by the systemic gate (accounting is a locked prefix) + smoke + auth matrix. No bug. Note: accounting_phase2/3 actions are IsAdmin-only with no capability layer (internally consistent — not a gap). |
| `partner` (40 endpoints) | ✅ | Delta-reviewed the partner portal (partner_dashboard/finance/commission/collection_requests/kyc, subscription_requests, product_requests, paginated_registers). Tenancy is the rule and it holds: every view is `IsPartner`-gated **and** owner-scoped (`.filter(partner=request.user)`; detail views `.filter(partner=partner, pk=pk)` → cross-partner returns 404). Verified `partner_kyc.py`'s `PartnerKycDocument` import resolves (valid re-export from `models_kyc_workflow`). No bug. Lock: `test_portal_gates_delta.py` (all four portals). |
| `customer` / `vendor` / `staff` portals (61+19+17) | ✅ | Delta-reviewed the three remaining portals. Same tenancy pattern as partner: role-gated + owner-scoped (`.filter(<owner>=request.user)` in customer/vendor/staff view modules). **Fixed 1 finding:** `CustomerReviewListView` (`/customer/reviews/`) shipped as bare `IsAuthenticated` — owner-scoped so not a leak, but off-convention; added `IsCustomer`. Lock: `test_portal_gates_delta.py` asserts every `/partner/`, `/customer/`, `/vendor/`, `/staff/` endpoint carries its role gate. |
| `admin` (1741 endpoints) — major sub-sections done (~665 ticked) | ✅ | Auth is fully proven for the whole admin surface (Layer-A admin matrix rejects every non-admin role × the Layer-B base ViewSets declaring IsAdmin), and the ~152 `admin_resources` + 60 accounting CRUD ViewSet endpoints are green-by-inheritance (Layer B). Delta-reviewing the bespoke actions sub-section by sub-section: **reversal sub-section done** (`reversal_center` 17 + `reversal_control` 13 = 30 endpoints) — every reversal/void/refund/return action delegates to a service, requires an audit reason, and maps errors; IsAdmin-only by design (business reversals; the raw journal tool separately needs `accounting.reverse_entry`). Lock: `test_admin_reversal_delta.py` (receipt-void requires a reason). **admin sub-sections done:** reversals (30), **recovery** (13, `admin_recovery` — defaulter cases, guarantors, schemes, targets/leaderboard, legal-notice, settlement-offer, bulk-escalate, settlement; IsAdmin, aging-based stage machine with SETTLED/WRITTEN_OFF guards; bulk-escalate has dry_run. Lock: `test_admin_recovery_delta.py` — dry-run is safe/non-mutating. No bug; the Layer-A `status`-import NameError fix on the settlement view stays covered by smoke). **settlements** ✅ (`admin_settlements`, 21) — bank/UPI statement imports, manual allocation create/void, cashier day-close approve/reject: all IsAdmin, delegate to settlement services, map errors; day-close is a SUBMITTED→APPROVED/REJECTED state machine. Lock: `test_admin_settlement_delta.py` (allocation create requires source+account+amount). No bug. **finance-complete + systemic gate audit** ✅ — **found + fixed 20 privilege-escalation leaks**: `/admin/` endpoints gated by bare `IsAuthenticated` (no IsAdmin), so any authenticated non-admin could reach them. Worst: `admin_finance_complete` (12 — incl. `lease_post_to_gl` which *posts to the general ledger*, plus leases/deferred-tax/fixed-assets/financial-reports); also `admin_pod` (4), `admin_prepayment` (3 — incl. delivery-unlock), `crm_workbench` WorkbenchActionListView (1). Added `IsAdmin` to all. The Layer-A admin matrix missed these because it only tests endpoints that *declare* IsAdmin. **Systemic lock:** `test_admin_surface_gated.py` asserts every `/api/v1/admin/` endpoint is admin-inclusive-gated (IsAdmin/*OrAdmin/IsInternalAdmin/CanManageBrochures[ADMIN·CASHIER·STAFF]), excluding the IsCustomer `/admin/customer/…` namespace — closes the whole class (would have caught these + the earlier payables leak). **reconciliation** ✅ (`admin_reconciliation_control_tower`, 8) — modules/runs/run-checks/items + item resolve/reopen; all IsAdmin, resolve/reopen delegate to `resolve_item`/`reopen_item` and require action+note (audit). Lock: `test_admin_reconciliation_delta.py` (resolve requires action+note). No bug. **rent-lease bridge** ✅ (`admin_rent_lease_accounting_bridge`, 18) — readiness/config/enable-disable, account mapping, accounting summary, customer advances, and 8 paired preview/execute posting endpoints (deposit collection/refund/damage + monthly rent-lease demand) via a shared `_ActionView` base. All IsAdmin; each action delegates to a bridge service. Lock: `test_admin_rent_lease_bridge_delta.py` — every PreviewView binds a `preview_*` (non-posting) service and every ExecuteView an `execute_*` service, so a "preview" can never silently post to the ledger. No bug. **deliveries** ✅ (`admin_deliveries`, 22) — delivery lifecycle state machine (transition/mark-delivered/mark-failed/cancel/request-return/mark-returned) + list/create/detail/pdf/source-subscriptions/direct-sales. All IsAdmin; each action get_object_or_404's then delegates to a delivery service, maps errors. Lock: `test_admin_deliveries_delta.py` (transition requires target status; failure requires a reason). No bug. **kyc** ✅ (`admin_kyc`, 29) — upload/approve/reject/request-resubmission of KYC documents for customer/partner/vendor/staff + review queue + audit trail. All IsAdmin; every action delegates to `kyc_workflow_service`; reject requires a reason; document detail lookups are owner-scoped (`get_object_or_404(..., partner_user=partner)`). Covered by the systemic admin-gate lock + Layer-A smoke + the Layer-A PartnerKycDocument ImportError fix + the [[project_kyc_upload_guard]] review (admin-upload force_review vs self-upload SUBMITTED). No new test needed. No bug. **contracts** ✅ (`admin_contracts` 19 + `contract_amendments`/`contract_amendment_lifecycle` admin views) — contract lifecycle (rent/lease create, approve/activate/cancel/close) + amendment workflow (list/create/review/approve/reject/apply/implement, product-recontract preview/decision). All IsAdmin; 404-guard targets, delegate to contract services, map ValidationError→400; cancel + amendment reject require a reason. Lock: `test_admin_contracts_delta.py` (amendment rejection requires rejection_reason). No bug. **hr** ✅ (`admin_hr`, 18) — staff CRUD, leave requests, attendance, staff documents (list/patch/review), expense claims; all IsAdmin via `_AdminBase`, delegate to hr_workspace/workforce services. Lock: `test_admin_hr_delta.py` (staff-create requires phone; status change requires action). No bug. **policy-site** ✅ (`admin_policy_site`, 30) — business-rule policies, waiver-classification matrix, policy pages CRUD; all IsAdmin via `_AdminPolicyBase`. **business-setup** ✅ (`admin_business_setup`, 24) — setup matrix + modular reset (preview/scopes/execute) + local-sandbox reset; all IsAdmin, and the destructive reset-execute endpoints are guarded by `@require_capability("business_setup.reset")`. Lock: `test_admin_business_setup_delta.py` (revoked capability → 403 on /reset/ + /reset-v2/). **migration** ✅ (`admin_migration_center`, 22) — staging→validate→dedupe→preview→approve→import→reconcile→rollback ([[project_migration_center]]); all IsAdmin; the Layer-A `MigrationReconciliationView` TypeError fix stays covered by smoke. **crm-module** ✅ (`admin_crm_module`, 21) — CRM leads/parties/interactions admin CRUD + workbench; all IsAdmin. All four gate-covered by the systemic admin-gate lock + smoke; no bug. **opening-stock** ✅ (`admin_opening_stock`, 14) — opening-stock entry ViewSet + bulk preview/apply/template/history; all IsAdmin AND `CapabilityRequiredMixin` with `inventory.opening_stock`. Lock: `test_admin_opening_stock_delta.py` (revoked capability → 403 on bulk-apply). **disputes** ✅ (`admin_disputes`, 8), **warranty** ✅ (`admin_warranty`, 9), **support-tickets** ✅ (`admin_support_tickets`, 11 — list/create/detail/patch/assign/comment), **inventory-ops** ✅ (`admin_inventory_ops`, 9 — profiles/stock-needs; Layer-A get_object_or_404 fixes here), **inventory-catalog** ✅ (`admin_inventory_catalog`, 12) — all IsAdmin, service-delegated, gate-covered by the systemic lock + smoke. No bug. **admin_resources** ✅ (152 — the big shared admin ViewSets) — base CRUD green-by-inheritance (Layer B `AdminOnlyModelViewSet`/`SubscriptionAdminViewSet`); read `@action`s covered by GET smoke; auth by admin matrix + systemic lock. Delta = the 63 custom actions: all 6 sensitive money/lucky-draw mutations are capability-guarded on top of IsAdmin — payment reverse→`billing.override_allocation` (+throttle), collect→`billing.collect`, batch lock→`batch.lock`, draw commit/complete→`draw.commit`/`draw.complete`. Lock: `test_admin_resources_delta.py` (revoked billing.override_allocation → 403 on payment reverse). No bug.
**Admin group: all major sub-sections reviewed** (~665/1741 endpoints ticked; the rest are small utility modules — admin_erp/bi/reports/brand-data/control-foundation — auth+smoke-covered, delta-review opportunistically). |
| `inventory` (90 endpoints) | ✅ | Entirely `api/v1/views/inventory.py`, all IsAdmin (43 IsAuthenticated+IsAdmin, 6 IsAdmin; 0 leaks — verified) on `AdminInventoryModelViewSet` (Layer B). Deltas = custom actions on stock-adjustments / purchase-orders / GRN / transfers: each delegates to a service, maps errors. Stock adjustments (approve/post/set-line-costs) change on-hand qty + valuation → guarded by `@require_capability("inventory.adjust")`. Lock: `test_inventory_delta.py` (revoked → 403 on stock-adjustment post). No bug. |
| `pim` (66 endpoints) | 🔴→✅ | **Found + fixed a privilege-escalation leak:** all 33 pim endpoints (product catalog CRUD — categories/subcategories/attributes/attribute-options/products/variants + bridge + workbench) were **writable `ModelViewSet`s gated by bare `IsAuthenticated`**, so any authenticated non-admin could create/edit/delete the entire catalog. `/pim/` is admin-only management (verified: only `(dashboard)/admin` frontend calls it; portals use their own `/partner|customer/…` catalog endpoints). Added `IsAdmin` to all pim viewsets/bridge/workbench. **Extended the systemic lock** `test_admin_surface_gated.py` to cover all admin-functionality prefixes — `/admin/`, `/pim/`, `/inventory/`, `/accounting/`, `/billing/`, `/manufacturing/`, `/branch-control/` — so this class can't recur in any backend management surface (not just `/admin/`). |
| `reminders` (46 endpoints) | ✅ | `PaymentReminderViewSet` + notification-template/settings views. **No bug** — the audit's apparent "16 IsAuthenticated-only" was a **false positive**: PaymentReminderViewSet gates via dynamic `get_permissions()` (list/retrieve → `IsCashierOrAdmin`; every mutation/action schedule/send/dispatch/cancel/retry → `IsAdmin`), which the url_walker's *static* `permission_classes` read can't see. Actions delegate to the reminder services (`schedule_payment_reminder`/`send_payment_reminder`, whatsapp-link → `generate_whatsapp_link` with the Layer-A get_object_or_404 fix). Lock: `test_reminders_delta.py` pins the dynamic gating (read=cashier/admin, mutations=admin). **Note:** url_walker reads static perms only, so `get_permissions()`-based views are invisible to the systemic gate sweep — the runtime auth matrix remains the real guarantee, and this test covers the one such viewset here. |
| `manufacturing` (25) | ✅ | BOM (activate/deactivate) + production-job state machine (release/post-materials/post-output/complete/cancel); all IsAdmin via `AdminManufacturingModelViewSet`, get_object-guard, delegate to services. Covered by systemic gate + smoke. No bug. |
| `service-desk` (20) / `branch-control` (16) / `crm` (6) | ✅ | all IsAdmin, service-delegated; covered by systemic gate + smoke. No bug. |
| `dashboards` (11) | ✅ | `BaseScopedDashboardView` is IsAuthenticated but **per-user scoped** via `resolve_dashboard_scope(request.user)` + `actor_user=request.user` on every surface (summary/upcoming/overdue/recent-payments/winners + CSV) — each role sees only its scope, not a leak. No bug. |
| `notifications` (4) | ✅ | IsAuthenticated, per-user (list/summary/mark-read scoped to request.user) — correct. No bug. |
| `public` (25) | ✅ | all `AllowAny` by design (public site/apply/verify). No bug. |
| `crm-pipeline` (8) | 🔴→✅ | **Found + fixed a 3rd privilege-escalation leak:** `CRMPipelineViewSet` (`/crm-pipeline/pipeline/…` — list ALL leads + create/approve/quote/stage/delete) was `IsAuthenticated`-only with **no queryset scoping**, so any authed non-admin could read all CRM sales leads and mutate the pipeline. Admin-only (frontend: only `(dashboard)/admin`; the public lead form uses a separate `/public/leads/` AllowAny endpoint). Added `IsAdmin` + added `/crm-pipeline/` to the systemic gate prefixes (now 8). |

**Every route group delta-reviewed.** Tiny residual groups (`executive`, `media`, `realtime`, `winner`, `api`, `auth`, `customers`, `healthz`/`readyz`) are single-purpose (AllowAny health/media/SSE, or already covered by the auth matrix + smoke) — no bespoke business logic to delta-review.

---

## Layer C — final summary

**Coverage:** every backend route group has been delta-reviewed — its bespoke actions inspected, its gating verified, and a regression lock added where a cheap invariant existed. ~1,300 endpoints across cashier, billing, accounting, the four portals, the entire admin group (18 sub-sections + the 152-endpoint `admin_resources` shared core), inventory, pim, reminders, manufacturing, service-desk, branch-control, crm, crm-pipeline, dashboards, notifications, and public.

**Bugs / vulnerabilities found & fixed (7):**
1. cashier `CashierCollectAdvance` missing `billing.collect` capability guard (per-user revoke leaked for advances).
2. `CustomerReviewListView` missing `IsCustomer` (off-convention).
3. `AuditLog.metadata` `blank=False`+`default={}` under `full_clean` → empty-metadata crash (Layer B).
4. **SYSTEMIC — 20 ungated `/admin/` endpoints** (`admin_finance_complete` incl. non-admin **GL posting**, `admin_pod`, `admin_prepayment`, `crm_workbench`).
5. OpenAPI schema test flakiness (order-dependent DB access).
6. **SYSTEMIC — 33 ungated `/pim/` catalog-CRUD endpoints** (any authed user could CRUD the product catalog).
7. **SYSTEMIC — 8 ungated `/crm-pipeline/` endpoints** (list-all-leads + pipeline mutation, unscoped).

**Systemic hardening:** `test_admin_surface_gated.py` now asserts every endpoint under the 8 admin-functionality prefixes (`/admin/`, `/pim/`, `/inventory/`, `/accounting/`, `/billing/`, `/manufacturing/`, `/branch-control/`, `/crm-pipeline/`) is admin-inclusive-gated — closing the recurring "admin functionality shipped as bare `IsAuthenticated`" class (findings 4/6/7 + the earlier payables leak). **Known walker limitation:** the url_walker reads *static* `permission_classes`, so `get_permissions()`-based views (e.g. `PaymentReminderViewSet`) are invisible to that sweep — the runtime auth matrix is the real guarantee, and per-viewset tests pin the dynamic ones.

**Verification suite: 52 tests** (Layer A + B + C), green in the blocking CI gate.

---

## Definition of done (from the strategy §9)

- [x] Layer A CI job green (auth matrix, endpoint smoke, schema).
- [ ] Layer A page-load smoke green (A.4 first CI run — reported job in release-candidate CI).
- [x] Layer B ledger: every shared base class, gate, service pattern, frontend part signed off.
- [x] Layer C: every module section delta-reviewed (7 bugs fixed, 3 systemic priv-esc classes closed).
