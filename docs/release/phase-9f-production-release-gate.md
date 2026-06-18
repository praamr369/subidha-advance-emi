# Phase 9F — Production Release Gate & Regression Matrix

Branch: `update`  
Gate date: 2026-06-18  
Status: automated gate passed on 2026-06-18; manual browser smoke remains pending. Deployment or merge is not release-cleared until the applicable manual smoke checklist is completed with evidence.

## 1. Release scope

This release contains the Phase 0–9E current-state improvements: admin route taxonomy, the no-flip admin route policy, operational page clarity, object cockpit polish, contract activation readiness surfacing, and readiness-gated action UX.

This release does **not** include route ownership flipping, route deletion, backend endpoint deletion, accounting automation changes, new payment semantics, or changes to existing financial, stock, delivery, draw, rent/lease, commission, payout, reconciliation, or audit behavior.

Phase 9F is a validation and documentation phase. It adds no business feature and authorizes no lifecycle mutation.

## 2. Critical business invariants

The following invariants are release requirements:

- **Product base price = total contract price.**
- **Default EMI = total contract price / tenure months.**
- **Customer can have multiple subscriptions.**
- **Customer can hold multiple Lucky IDs.**
- **One Lucky ID per batch slot.**
- **Lucky draw winner receives future EMI waiver only.** Paid historical EMIs are not retroactively changed.
- **Rent/Lease has no Lucky ID.**
- **Rent/Lease security deposit is refundable liability.**
- **Rent/Lease monthly demand remains separate from deposit.**
- **Payment, receipt, waiver, delivery, commission, payout, accounting bridge, reconciliation, and audit records remain controlled and auditable.**
- **Readiness display is read-only; backend remains authoritative.** Readiness screens and banners must not create or mutate payment, receipt, journal, money movement, stock, bridge-posting, reconciliation, commission, payout, delivery, or contract state.

## 3. Regression matrix

Risk levels reflect the consequence of a regression, not test complexity. Commands are run from `backend/` unless marked `frontend/`.

| Area | Must test | Backend command/test | Frontend route/screen | Expected pass condition | Risk level |
|---|---|---|---|---|---|
| Auth and role redirects | Login, refresh, logout, and role landing behavior for ADMIN, CASHIER, PARTNER, CUSTOMER | `python manage.py test tests.api.test_auth tests.api.test_role_dashboard_notifications_scope` | `/login`, role dashboards | Correct role destination; no redirect loop or half-authenticated state | P0 |
| Admin route guard | Non-admin access is rejected; admin access remains available | `python manage.py test tests.api.test_permissions tests.api.test_capability_matrix_rbac` | Any `/admin/*` route | Unauthorized roles cannot render admin data | P0 |
| Customer profile/register | Approved customer registration/profile workflow and defensive payload handling | `python manage.py test tests.api.test_customer_access_workflow tests.api.test_admin_customer_operational_profile` | `/register`, `/admin/customers`, customer profile | Real API data; ownership and role controls hold | P1 |
| Partner profile/register | Approved partner registration/profile workflow and scoped access | `python manage.py test tests.api.test_partner tests.api.test_admin_partners` | Partner registration/profile, `/admin/partners` | Partner sees only permitted records; internal roles are not publicly registered | P1 |
| Vendor profile/procurement boundary | Vendor identity remains separate from procurement operations | `python manage.py test tests.api.test_vendor_operational_summary tests.api.test_vendor_ops_api` | `/admin/profiles/vendors`, `/admin/vendors`, `/admin/purchases` | Identity and procurement links are clear; no invented aggregate state | P1 |
| Advance EMI subscription creation | Product price, tenure, batch, Lucky ID, and schedule creation | `python manage.py test tests.subscriptions tests.api.test_admin_subscriptions` | `/admin/subscriptions/advance-emi/create` | Contract uses backend-calculated amount; unique slot assigned; deterministic schedule created | P0 |
| Rent contract creation | RENT contract has no Lucky ID and preserves deposit/demand separation | `python manage.py test tests.subscriptions.test_kyc_contract_gating tests.subscriptions.test_rent_lease_billing_service` | `/admin/subscriptions/rent/create` | Valid draft/activation behavior; no Lucky ID; controlled readiness response | P0 |
| Lease contract creation | LEASE contract has no Lucky ID and requires lease-specific evidence when gated | `python manage.py test tests.subscriptions.test_kyc_contract_gating tests.subscriptions.test_rental_asset_lifecycle` | `/admin/subscriptions/lease/create` | Lease is created without Lucky ID; condition/readiness rules remain authoritative | P0 |
| EMI schedule generation | Count, due order, rounding remainder, total equality | `python manage.py test tests.subscriptions tests.domain.test_subscription_financial_service` | Subscription detail EMI schedule | EMI rows total exactly to contract amount and retain month sequence | P0 |
| Payment collection | Canonical collection service, locking, overpayment/status guards, audit links | `python manage.py test tests.domain.test_payment_service tests.api.test_cashier tests.billing.test_billing_row_locking` | `/admin/finance/collect`, cashier collection | One controlled payment path; invalid/duplicate collection blocked; persisted evidence traceable | P0 |
| Receipt generation | Receipt issuance links to actual payment and remains reproducible | `python manage.py test tests.billing.test_billing_emi_receipt_generation tests.billing.test_billing_receipt_issue_void` | Collection success/receipt view | Receipt generated from persisted source; no duplicate or unlinked receipt | P0 |
| PAID/WAIVED EMI immutability | Settled and waived rows cannot silently revert or merge meanings | `python manage.py test tests.subscriptions.test_emi_immutability` | Subscription EMI table | PAID and WAIVED remain distinct and protected | P0 |
| Lucky batch creation | Batch constraints and lifecycle transition validation | `python manage.py test tests.api.test_admin_batch_transitions` | `/admin/batches`, `/admin/lucky-plan/batches` | Batch rules hold; no fake readiness or winner state | P0 |
| Lucky ID assignment 00–99 | Range, uniqueness per batch slot, assignment locking | `python manage.py test tests.api.test_admin_lucky_ids tests.api.test_emi_multiple_lucky_ids_same_batch` | `/admin/lucky-ids`, EMI create | Only 00–99; one subscription per batch slot; customer may hold multiple IDs through subscriptions | P0 |
| Lucky draw commit/reveal/publish | Commitment, reveal locking, eligibility, publish trace | `python manage.py test tests.subscriptions.test_lucky_draw_reveal_locking tests.api.test_lucky_draw_public_trust` | `/admin/lucky-draws`, public winner trust views | Commit/reveal evidence matches; repeated execution cannot corrupt state | P0 |
| Winner future EMI waiver | Only future eligible EMIs are waived; paid history unchanged | `python manage.py test tests.api.test_admin_subscriptions tests.domain.test_winner_state_service` | Batch/subscription winner state | Future-only waiver; paid EMI and receipts remain unchanged | P0 |
| Contract activation readiness | Plan-specific blockers, categories, read-only computation | `python manage.py test tests.subscriptions.test_contract_activation_readiness tests.subscriptions.test_kyc_contract_gating` | `/admin/subscriptions/[id]` | Backend result drives READY/BLOCKED; evaluating readiness creates no source records | P0 |
| Readiness-gated action UX | Ready, blocked, and not-evaluated states; no bypass action | N/A; `frontend/: node --test tests/unit/contract-activation-readiness-9d.test.ts tests/unit/contract-activation-readiness-9e.test.ts` | Subscription detail activation/handover areas | UI mirrors backend fields and remains read-only | P0 |
| Delivery/handover eligibility | Readiness gate, stock posture, and delivery transition | `python manage.py test tests.domain.test_delivery_service tests.subscriptions.test_kyc_contract_gating tests.inventory.test_delivery_inventory_bridge` | `/admin/deliveries`, subscription detail | Delivery is blocked when enabled gating reports blockers | P0 |
| Duplicate completed delivery prevention | A completed delivery cannot be duplicated | `python manage.py test tests.domain.test_delivery_service tests.api.test_admin_deliveries` | Delivery workspace/detail | Duplicate terminal delivery is rejected without extra stock movement | P0 |
| Inventory stock adjustment and posting readiness | Missing unit cost is actionable; posting guards hold | `python manage.py test tests.inventory.test_stock_adjustment_posting tests.api.test_inventory_stock_adjustments_api` | `/admin/inventory/adjustments` | Invalid adjustment blocked with useful error; valid posting uses movement source | P0 |
| Inventory stock ledger immutability | Stock history remains movement-ledger based | `python manage.py test tests.inventory.test_stock_movement_service tests.accounting.test_accounting_bridge_stockledger_posting_phase_f8` | `/admin/inventory/ledger`, movements | Posted movement history is not silently rewritten | P0 |
| Purchase/vendor payable boundary | Receipt, bill, payable, payment remain separate controlled stages | `python manage.py test tests.inventory.test_vendor_purchase_management tests.inventory.test_vendor_bill_payment_guards` | `/admin/purchases/*`, `/admin/vendors/*` | No purchase page fabricates payment/accounting completion | P0 |
| Direct sale workflow | Sale, stock, invoice, receipt, cancellation/return integration | `python manage.py test tests.billing.test_direct_sale_workflow tests.api.test_direct_sale_api` | `/admin/billing/direct-sale`, `/admin/sales/direct-sale/create` | Source records and transitions remain linked, controlled, and auditable | P0 |
| Rent/lease deposit readiness | Full collection evidence; refundable liability semantics | `python manage.py test tests.subscriptions.test_rent_lease_security_deposit_source_contract_phase_f16 tests.accounting.test_accounting_bridge_security_deposit_receipt_phase_f17` | Subscription readiness, `/admin/finance/deposits` | Deposit is separate liability and readiness uses persisted evidence only | P0 |
| Rent/lease monthly demand | Monthly demand generation/collection remains separate from deposit | `python manage.py test tests.subscriptions.test_rent_lease_billing_service tests.subscriptions.test_rent_lease_collection_router` | Rent/lease contract and collection screens | Demand amount/status is not replaced by deposit state | P0 |
| Commission generation/approval/payment | Eligibility, duplicate prevention, reversal, settlement trace | `python manage.py test tests.domain.test_commission_service tests.api.test_admin_commissions tests.api.test_admin_commission_bulk_settle` | `/admin/finance/commissions` | Commission lifecycle is source-linked and reversible through controlled workflow | P0 |
| Payout batch workflow | Preview, approval/payment, duplicate settlement guard | `python manage.py test tests.domain.test_commission_payout_service tests.api.test_admin_payout_batch_actions tests.api.test_admin_payout_batch_preview` | `/admin/finance/payout-batches` | Same commission cannot be paid twice; batch evidence remains traceable | P0 |
| Accounting bridge posting | Mapping, balance, idempotency, source linkage | `python manage.py test tests.accounting.test_accounting_bridge_idempotency tests.accounting.test_operational_bridge_posting` | `/admin/accounting/bridge-reconciliation` | Balanced, idempotent posting with explicit source and failure evidence | P0 |
| Reconciliation | Mismatch detection and lifecycle exclusions; no silent repair | `python manage.py test tests.reconciliation tests.domain.test_reconciliation` | `/admin/accounting/bridge-reconciliation` | Exceptions remain visible and auditable; reports do not mutate source truth | P0 |
| Trial Balance/P&L/Balance Sheet boundaries | Read-only balanced reports sourced from posted accounting data | `python manage.py test tests.accounting.test_reporting_trial_balance tests.accounting.test_reporting_profit_loss tests.accounting.test_reporting_balance_sheet` | `/admin/accounting/reports/*` | Reports load without creating operational or accounting records | P0 |
| BI read-only reports | No mutation/fake KPI; drill-down to source modules | `python manage.py test tests.api.test_admin_bi tests.api.test_admin_reports_analytics` | `/admin/bi/*`, `/admin/reports*` | Only backend-supported values shown; documented gaps remain honest empty states | P1 |
| HR/staff workflow separation | Staff, attendance, payroll, salary payment stay distinct | `python manage.py test tests.api.test_admin_hr tests.accounting.test_admin_hr_staff_creation_workflow` | `/admin/hr/*` | Staff creation does not create payroll/accounting/payment records | P1 |
| Staff self-service separation | Staff-facing access cannot reach admin HR controls | `python manage.py test tests.api.test_capability_matrix_rbac tests.api.test_permissions` | Staff/self-service routes if enabled | Role boundary enforced; admin HR remains internal | P1 |
| PDF branding/contract generation | Optional branding fields, especially absent PAN | `python manage.py test tests.subscriptions.test_pdf_branding_service tests.domain.test_document_engine_service` | Contract/PDF generation from subscription detail | Contract generation returns a valid PDF and does not 500 when PAN is absent | P0 |
| No-flip route policy | Canonical aliases still redirect canonical → legacy content owner | N/A; `frontend/: node --test tests/unit/route-cleanup-phase-9a.test.ts tests/unit/route-cleanup-phase-9b-nf.test.ts` | Canonical and legacy admin paths | No page-content move, redirect reversal, route deletion, or endpoint deletion | P0 |
| Canonical alias direction | Every locked alias target remains unchanged | N/A; `frontend/: node --test tests/unit/route-cleanup-phase-9b1.test.ts` | `/admin/profiles/*`, `/admin/lucky-plan/*`, `/admin/finance/*`, `/admin/requests/*` | Canonical path redirects to current legacy content owner | P0 |
| Frontend loading/error/empty states | Operational pages handle pending, failed, empty, and partial payloads | `frontend/: npm run typecheck && npm run lint && npm run build:smoke` | Admin/customer/partner/cashier operational screens | No crash, fabricated fallback data, or unusable blank state | P1 |

## 4. Required validation commands

Run from the repository root exactly as shown.

### Backend check

```bash
cd backend
source .venv/bin/activate
.venv/bin/python manage.py check
```

### Backend migration drift check

```bash
cd backend
source .venv/bin/activate
.venv/bin/python manage.py makemigrations --check --dry-run
```

### Backend subscriptions tests

```bash
cd backend
source .venv/bin/activate
.venv/bin/python manage.py test tests.subscriptions --verbosity=1
```

### Backend billing, accounting, reconciliation, and inventory tests

```bash
cd backend
source .venv/bin/activate
.venv/bin/python manage.py test tests.billing tests.accounting tests.reconciliation tests.inventory --verbosity=1
```

### Frontend typecheck, lint, and production smoke build

```bash
cd frontend
npm run typecheck
npm run lint
npm run build:smoke
```

### Native Node unit tests used in Phases 9A–9E

```bash
cd frontend
node --test tests/unit/contract-activation-readiness-9d.test.ts
node --test tests/unit/contract-activation-readiness-9e.test.ts
node --test tests/unit/route-cleanup-phase-9a.test.ts
node --test tests/unit/route-cleanup-phase-9b-nf.test.ts
node --test tests/unit/profiles-routes.test.ts
node --test tests/unit/lucky-plan-routes.test.ts
node --test tests/unit/finance-accounting-routes.test.ts
node --test tests/unit/inventory-purchase-vendor-chain.test.ts
node --test tests/unit/crm-requests-service-desk-routes.test.ts
node --test tests/unit/hr-staff-routes.test.ts
node --test tests/unit/bi-reports-routes.test.ts
node --test tests/unit/phase-9f-production-release-gate.test.ts
```

### Production-fix tests

The script is present at `frontend/scripts/run-production-fix-tests.mjs` and is mandatory:

```bash
cd frontend
node scripts/run-production-fix-tests.mjs
```

## 5. Manual smoke checklist

Record tester, environment, date/time, and evidence link for each item.

- [ ] Login as ADMIN; session and admin redirect are correct.
- [ ] Login as CASHIER; cashier-only collection route loads without admin access.
- [ ] Login as PARTNER; partner dashboard loads only partner-scoped data.
- [ ] Login as CUSTOMER; customer dashboard loads only the customer’s data.
- [ ] Admin dashboard loads with real backend state and usable loading/error/empty behavior.
- [ ] Cashier collection path loads and does not create a payment before explicit confirmed submission.
- [ ] Customer dashboard loads without private admin or other-customer data.
- [ ] Partner dashboard loads without other-partner or admin data.
- [ ] Subscription detail readiness panel loads.
- [ ] Readiness blockers show the exact backend blocker code/message and do not show fake READY state.
- [ ] Delivery page shows the readiness note and points staff to subscription-level readiness.
- [ ] Inventory adjustment with missing unit cost shows an actionable validation message and does not post stock.
- [ ] EMI dropdown shows labels such as **“1st EMI of 15”**, not raw database IDs.
- [ ] PDF contract generation does not return HTTP 500 when PAN is absent.
- [ ] No route ownership flip occurred; locked canonical routes still redirect to legacy content owners.

## 6. Known deferred gaps

These are honest deferred gaps, not release-ready features:

- `/admin/lucky-plan/winners` has no backend aggregate endpoint.
- `/admin/reports/customer-analytics` lacks cohort/retention/churn aggregate.
- `/admin/vendors/ledger` and `/admin/vendors/outstanding` are stub/per-vendor concepts.
- `/admin/purchases/vendor-returns` has no aggregate endpoint.
- `/admin/finance/customer-credits` has no page/backend endpoint.
- `/admin/finance/refunds` has no standalone page; reversal-control owns current workflow.
- `/admin/inventory/items/[id]` detail cockpit does not exist yet.
- Customer/batch detail audit timeline endpoints are not dedicated yet.
- Accounting bridge status on outstandings remains advisory unless explicit accounting workflow confirms it.
- `EmployeeDocument` has no `VERIFIED`/`REJECTED` status.
- `EmployeeProfile` lacks first-class `weekly_off` and `emergency_contact_relation`.
- Staff `ONBOARDING` persists as `DRAFT`.
- Manufacturing remains separate/deferred.

## 7. Release blockers

The release is blocked by any of the following:

- Any migration detected unexpectedly.
- Any backend financial/inventory/accounting test failure.
- Any frontend build failure.
- Any raw payment/receipt/journal/stock/reconciliation creation from readiness display.
- Any route flip.
- Any fake readiness/KPI/stock/money value.
- Any PDF HTTP 500 in contract generation.
- Any EMI label regression to raw database IDs.
- Any delivery allowed when readiness blocks it under enabled gating.

Failures must be fixed and the affected command group rerun. A waiver must not be used to bypass financial, audit, stock, role, route, or readiness safety.

## 8. Commit/merge policy

- Require a clean working tree before merge.
- Require no unrelated dirty backend files.
- Require commit messages matching the actual work.
- Require no accidental automation commit with a mismatched message.
- Require Phase 9F validation evidence in PR/merge notes, including command, date, result, failure/fix references, manual-smoke evidence, and final `git status --short`.
- Do not auto-commit Phase 9F work.
- Stop after Phase 9F. Do not start feature work, route cleanup, route flip, deletion, or backend lifecycle changes.

## Validation evidence record

The PR or merge notes must contain:

| Gate | Required evidence |
|---|---|
| Backend system check | Command output with zero errors |
| Migration drift | `No changes detected` and zero exit status |
| Subscriptions suite | Test count and `OK` |
| Billing/accounting/reconciliation/inventory suite | Test count and `OK` |
| Frontend typecheck | Zero exit status |
| Frontend lint | Zero exit status; warnings documented if any |
| Frontend smoke build | Successful production build |
| Phase 9A–9E native tests | Every named file passes |
| Phase 9F document guard | All assertions pass |
| Production-fix script | Exit code 0 |
| Manual smoke | Completed checklist with environment and tester |
| Repository state | `git status --short` and `git diff --stat` attached |

## Phase 9F automated validation result — 2026-06-18

| Gate | Result |
|---|---|
| Django system check | PASS — no issues |
| Migration drift | PASS — `No changes detected`; command emitted a database migration-history connectivity warning, but exited successfully and generated no migration |
| Subscriptions suite | PASS — 442 tests, 1 skipped |
| Billing/accounting/reconciliation/inventory suite | PASS — 835 tests, 4 skipped |
| Frontend typecheck | PASS |
| Frontend lint | PASS |
| Frontend smoke build | PASS — optimized Next.js production build completed |
| Required Phase 9A–9E native tests | PASS — every named test file exited 0 |
| Phase 9F documentation guard | PASS |
| Production-fix tests | PASS — EMI label, inventory adjustment, and page wiring tests |
| Focused EMI label backend test | PASS — 3 tests |
| Canonical alias-direction lock | PASS |
| Manual browser smoke | PENDING — requires a deployed/local integrated environment and role credentials |

Automated validation alone does not clear the branch for production. The manual smoke checklist is still required, especially role login/redirect behavior, readiness blocker rendering, delivery gating, inventory validation copy, EMI dropdown labels, and contract PDF generation with absent PAN.
