# Kiranism Route → Category Map (Audit)

Date: 2026-05-20  
Scope: `frontend/src/app` App Router pages (`page.*`) only.  
Non-goals: no UI transformations; no backend/auth/API/route changes.

Total pages: **393**

## Phase-by-phase implementation order (planning only)

Important: this audit pass makes **no UI code changes**. The phases below are the planned execution order for later work, with strict “preserve contracts/behavior” constraints.

### Phase 0 — Route/category audit only

- **Goal**: complete inventory + categorization; identify high-risk routes and batching strategy.
- **Route families included**: public, auth, admin, cashier, customer, partner, vendor, compatibility.
- **Page paths included**: `frontend/src/app/**/page.*`
- **Pages excluded**: none (inventory includes all).
- **Risk level**: low (docs-only).
- **Allowed UI changes**: none.
- **Forbidden changes**: any route move/rename/delete; any auth/guard/session change; any API contract change.
- **Existing services/API contracts to preserve**: all (`frontend/src/services/**`, `frontend/src/lib/**`).
- **Suggested Codex implementation prompt title**: “Phase 0 — Route/category audit map”.
- **Fast tests to run**: (optional) `cd frontend && npm run check:routes`.

### Phase 1 — Shared ERP UI primitives and shell foundation

- **Goal**: establish Kiranism-style dashboard shell structure + Studio Admin polish **without changing behavior**.
- **Route families included**: admin, cashier, customer, partner, vendor (shell/layout only).
- **Page paths included**: shared layouts under `frontend/src/app/(dashboard)/**/layout.tsx` and shared layout components.
- **Pages excluded**: all `page.*` business surfaces unless explicitly selected as low-risk pilots.
- **Risk level**: medium.
- **Allowed UI changes**: layout spacing/typography, nav chrome, reusable shadcn/ui primitives used by existing pages.
- **Forbidden changes**: RoleGuard/auth/session behavior, nav meaning, route URLs, action handlers, service calls, API payload shapes.
- **Existing services/API contracts to preserve**: all `frontend/src/services/**`; routing constants in `frontend/src/lib/routes.ts`.
- **Suggested prompt title**: “Phase 1 — Dashboard shell foundation (no behavior changes)”.
- **Fast tests**: `cd frontend && npm run lint && npm run typecheck && npm run build`.
- **Foundation components now available** (for later phase migrations; no page logic moved):
  - `frontend/src/components/erp/ERPPageHeader.tsx`
  - `frontend/src/components/erp/ERPSectionShell.tsx`
  - `frontend/src/components/erp/ERPDataToolbar.tsx`
  - `frontend/src/components/erp/ERPRegisterShell.tsx`
  - `frontend/src/components/erp/ERPActionPanel.tsx`
  - `frontend/src/components/erp/ERPStatusBadge.tsx`
  - `frontend/src/components/erp/ERPAuditNote.tsx`
  - `frontend/src/components/erp/ERPDetailGrid.tsx`
  - `frontend/src/components/erp/ERPMobileCardList.tsx`
  - `frontend/src/components/erp/ERPMetricStrip.tsx`
  - Optional barrel exports: `frontend/src/components/erp/index.ts`

### Phase 2 — Public website / brand site

- **Goal**: modernize marketing/public pages with consistent brand tokens and shadcn/ui polish.
- **Route families included**: public.
- **Page paths included**: `frontend/src/app/(public)/**`
- **Pages excluded**: auth + all dashboard role portals.
- **Risk level**: low.
- **Allowed UI changes**: styling/layout/components; keep content and links intact.
- **Forbidden changes**: route URLs, any auth/session behavior, any invented KPIs/data/endpoints.
- **Services/contracts to preserve**: existing public product fetch/search patterns (if any).
- **Prompt title**: “Phase 2 — Public site polish”.
- **Fast tests**: `cd frontend && npm run check:routes`.
- **Phase 2 status (implemented)**:
  - **Transformed** (premium surface consistency + dark-mode safe panels): `/products`, `/products/[id]`, `/winners`, `/winner-history`, `/about`, `/contact`
  - **Deferred** (unchanged in Phase 2 to keep the diff safe and reviewable): `/apply`, `/blog`, `/blog/[slug]`, `/how-it-works`, `/lucky-plan`, `/lucky-plan/*`, `/policies`, `/policies/[slug]`, and other legal/policy pages

### Phase 3 — Admin cockpit / operations

- **Goal**: admin home/workspace navigation + operational dashboards (read-first) modernization.
- **Route families included**: admin.
- **Page paths included**: `frontend/src/app/(dashboard)/admin/(operations|erp|page.tsx|operations/**|support-requests/**|online-enquiries/**|deliveries/**|delivery/**)`
- **Pages excluded**: accounting/finance/posting/reconciliation/payment mutation flows (stay MANUAL_REVIEW).
- **Risk level**: medium.
- **Allowed UI changes**: layout/table polish; retain existing state/filters/action wiring.
- **Forbidden changes**: service calls, mutation semantics, role access, route URLs.
- **Services/contracts to preserve**: `frontend/src/services/**` used by admin ops.
- **Prompt title**: “Phase 3 — Admin cockpit polish (read-first)”.
- **Fast tests**: `cd frontend && npm run check:routes`.
- **Phase 3 status (implemented)**:
  - **Transformed** (SAFE_AUTO/SAFE_LAYOUT_ONLY, UI-only wrappers/states; no behavior changes):
    - `/admin/operations`
    - `/admin/operations/command-center`
    - `/admin/operations/today-work`
    - `/admin/erp`
    - `/admin/global-search`
  - **Deferred** (unchanged in Phase 3 to keep scope strictly “admin cockpit/operations” and avoid touching other domains):
    - `/admin` (executive dashboard; large mixed-domain surface—kept unchanged for safety)
    - `/admin/notifications` (uses shared `NotificationCenterPanel`; transforming it would impact non-admin routes)
    - All other `Admin Cockpit / Operations` pages that are operationally tied to inventory/CRM/deliveries/EMIs/partners/purchases/tax/compliance (explicitly out of Phase 3 scope)

### Phase 4 — Products / catalog master

- **Goal**: modern product register/list/detail and import surfaces.
- **Route families included**: admin.
- **Page paths included**: `frontend/src/app/(dashboard)/admin/products/**`
- **Pages excluded**: pricing mutation or destructive master-data flows unless explicitly reviewed.
- **Risk level**: medium.
- **Allowed UI changes**: tables, filters, forms UI shell only (SAFE_LAYOUT_ONLY where forms exist).
- **Forbidden changes**: validation semantics, submit handlers, API params.
- **Services/contracts to preserve**: product services (`@/services/...`).
- **Prompt title**: “Phase 4 — Products catalog UI pass”.
- **Fast tests**: `cd frontend && npm run check:routes`.
- **Phase 4 status (implemented)**:
  - **Transformed** (SAFE_AUTO/SAFE_LAYOUT_ONLY; UI-only wrappers/states; no behavior changes):
    - `/admin/products` (SAFE_LAYOUT_ONLY)
    - `/admin/products/create` (SAFE_AUTO)
    - `/admin/products/import` (SAFE_AUTO)
    - `/admin/products/masters` (SAFE_AUTO)
    - `/admin/products/[id]` (SAFE_AUTO)
    - `/admin/products/[id]/edit` (SAFE_AUTO)
    - `/admin/vendors/products` (SAFE_AUTO)
    - `/vendor/products` (SAFE_LAYOUT_ONLY)
  - **Deferred**:
    - `/admin/products/workspace` (SAFE_AUTO) — already uses the shared admin workspace shell; left unchanged in Phase 4 to keep this pass strictly catalog/register/detail/forms.

### Phase 5 — Inventory / stock control

- **Goal**: inventory ledgers, stock views, movements/adjustments UI polish with strict mutation safety.
- **Route families included**: admin.
- **Page paths included**: `frontend/src/app/(dashboard)/admin/inventory/**`
- **Pages excluded**: any posting/reconciliation/accounting flows.
- **Risk level**: high.
- **Allowed UI changes**: SAFE_AUTO/SAFE_LAYOUT_ONLY only; mutation pages require explicit manual prompt.
- **Forbidden changes**: stock mutation logic, request payloads, action availability rules.
- **Services/contracts to preserve**: inventory services.
- **Prompt title**: “Phase 5 — Inventory UI polish (no behavior changes)”.
- **Fast tests**: `cd frontend && npm run check:routes`.

- **Phase 5 status (implemented 2026-05-20)**:
  - **Transformed**:
    - `/admin/inventory` (SAFE_AUTO)
    - `/admin/inventory/workspace` (SAFE_AUTO)
    - `/admin/inventory/ledger` (SAFE_AUTO)
    - `/admin/inventory/movements` (SAFE_AUTO)
    - `/admin/inventory/stock-on-hand` (SAFE_AUTO)
    - `/admin/inventory/valuation` (SAFE_AUTO)
    - `/admin/inventory/items` (SAFE_AUTO)
    - `/admin/inventory/adjustments` (SAFE_AUTO)
    - `/admin/inventory/readiness` (SAFE_AUTO)
    - `/admin/inventory/stock-needs` (SAFE_AUTO)
    - `/admin/inventory/demand-planning` (SAFE_AUTO)
    - `/admin/inventory/purchase-needs` (SAFE_AUTO)
    - `/admin/inventory/profiles` (SAFE_AUTO)
    - `/admin/inventory/profiles/[id]` (SAFE_AUTO)
    - `/admin/inventory/locations` (SAFE_LAYOUT_ONLY)
    - `/admin/inventory/opening-stock` (SAFE_LAYOUT_ONLY)
    - `/admin/bi/inventory` (SAFE_AUTO; categorized inventory/stock control)
    - `/admin/vendors/categories` (SAFE_AUTO; categorized inventory/stock control)
    - `/admin/vendors/ledger` (SAFE_AUTO; categorized inventory/stock control)
    - `/vendor/ledger` (SAFE_AUTO; categorized inventory/stock control)
  - **Deferred**:
    - `/admin/reports/inventory` (SAFE_AUTO) — shared Phase5 report surface; defer shared report refactor to a dedicated reports pass to avoid cross-domain UI changes in an inventory-only phase.

### Phase 6 — Customer / CRM intelligence

- **Goal**: customer register, pipeline, enquiries, support list/detail polish.
- **Route families included**: admin.
- **Page paths included**: `frontend/src/app/(dashboard)/admin/(customers|crm|online-enquiries|support-requests)/**`
- **Pages excluded**: financial posting actions.
- **Risk level**: medium.
- **Allowed UI changes**: tables, filters, details layout.
- **Forbidden changes**: service params, mutation behavior, role access.
- **Services/contracts to preserve**: CRM/customer services.
- **Prompt title**: “Phase 6 — CRM surfaces polish”.
- **Fast tests**: `cd frontend && npm run check:routes`.
- **Phase 6 status (implemented 2026-05-20)**:
  - **Transformed**:
    - `/admin/bi/customers` (SAFE_AUTO)
    - `/admin/crm` (SAFE_AUTO)
    - `/admin/crm/follow-ups` (SAFE_AUTO)
    - `/admin/crm/pipeline` (SAFE_AUTO)
    - `/admin/customers/[id]/profile` (SAFE_AUTO)
    - `/admin/customers/[id]/edit` (SAFE_LAYOUT_ONLY)
    - `/admin/online-enquiries` (SAFE_AUTO)
    - `/admin/online-enquiries/[id]` (SAFE_AUTO)
  - **Deferred**:
    - `/admin/customers` (SAFE_LAYOUT_ONLY) — already on ERP primitives; kept unchanged to keep Phase 6 diffs focused.
    - `/admin/customers/[id]` (SAFE_LAYOUT_ONLY) — very large customer intelligence surface; defer to a dedicated customer detail workspace pass.
    - `/admin/customers/create` (SAFE_AUTO) — delegates to a domain-owned page component; defer to a domains-level UI pass.
    - `/admin/crm/leads` (SAFE_AUTO) — already framed; defer until lead inbox + CRM lead register alignment is planned together.
    - `/admin/crm/parties` (SAFE_AUTO) — already framed; defer to a dedicated Party Directory alignment pass.
    - `/admin/crm/parties/[id]` (SAFE_AUTO) — contains mutation actions; defer to a mutation-safe CRM pass.
    - `/admin/reports/crm` (SAFE_AUTO) — shared Phase5 report surface; defer shared report refactor to a dedicated reports pass.
    - `/partner/customers` (SAFE_LAYOUT_ONLY) and `/partner/customers/[id]` (SAFE_AUTO) — defer to a partner-only CRM intelligence pass to avoid role boundary risk in an admin-focused phase.

### Phase 7 — Subscriptions / contract desk

- **Goal**: subscription register/detail, requests, contract desk UI modernization.
- **Route families included**: admin, customer, partner (subscription views).
- **Page paths included**: `frontend/src/app/(dashboard)/*/subscriptions/**`, `.../subscription-requests/**`, `.../contracts/**`
- **Pages excluded**: cancellation/waiver/payment posting actions without manual review.
- **Risk level**: high.
- **Allowed UI changes**: SAFE_LAYOUT_ONLY unless explicitly SAFE_AUTO.
- **Forbidden changes**: EMI math, schedule logic, mutation semantics.
- **Services/contracts**: subscription services + schedules.
- **Prompt title**: “Phase 7 — Subscription desk UI (guardrails)”.
- **Fast tests**: `cd frontend && npm run check:routes`.

- **Phase 7 status (implemented 2026-05-20)**:
  - **Transformed**:
    - `/admin/subscriptions` (SAFE_LAYOUT_ONLY)
    - `/admin/subscriptions/[id]` (SAFE_AUTO)
    - `/admin/subscriptions/[id]/lifecycle` (SAFE_AUTO)
    - `/admin/subscription-requests` (SAFE_LAYOUT_ONLY)
    - `/admin/subscription-requests/[id]` (SAFE_AUTO)
    - `/admin/subscriptions/advance-emi/create` (SAFE_AUTO; via `SubscriptionCreatePage`)
    - `/admin/subscriptions/rent/create` (SAFE_AUTO; via `SubscriptionCreatePage`)
    - `/admin/subscriptions/lease/create` (SAFE_AUTO; via `SubscriptionCreatePage`)
    - `/admin/billing/contracts` (SAFE_AUTO)
    - `/customer/subscriptions` (SAFE_AUTO)
    - `/customer/subscriptions/[id]` (SAFE_AUTO)
    - `/customer/contracts` (SAFE_AUTO)
    - `/customer/subscription-requests` (SAFE_AUTO)
    - `/customer/subscription-requests/[id]` (SAFE_AUTO)
    - `/customer/subscription-requests/create` (SAFE_AUTO; via `CustomerSubscriptionRequestCreatePage`)
    - `/partner/subscriptions` (SAFE_LAYOUT_ONLY)
    - `/partner/subscriptions/[id]` (SAFE_AUTO)
    - `/partner/subscription-requests` (SAFE_AUTO)
    - `/partner/subscription-requests/[id]` (SAFE_AUTO)
    - `/partner/subscription-requests/create` (SAFE_LAYOUT_ONLY)
  - **Deferred**:
    - `/admin/reports/contracts` (SAFE_AUTO) — shared report surface; defer report framing changes to a dedicated reports pass.
    - `/admin/subscriptions/create` (SAFE_AUTO) — compatibility redirect route; no UI surface to transform.

### Phase 8 — Batches / Lucky IDs / lucky draw read-only/admin surfaces

- **Goal**: batch register + lucky id generation UI polish; keep draw execution manual-review.
- **Route families included**: admin.
- **Page paths included**: `frontend/src/app/(dashboard)/admin/batches/**`, `.../lucky-ids/**`, `.../lucky-draws/**` (read-only first).
- **Pages excluded**: draw create/reveal/execute and any commit-like actions (MANUAL_REVIEW).
- **Risk level**: high.
- **Allowed UI changes**: SAFE_AUTO + SAFE_LAYOUT_ONLY on read-only pages.
- **Forbidden changes**: draw execution semantics, batch lifecycle transitions, API payloads.
- **Services/contracts**: batches/lucky services.
- **Prompt title**: “Phase 8 — Batches & Lucky IDs (read-only first)”.
- **Fast tests**: `cd frontend && npm run check:routes`.
- **Phase 8 status (implemented 2026-05-20)**:
  - **Transformed**:
    - `/admin/batches` (SAFE_LAYOUT_ONLY)
    - `/admin/batches/create` (SAFE_AUTO)
    - `/admin/batches/[id]` (SAFE_AUTO)
    - `/admin/batches/[id]/edit` (SAFE_AUTO)
    - `/admin/batches/[id]/control-center` (SAFE_LAYOUT_ONLY; wrapper-only, handlers preserved)
    - `/admin/lucky-ids` (SAFE_LAYOUT_ONLY)
    - `/admin/lucky-ids/[id]` (SAFE_AUTO)
    - `/admin/lucky-ids/[id]/edit` (SAFE_AUTO)
    - `/admin/bi/batches` (SAFE_AUTO; categorized batches/lucky draw ops)
  - **Deferred**:
    - `/admin/lucky-draw` (MANUAL_REVIEW) — contains draw commit/execute semantics; defer to a dedicated manual-review lucky draw pass.
    - `/admin/lucky-draw/history` (MANUAL_REVIEW) — draw history interpretation should be reviewed together with draw lifecycle semantics.
    - `/admin/lucky-draws` (MANUAL_REVIEW) — draw lifecycle/mutation surface; defer.
    - `/admin/lucky-draws/create` (MANUAL_REVIEW) — draw creation is mutation-heavy; defer.
    - `/admin/lucky-draws/[id]` (MANUAL_REVIEW) — draw detail includes integrity-critical verification context; defer.
    - `/admin/lucky-draws/[id]/reveal` (MANUAL_REVIEW) — reveal/seed verification display and copy must remain manual-review.
    - `/admin/batches/[id]/generate-lucky-ids` (SAFE_AUTO) — redirect-only route (no UI surface); left unchanged.

### Phase 9 — Cashier POS / counter workspace

- **Goal**: cashier workspace polish; collection submit remains manual-review.
- **Route families included**: cashier.
- **Page paths included**: `frontend/src/app/(dashboard)/cashier/**`
- **Pages excluded**: collection submit mechanics changes (must stay SAFE_LAYOUT_ONLY or MANUAL_REVIEW).
- **Risk level**: critical.
- **Allowed UI changes**: layout-only; preserve tab order, button meaning, submit handlers, and validation.
- **Forbidden changes**: posting/collection behavior, redirects, auth/session, service calls.
- **Services/contracts**: cashier/payment services.
- **Prompt title**: “Phase 9 — Cashier UI polish (visual-only)”.
- **Fast tests**: `cd frontend && npm run check:routes`.

- **Phase 9 status (implemented 2026-05-21)**:
  - **Transformed**:
    - `/cashier` (SAFE_LAYOUT_ONLY)
    - `/cashier/notifications` (SAFE_AUTO)
    - `/cashier/billing/direct-sale` (SAFE_AUTO)
  - **Deferred**:
    - `/cashier/collect` (MANUAL_REVIEW) — collection submit/receipt generation/paying flows; do not auto-migrate.
    - `/cashier/payments` (MANUAL_REVIEW) — register surface contains payment interpretation/actions; keep manual-review.
    - `/cashier/payments/[id]` (MANUAL_REVIEW) — payment detail/audit context; keep manual-review.
    - `/cashier/billing` (SAFE_AUTO) — route delegates to `/cashier/collect` page component; defer until collect page is manually reviewed.

### Phase 10 — Payments / receipts / collections

- **Goal**: payment and receipt views modernization; posting/mutations manual-review.
- **Route families included**: admin, customer, partner, cashier (payments/receipts views).
- **Page paths included**: `frontend/src/app/(dashboard)/*/(payments|receipts|collections)/**`
- **Pages excluded**: payment posting, reversal, cancellation flows unless explicitly manual-reviewed.
- **Risk level**: critical.
- **Allowed UI changes**: SAFE_AUTO views; SAFE_LAYOUT_ONLY for forms with no logic change.
- **Forbidden changes**: payment posting/reversal semantics, receipt generation assumptions.
- **Services/contracts**: payment/receipt services.
- **Prompt title**: “Phase 10 — Payments & receipts UI (strict)”.
- **Fast tests**: `cd frontend && npm run check:routes`.

- **Phase 10 status (implemented 2026-05-21)**:
  - **Transformed** (SAFE_AUTO only):
    - `/admin/collections`
    - `/admin/billing/receipts`
    - `/admin/purchases/receipts`
    - `/admin/receipts/sample`
    - `/admin/receipts/sample/invoice`
    - `/admin/receipts/sample/payment`
    - `/admin/receipts/sample/subscription`
    - `/admin/receipts/sample/acknowledgement`
    - `/customer/receipts`
    - `/partner/collection-requests`
    - `/partner/collections`
    - `/partner/collections/[id]`
  - **Deferred**:
    - `/admin/payments` (MANUAL_REVIEW) — payment register + actions; **completed in Phase 10B** (wrapper/layout/state-only).
    - `/admin/payments/[id]` (MANUAL_REVIEW) — payment detail/audit/actions; **completed in Phase 10B** (wrapper/layout/state-only).
    - `/admin/payments/create` (MANUAL_REVIEW) — posting/mutation; manual-review only.
    - `/admin/payments/history` (MANUAL_REVIEW) — compatibility redirect to `/admin/payments`; no UI surface to transform in Phase 10B.
    - `/admin/payments/reconciliation` (MANUAL_REVIEW) — reconciliation; manual-review only.
    - `/admin/finance/collect` (MANUAL_REVIEW) — collection/receipt workflow entry; manual-review only.
    - `/admin/partners/collection-requests` (MANUAL_REVIEW) — verification actions; manual-review only.
    - `/admin/receipts/sample/waiver` (MANUAL_REVIEW) — waiver semantics; manual-review only.
    - `/customer/payments` (MANUAL_REVIEW) and `/customer/payments/[id]` (MANUAL_REVIEW) — payment register/detail; manual-review only.
    - `/partner/payments` (MANUAL_REVIEW) and `/partner/payments/[id]` (MANUAL_REVIEW) — payment visibility/detail; manual-review only.
    - `/admin/reports/collections` (SAFE_AUTO) — delegates to shared report page; defer to a dedicated reports pass.
    - `/partner/collections/create` (SAFE_AUTO) — delegates to domain-owned mutation page; defer to avoid behavior drift.

- **Phase 10B status (implemented 2026-05-21)**:
  - **Transformed** (MANUAL_REVIEW; wrapper/layout/state-only changes only):
    - `/admin/payments`
    - `/admin/payments/[id]`
  - **Deferred** (explicit scope or redirect-only routes):
    - `/admin/payments/create` — redirect/compat route; no UI surface.
    - `/admin/payments/reconciliation` — redirect-only handoff; no UI surface.
    - `/customer/payments` and `/customer/payments/[id]` — deferred by Phase 10B scope.
    - `/partner/payments` and `/partner/payments/[id]` — deferred by Phase 10B scope.

- **Phase 10C status (implemented 2026-05-21)**:
  - **Transformed** (MANUAL_REVIEW; wrapper/layout/state-only changes only):
    - `/cashier/payments`
    - `/cashier/payments/[id]`
  - **Deferred** (manual-review only; out-of-scope for Phase 10C):
    - `/cashier/collect` — collection submit/receipt-generation workflow; behavior-critical mutation surface.
    - `/cashier/billing` — delegates into cashier collect/billing workflows; keep unchanged to avoid mutation-flow drift.
    - `/cashier/billing/direct-sale` — already transformed in Phase 9; intentionally not revisited.

- **Phase 10D status (implemented 2026-05-21)**:
  - **Transformed** (MANUAL_REVIEW; wrapper/layout/state-only changes only):
    - `/customer/payments`
    - `/customer/payments/[id]`
    - `/partner/payments`
    - `/partner/payments/[id]`
  - **Deferred** (explicitly out-of-scope for Phase 10D to preserve behavior and privacy boundaries):
    - `/admin/payments/create` — posting/mutation; manual-review only.
    - `/admin/payments/reconciliation` and accounting/reconciliation routes — reconciliation semantics; manual-review only.
    - `/cashier/collect`, `/cashier/billing` — collection submit + receipt generation workflow entry; behavior-critical mutation surfaces.
    - `/partner/collections/create` — partner-side mutation route; keep unchanged to avoid submit behavior drift.

### Phase 11 — Direct sale / billing / receivables

- **Goal**: direct sale billing flows UI polish; cancellations/returns manual-review.
- **Route families included**: admin, customer.
- **Page paths included**: `frontend/src/app/(dashboard)/*/(billing|sales|direct-sale|invoices)/**`
- **Pages excluded**: cancellation/return/void pages unless manual-reviewed.
- **Risk level**: critical.
- **Allowed UI changes**: SAFE_LAYOUT_ONLY only unless explicitly SAFE_AUTO.
- **Forbidden changes**: invoice math, posting actions, cancellation semantics.
- **Services/contracts**: billing/sales services.
- **Prompt title**: “Phase 11 — Billing UI (manual-risk controls)”.
- **Fast tests**: `cd frontend && npm run check:routes`.

- **Phase 11 status (implemented 2026-05-21)**:
  - **Transformed** (SAFE_AUTO; wrapper/layout/state-only changes; no handler/visibility/API changes):
    - `/admin/billing`
    - `/admin/billing/invoices`
    - `/admin/billing/register`
    - `/admin/billing/documents/[id]`
    - `/admin/billing/credit-notes`
    - `/admin/billing/debit-notes`
    - `/admin/billing/reversals` (mutation-heavy; ERP wrapper/state components only)
    - `/admin/billing/direct-sale` (mutation-heavy; ERP wrapper only)
    - `/admin/deliveries/direct-sale-cases/[caseId]` (mutation-heavy; ERP wrapper/state components only)
    - `/customer/invoices`
    - `/customer/direct-sales`
    - `/customer/direct-sales/[id]`
  - **Deferred**:
    - `/admin/accounting/books/sales` (MANUAL_REVIEW) — accounting book semantics; dedicated Phase 12 prompt required.
    - `/admin/accounting/gst/credit-notes` (MANUAL_REVIEW) — GST accounting controls; dedicated Phase 12 prompt required.
    - `/admin/accounting/gst/debit-notes` (MANUAL_REVIEW) — GST accounting controls; dedicated Phase 12 prompt required.
    - `/admin/billing/cashbook` (SAFE_AUTO) — already uses `BookRegisterPage`; no Phase 11 change needed.
    - `/admin/billing/dailybook` (SAFE_AUTO) — already uses `BookRegisterPage`; no Phase 11 change needed.
    - `/admin/billing/direct-sale/create` (SAFE_AUTO) — redirect-only route; no Phase 11 change needed.
    - `/admin/billing/direct-sales` (SAFE_AUTO) — route alias delegating to direct-sale workspace; no Phase 11 change needed.
    - `/admin/sales` (SAFE_AUTO) — sales workspace already uses `WorkspaceShell`; defer to a dedicated workspace alignment pass.
    - `/admin/sales/direct-sale/create` (SAFE_AUTO) — orchestrated create workflow entry; treat as manual-risk; defer to a direct-sale mutation-only prompt if needed.
    - `/admin/reports/direct-sales` (SAFE_AUTO) — report surface uses `Phase5ReportSurface`; defer shared report styling to a reports-only pass.

### Phase 12 — Accounting / finance control room

- **Goal**: accounting + reconciliation surfaces; always manual-review for postings.
- **Route families included**: admin.
- **Page paths included**: `frontend/src/app/(dashboard)/admin/(accounting|finance|reconciliation|audit)/**`
- **Pages excluded**: none, but most pages remain MANUAL_REVIEW by policy.
- **Risk level**: critical.
- **Allowed UI changes**: layout-only with explicit per-page prompts; preserve all semantics.
- **Forbidden changes**: posting logic, reconciliation logic, ledger/audit semantics, API contracts.
- **Services/contracts**: accounting/finance services.
- **Prompt title**: “Phase 12 — Accounting UI (manual-review only)”.
- **Fast tests**: `cd frontend && npm run check:routes`.

- **Phase 12 status (2026-05-21)**:
  - **Transformed**: _none_ under the “SAFE_AUTO / SAFE_LAYOUT_ONLY only” Phase 12 safety policy — route-category JSON currently classifies **all** Accounting / Finance Control Room pages as `MANUAL_REVIEW`.
  - **Deferred** (all `MANUAL_REVIEW`; requires per-route manual-review prompts with handler/visibility verification):
    - `/admin/accounting/**` (incl. chart of accounts, journals, books, GST, setup, reports, staff-ledger)
    - `/admin/finance/**` (incl. reconciliation, reversal control, payout batches)
    - `/admin/reconciliation`
    - `/admin/audit/events`, `/admin/audit-logs`
    - `/admin/reports/finance`, `/admin/reports/reconciliation`
    - `/customer/finance`, `/partner/finance`

- **Phase 12A status (2026-05-21)** (manual-review, read-first, wrapper/layout/state-only):
  - **Transformed**:
    - `/admin/accounting`
    - `/admin/accounting/control-center`
    - `/admin/finance/workspace`
  - **Deferred**:
    - `/admin/accounting/chart-of-accounts` — master-data mutation surface; requires per-action verification.
    - `/admin/accounting/books` — money-movement create/post flows; mutation surface.
    - `/admin/finance` — mixed surface; defer until per-action verification/splitting is planned.
    - Reconciliation/reversal/payout pages — explicitly out-of-scope for Phase 12A.

### Phase 13 — Partner portal / commission / payout

- **Goal**: partner portal UI polish; payout execution manual-review.
- **Route families included**: partner (+ admin commission views).
- **Page paths included**: `frontend/src/app/(dashboard)/partner/**`, `frontend/src/app/(dashboard)/admin/finance/commissions/**`
- **Pages excluded**: payout execution flows unless manual-reviewed.
- **Risk level**: critical.
- **Allowed UI changes**: SAFE_LAYOUT_ONLY/SAFE_AUTO only; preserve duplicate routes.
- **Forbidden changes**: payout semantics, commission calculation visibility rules, route cleanup.
- **Services/contracts**: partner/commission/payout services.
- **Prompt title**: “Phase 13 — Partner portal polish (compat-safe)”.
- **Fast tests**: `cd frontend && npm run check:routes`.

### Phase 14 — Customer portal / self-service

- **Goal**: customer dashboard, documents, subscriptions, payments view polish.
- **Route families included**: customer.
- **Page paths included**: `frontend/src/app/(dashboard)/customer/**`
- **Pages excluded**: payment posting/mutation surfaces.
- **Risk level**: high.
- **Allowed UI changes**: SAFE_AUTO + SAFE_LAYOUT_ONLY with strict contract preservation.
- **Forbidden changes**: EMI/payment semantics, contract logic, auth/session/guards.
- **Services/contracts**: customer portal services.
- **Prompt title**: “Phase 14 — Customer portal polish”.
- **Fast tests**: `cd frontend && npm run check:routes`.

### Phase 15 — HR / branch / staff operations

- **Goal**: staff ops/admin HR surfaces UI modernization.
- **Route families included**: admin.
- **Page paths included**: `frontend/src/app/(dashboard)/admin/hr/**`
- **Pages excluded**: payroll/accounting posting actions.
- **Risk level**: medium.
- **Allowed UI changes**: layout/tables; forms as SAFE_LAYOUT_ONLY.
- **Forbidden changes**: policy enforcement, approval workflows.
- **Services/contracts**: HR services.
- **Prompt title**: “Phase 15 — HR UI pass”.
- **Fast tests**: `cd frontend && npm run check:routes`.

### Phase 16 — Service desk / reminders / support

- **Goal**: support workflows UI polish.
- **Route families included**: admin, customer, vendor (if support pages exist).
- **Page paths included**: `frontend/src/app/(dashboard)/*/(support|support-requests|service-desk|reminders)/**`
- **Pages excluded**: return/void/cancellation actions unless manual-reviewed.
- **Risk level**: medium–high.
- **Allowed UI changes**: SAFE_AUTO + SAFE_LAYOUT_ONLY.
- **Forbidden changes**: workflow transitions, mutation semantics.
- **Services/contracts**: support services.
- **Prompt title**: “Phase 16 — Service desk UI”.
- **Fast tests**: `cd frontend && npm run check:routes`.

### Phase 17 — Reports / analytics / BI

- **Goal**: reporting UI polish; no invented KPIs/charts.
- **Route families included**: admin, partner.
- **Page paths included**: `frontend/src/app/(dashboard)/*/reports/**`
- **Pages excluded**: financial posting/reconciliation actions.
- **Risk level**: medium.
- **Allowed UI changes**: visualization polish using only existing data.
- **Forbidden changes**: fake KPIs, invented endpoints.
- **Services/contracts**: reports services.
- **Prompt title**: “Phase 17 — Reports UI (data-preserving)”.
- **Fast tests**: `cd frontend && npm run check:routes`.

### Phase 18 — Vendor / manufacturing / marketplace (if present)

- **Goal**: vendor portal UI polish.
- **Route families included**: vendor (+ admin vendor masters if relevant).
- **Page paths included**: `frontend/src/app/(dashboard)/vendor/**`, `frontend/src/app/(dashboard)/admin/vendors/**`, `.../manufacturing/**`
- **Pages excluded**: any settlement/posting actions unless manual-reviewed.
- **Risk level**: medium–high.
- **Allowed UI changes**: SAFE_AUTO + SAFE_LAYOUT_ONLY.
- **Forbidden changes**: pricing/settlement semantics.
- **Services/contracts**: vendor services.
- **Prompt title**: “Phase 18 — Vendor portal UI”.
- **Fast tests**: `cd frontend && npm run check:routes`.

### Phase 19 — Compatibility/legacy route cleanup plan only

- **Goal**: plan route cleanups/aliases/deprecations; **do not delete routes**.
- **Route families included**: compatibility + known duplicates/typos.
- **Page paths included**: `frontend/src/app/settings/page.tsx`, `frontend/src/app/(dashboard)/partner/commisions/**` and other duplicates.
- **Pages excluded**: none (planning only).
- **Risk level**: critical.
- **Allowed UI changes**: none (planning only).
- **Forbidden changes**: deleting or renaming routes; changing redirects/guards.
- **Services/contracts**: all.
- **Prompt title**: “Phase 19 — Compatibility route plan (no deletions)”.
- **Fast tests**: `cd frontend && npm run check:routes`.

### Phase 20 — Final UI consistency pass

- **Goal**: apply consistent spacing/typography/density across all transformed pages.
- **Route families included**: all transformed families.
- **Page paths included**: all previously migrated pages.
- **Pages excluded**: DO_NOT_TOUCH surfaces (auth/compatibility) unless explicitly approved.
- **Risk level**: medium.
- **Allowed UI changes**: visual consistency only.
- **Forbidden changes**: semantics, service calls, auth/guard behavior, route URLs.
- **Services/contracts**: all.
- **Prompt title**: “Phase 20 — UI consistency sweep”.
- **Fast tests**: `cd frontend && npm run build`.

| Route URL | File path | Role/family | Business category | Current purpose | Main services/endpoints used if visible | Current UI pattern | Loading/error/empty state presence | Mutation/action risk | Migration classification | Recommended UI target | Recommended phase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| /forgot-password | frontend/src/app/(auth)/forgot-password/page.tsx | auth | Auth / Session / Access | forgot-password | @/services/auth.service | App Router page (varies; see file) | L:N / E:N / Ø:N | YES (critical) | DO_NOT_TOUCH | Preserve current (compatibility/auth) | 0 |
| /login | frontend/src/app/(auth)/login/page.tsx | auth | Auth / Session / Access | login | @/services/auth.service | App Router page (varies; see file) | L:N / E:N / Ø:N | YES (critical) | DO_NOT_TOUCH | Preserve current (compatibility/auth) | 0 |
| /logout | frontend/src/app/(auth)/logout/page.tsx | auth | Auth / Session / Access | logout | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | DO_NOT_TOUCH | Preserve current (compatibility/auth) | 0 |
| /register | frontend/src/app/(auth)/register/page.tsx | auth | Auth / Session / Access | register | - | App Router page (varies; see file) | L:N / E:N / Ø:N | YES (critical) | DO_NOT_TOUCH | Preserve current (compatibility/auth) | 0 |
| /reset-password | frontend/src/app/(auth)/reset-password/page.tsx | auth | Auth / Session / Access | reset-password | @/services/auth.service | App Router page (varies; see file) | L:N / E:N / Ø:N | YES (critical) | DO_NOT_TOUCH | Preserve current (compatibility/auth) | 0 |
| /admin/accounting/assets | frontend/src/app/(dashboard)/admin/accounting/assets/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/assets | @/services/accounting | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/attendance | frontend/src/app/(dashboard)/admin/accounting/attendance/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/attendance | @/services/accounting | App Router page (varies; see file) | L:Y / E:N / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/books/bank | frontend/src/app/(dashboard)/admin/accounting/books/bank/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/books/bank | @/services/accounting | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/books/cash | frontend/src/app/(dashboard)/admin/accounting/books/cash/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/books/cash | @/services/accounting | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/books | frontend/src/app/(dashboard)/admin/accounting/books/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/books | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/books/purchase | frontend/src/app/(dashboard)/admin/accounting/books/purchase/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/books/purchase | @/services/accounting | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/books/sales | frontend/src/app/(dashboard)/admin/accounting/books/sales/page.tsx | admin | Direct Sale / Billing / Receivables | admin/accounting/books/sales | @/services/accounting | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/accounting/books/upi | frontend/src/app/(dashboard)/admin/accounting/books/upi/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/books/upi | @/services/accounting | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/bridges | frontend/src/app/(dashboard)/admin/accounting/bridges/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/bridges | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:N | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/chart-of-accounts | frontend/src/app/(dashboard)/admin/accounting/chart-of-accounts/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/chart-of-accounts | @/services/accounting; @/services/accounting-setup | App Router page (varies; see file) | L:Y / E:Y / Ø:N | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/control-center | frontend/src/app/(dashboard)/admin/accounting/control-center/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/control-center | @/services/phase5-control | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/depreciation | frontend/src/app/(dashboard)/admin/accounting/depreciation/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/depreciation | @/services/accounting | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/expense-claims | frontend/src/app/(dashboard)/admin/accounting/expense-claims/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/expense-claims | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/expenses | frontend/src/app/(dashboard)/admin/accounting/expenses/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/expenses | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/exports/itr-pack | frontend/src/app/(dashboard)/admin/accounting/exports/itr-pack/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/exports/itr-pack | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/exports | frontend/src/app/(dashboard)/admin/accounting/exports/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/exports | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/gst/credit-notes | frontend/src/app/(dashboard)/admin/accounting/gst/credit-notes/page.tsx | admin | Direct Sale / Billing / Receivables | admin/accounting/gst/credit-notes | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/accounting/gst/debit-notes | frontend/src/app/(dashboard)/admin/accounting/gst/debit-notes/page.tsx | admin | Direct Sale / Billing / Receivables | admin/accounting/gst/debit-notes | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/accounting/gst | frontend/src/app/(dashboard)/admin/accounting/gst/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/gst | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/gst/tax-invoices | frontend/src/app/(dashboard)/admin/accounting/gst/tax-invoices/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/gst/tax-invoices | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/journals | frontend/src/app/(dashboard)/admin/accounting/journals/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/journals | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/leave | frontend/src/app/(dashboard)/admin/accounting/leave/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/leave | @/services/accounting | App Router page (varies; see file) | L:Y / E:N / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting | frontend/src/app/(dashboard)/admin/accounting/page.tsx | admin | Accounting / Finance Control Room | admin/accounting | @/services/accounting; @/services/phase5-control | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/periods | frontend/src/app/(dashboard)/admin/accounting/periods/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/periods | @/services/accounting | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/purchase-bills | frontend/src/app/(dashboard)/admin/accounting/purchase-bills/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/purchase-bills | @/services/accounting; @/services/compliance; @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/reconciliation | frontend/src/app/(dashboard)/admin/accounting/reconciliation/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/reconciliation | @/services/api; @/services/phase5-control | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/reports/balance-sheet | frontend/src/app/(dashboard)/admin/accounting/reports/balance-sheet/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/reports/balance-sheet | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/reports/profit-loss | frontend/src/app/(dashboard)/admin/accounting/reports/profit-loss/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/reports/profit-loss | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/reports/trial-balance | frontend/src/app/(dashboard)/admin/accounting/reports/trial-balance/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/reports/trial-balance | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/salary/[id] | frontend/src/app/(dashboard)/admin/accounting/salary/[id]/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/salary/[id] | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/salary | frontend/src/app/(dashboard)/admin/accounting/salary/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/salary | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/setup | frontend/src/app/(dashboard)/admin/accounting/setup/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/setup | @/services/accounting; @/services/accounting-setup | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/staff | frontend/src/app/(dashboard)/admin/accounting/staff/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/staff | @/services/accounting | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/staff-ledger | frontend/src/app/(dashboard)/admin/accounting/staff-ledger/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/staff-ledger | @/services/accounting | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/vendor-settlements | frontend/src/app/(dashboard)/admin/accounting/vendor-settlements/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/vendor-settlements | @/services/accounting | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/accounting/vendors | frontend/src/app/(dashboard)/admin/accounting/vendors/page.tsx | admin | Accounting / Finance Control Room | admin/accounting/vendors | @/services/accounting | App Router page (varies; see file) | L:Y / E:N / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/ai | frontend/src/app/(dashboard)/admin/ai/page.tsx | admin | Admin Cockpit / Operations | admin/ai | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/ai/query-log | frontend/src/app/(dashboard)/admin/ai/query-log/page.tsx | admin | Admin Cockpit / Operations | admin/ai/query-log | @/services/admin-ai | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/ai/readiness | frontend/src/app/(dashboard)/admin/ai/readiness/page.tsx | admin | Admin Cockpit / Operations | admin/ai/readiness | @/services/admin-ai | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/ai/sources/[id] | frontend/src/app/(dashboard)/admin/ai/sources/[id]/page.tsx | admin | Admin Cockpit / Operations | admin/ai/sources/[id] | @/services/admin-ai | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/ai/sources | frontend/src/app/(dashboard)/admin/ai/sources/page.tsx | admin | Admin Cockpit / Operations | admin/ai/sources | @/services/admin-ai | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/analytics/churn-analysis | frontend/src/app/(dashboard)/admin/analytics/churn-analysis/page.tsx | admin | Reports / Analytics / BI | admin/analytics/churn-analysis | @/services/subscriptions | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/analytics | frontend/src/app/(dashboard)/admin/analytics/page.tsx | admin | Reports / Analytics / BI | admin/analytics | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/analytics/risk-monitor | frontend/src/app/(dashboard)/admin/analytics/risk-monitor/page.tsx | admin | Reports / Analytics / BI | admin/analytics/risk-monitor | @/services/emis | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/audit/events | frontend/src/app/(dashboard)/admin/audit/events/page.tsx | admin | Accounting / Finance Control Room | admin/audit/events | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/audit-logs | frontend/src/app/(dashboard)/admin/audit-logs/page.tsx | admin | Accounting / Finance Control Room | admin/audit-logs | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/batches/[id]/control-center | frontend/src/app/(dashboard)/admin/batches/[id]/control-center/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/batches/[id]/control-center | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/batches/[id]/edit | frontend/src/app/(dashboard)/admin/batches/[id]/edit/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/batches/[id]/edit | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/batches/[id]/generate-lucky-ids | frontend/src/app/(dashboard)/admin/batches/[id]/generate-lucky-ids/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/batches/[id]/generate-lucky-ids | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/batches/[id] | frontend/src/app/(dashboard)/admin/batches/[id]/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/batches/[id] | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/batches/create | frontend/src/app/(dashboard)/admin/batches/create/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/batches/create | - | App Router page (varies; see file) | L:N / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/batches | frontend/src/app/(dashboard)/admin/batches/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/batches | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/bi/batches | frontend/src/app/(dashboard)/admin/bi/batches/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/bi/batches | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/bi/cashflow | frontend/src/app/(dashboard)/admin/bi/cashflow/page.tsx | admin | Admin Cockpit / Operations | admin/bi/cashflow | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/bi/customers | frontend/src/app/(dashboard)/admin/bi/customers/page.tsx | admin | Customer / CRM Intelligence | admin/bi/customers | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/bi/hr | frontend/src/app/(dashboard)/admin/bi/hr/page.tsx | admin | HR / Branch / Staff Operations | admin/bi/hr | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/bi/inventory | frontend/src/app/(dashboard)/admin/bi/inventory/page.tsx | admin | Inventory / Stock Control | admin/bi/inventory | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/bi | frontend/src/app/(dashboard)/admin/bi/page.tsx | admin | Admin Cockpit / Operations | admin/bi | @/services/admin-bi | App Router page (varies; see file) | L:Y / E:N / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/bi/profitability | frontend/src/app/(dashboard)/admin/bi/profitability/page.tsx | admin | Admin Cockpit / Operations | admin/bi/profitability | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/billing/cashbook | frontend/src/app/(dashboard)/admin/billing/cashbook/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing/cashbook | @/services/billing | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/billing/contracts | frontend/src/app/(dashboard)/admin/billing/contracts/page.tsx | admin | Subscriptions / Contract Desk | admin/billing/contracts | @/services/billing | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /admin/billing/credit-notes | frontend/src/app/(dashboard)/admin/billing/credit-notes/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing/credit-notes | @/services/billing | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/billing/dailybook | frontend/src/app/(dashboard)/admin/billing/dailybook/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing/dailybook | @/services/billing | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/billing/debit-notes | frontend/src/app/(dashboard)/admin/billing/debit-notes/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing/debit-notes | @/services/billing | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/billing/direct-sale/create | frontend/src/app/(dashboard)/admin/billing/direct-sale/create/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing/direct-sale/create | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/billing/direct-sale | frontend/src/app/(dashboard)/admin/billing/direct-sale/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing/direct-sale | - | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/billing/direct-sales | frontend/src/app/(dashboard)/admin/billing/direct-sales/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing/direct-sales | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/billing/documents/[id] | frontend/src/app/(dashboard)/admin/billing/documents/[id]/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing/documents/[id] | @/services/billing | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/billing/invoices | frontend/src/app/(dashboard)/admin/billing/invoices/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing/invoices | @/services/billing | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/billing | frontend/src/app/(dashboard)/admin/billing/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing | @/services/billing | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/billing/receipts | frontend/src/app/(dashboard)/admin/billing/receipts/page.tsx | admin | Payments / Receipts / Collections | admin/billing/receipts | @/services/billing | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/billing/register | frontend/src/app/(dashboard)/admin/billing/register/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing/register | @/services/billing | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/billing/reversals | frontend/src/app/(dashboard)/admin/billing/reversals/page.tsx | admin | Direct Sale / Billing / Receivables | admin/billing/reversals | @/services/reversals | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/branch-reporting | frontend/src/app/(dashboard)/admin/branch-reporting/page.tsx | admin | HR / Branch / Staff Operations | admin/branch-reporting | @/services/branch-control | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/branches | frontend/src/app/(dashboard)/admin/branches/page.tsx | admin | HR / Branch / Staff Operations | admin/branches | @/services/branch-control | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/brand-data | frontend/src/app/(dashboard)/admin/brand-data/page.tsx | admin | Admin Cockpit / Operations | admin/brand-data | @/services/brand-data | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/collections | frontend/src/app/(dashboard)/admin/collections/page.tsx | admin | Payments / Receipts / Collections | admin/collections | @/services/api/errors; @/services/billing; @/services/payments; @/services/receivables | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/compliance/party-tax-profiles | frontend/src/app/(dashboard)/admin/compliance/party-tax-profiles/page.tsx | admin | Admin Cockpit / Operations | admin/compliance/party-tax-profiles | @/services/compliance | App Router page (varies; see file) | L:N / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/compliance/product-tax-profiles | frontend/src/app/(dashboard)/admin/compliance/product-tax-profiles/page.tsx | admin | Admin Cockpit / Operations | admin/compliance/product-tax-profiles | @/services/compliance | App Router page (varies; see file) | L:N / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/compliance/tax-profile | frontend/src/app/(dashboard)/admin/compliance/tax-profile/page.tsx | admin | Admin Cockpit / Operations | admin/compliance/tax-profile | @/services/compliance | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/compliance/tax-readiness | frontend/src/app/(dashboard)/admin/compliance/tax-readiness/page.tsx | admin | Admin Cockpit / Operations | admin/compliance/tax-readiness | @/services/compliance | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/counters | frontend/src/app/(dashboard)/admin/counters/page.tsx | admin | Admin Cockpit / Operations | admin/counters | @/services/accounting; @/services/branch-control; @/services/internal-users | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/crm/customers/[id] | frontend/src/app/(dashboard)/admin/crm/customers/[id]/page.tsx | admin | Customer / CRM Intelligence | admin/crm/customers/[id] | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/crm/follow-ups | frontend/src/app/(dashboard)/admin/crm/follow-ups/page.tsx | admin | Customer / CRM Intelligence | admin/crm/follow-ups | @/services/crm-module | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/crm/kyc | frontend/src/app/(dashboard)/admin/crm/kyc/page.tsx | admin | Customer / CRM Intelligence | admin/crm/kyc | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/crm/leads | frontend/src/app/(dashboard)/admin/crm/leads/page.tsx | admin | Customer / CRM Intelligence | admin/crm/leads | @/services/admin-leads | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/crm | frontend/src/app/(dashboard)/admin/crm/page.tsx | admin | Customer / CRM Intelligence | admin/crm | @/services/admin-erp; @/services/crm; @/services/customers | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/crm/parties/[id] | frontend/src/app/(dashboard)/admin/crm/parties/[id]/page.tsx | admin | Customer / CRM Intelligence | admin/crm/parties/[id] | @/services/crm | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/crm/parties | frontend/src/app/(dashboard)/admin/crm/parties/page.tsx | admin | Customer / CRM Intelligence | admin/crm/parties | @/services/crm | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/crm/pipeline | frontend/src/app/(dashboard)/admin/crm/pipeline/page.tsx | admin | Customer / CRM Intelligence | admin/crm/pipeline | @/services/crm-module | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/customers/[id]/edit | frontend/src/app/(dashboard)/admin/customers/[id]/edit/page.tsx | admin | Customer / CRM Intelligence | admin/customers/[id]/edit | - | App Router page (varies; see file) | L:Y / E:Y / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/customers/[id] | frontend/src/app/(dashboard)/admin/customers/[id]/page.tsx | admin | Customer / CRM Intelligence | admin/customers/[id] | @/services/receivables | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/customers/[id]/profile | frontend/src/app/(dashboard)/admin/customers/[id]/profile/page.tsx | admin | Customer / CRM Intelligence | admin/customers/[id]/profile | @/services/crm-module | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/customers/create | frontend/src/app/(dashboard)/admin/customers/create/page.tsx | admin | Customer / CRM Intelligence | admin/customers/create | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/customers | frontend/src/app/(dashboard)/admin/customers/page.tsx | admin | Customer / CRM Intelligence | admin/customers | - | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/deliveries/[id] | frontend/src/app/(dashboard)/admin/deliveries/[id]/page.tsx | admin | Admin Cockpit / Operations | admin/deliveries/[id] | @/services/deliveries | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/deliveries/direct-sale-cases/[caseId] | frontend/src/app/(dashboard)/admin/deliveries/direct-sale-cases/[caseId]/page.tsx | admin | Direct Sale / Billing / Receivables | admin/deliveries/direct-sale-cases/[caseId] | @/services/deliveries | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/deliveries | frontend/src/app/(dashboard)/admin/deliveries/page.tsx | admin | Admin Cockpit / Operations | admin/deliveries | @/services/deliveries | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/delivery/create | frontend/src/app/(dashboard)/admin/delivery/create/page.tsx | admin | Admin Cockpit / Operations | admin/delivery/create | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/delivery | frontend/src/app/(dashboard)/admin/delivery/page.tsx | admin | Admin Cockpit / Operations | admin/delivery | @/services/admin-erp | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/delivery/returns | frontend/src/app/(dashboard)/admin/delivery/returns/page.tsx | admin | Admin Cockpit / Operations | admin/delivery/returns | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/delivery/workspace | frontend/src/app/(dashboard)/admin/delivery/workspace/page.tsx | admin | Admin Cockpit / Operations | admin/delivery/workspace | @/services/admin-erp; @/services/deliveries | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/emi/overdue | frontend/src/app/(dashboard)/admin/emi/overdue/page.tsx | admin | Admin Cockpit / Operations | admin/emi/overdue | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/emis/overdue | frontend/src/app/(dashboard)/admin/emis/overdue/page.tsx | admin | Admin Cockpit / Operations | admin/emis/overdue | @/services/emis; @/services/reports | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/emis | frontend/src/app/(dashboard)/admin/emis/page.tsx | admin | Admin Cockpit / Operations | admin/emis | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/emis/pending | frontend/src/app/(dashboard)/admin/emis/pending/page.tsx | admin | Admin Cockpit / Operations | admin/emis/pending | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/erp | frontend/src/app/(dashboard)/admin/erp/page.tsx | admin | Admin Cockpit / Operations | admin/erp | @/services/admin-erp; @/services/billing; @/services/business-setup | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/finance/collect | frontend/src/app/(dashboard)/admin/finance/collect/page.tsx | admin | Payments / Receipts / Collections | admin/finance/collect | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/finance/commisions | frontend/src/app/(dashboard)/admin/finance/commisions/page.tsx | admin | Accounting / Finance Control Room | admin/finance/commisions | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/finance/commissions | frontend/src/app/(dashboard)/admin/finance/commissions/page.tsx | admin | Accounting / Finance Control Room | admin/finance/commissions | @/services/commissions | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/finance/commissions/settled | frontend/src/app/(dashboard)/admin/finance/commissions/settled/page.tsx | admin | Accounting / Finance Control Room | admin/finance/commissions/settled | @/services/payout-batches | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/finance/deposits | frontend/src/app/(dashboard)/admin/finance/deposits/page.tsx | admin | Accounting / Finance Control Room | admin/finance/deposits | @/services/phase4-finance | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/finance | frontend/src/app/(dashboard)/admin/finance/page.tsx | admin | Accounting / Finance Control Room | admin/finance | @/services/accounting; @/services/billing; @/services/dashboard-types; @/services/finance-operations; @/services/payments; @/services/reports | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/finance/payout-batches/[id] | frontend/src/app/(dashboard)/admin/finance/payout-batches/[id]/page.tsx | admin | Accounting / Finance Control Room | admin/finance/payout-batches/[id] | @/services/accounting | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/finance/payout-batches | frontend/src/app/(dashboard)/admin/finance/payout-batches/page.tsx | admin | Accounting / Finance Control Room | admin/finance/payout-batches | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/finance/reconciliation | frontend/src/app/(dashboard)/admin/finance/reconciliation/page.tsx | admin | Accounting / Finance Control Room | admin/finance/reconciliation | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/finance/reversal-control/[id] | frontend/src/app/(dashboard)/admin/finance/reversal-control/[id]/page.tsx | admin | Accounting / Finance Control Room | admin/finance/reversal-control/[id] | @/services/reversal-control | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/finance/reversal-control | frontend/src/app/(dashboard)/admin/finance/reversal-control/page.tsx | admin | Accounting / Finance Control Room | admin/finance/reversal-control | @/services/reversal-control | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/finance/reversal-reconciliation | frontend/src/app/(dashboard)/admin/finance/reversal-reconciliation/page.tsx | admin | Accounting / Finance Control Room | admin/finance/reversal-reconciliation | @/services/reversal-control | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/finance/workspace | frontend/src/app/(dashboard)/admin/finance/workspace/page.tsx | admin | Accounting / Finance Control Room | admin/finance/workspace | @/services/admin-erp | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/global-search | frontend/src/app/(dashboard)/admin/global-search/page.tsx | admin | Admin Cockpit / Operations | admin/global-search | @/services/admin-erp | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/hr/attendance | frontend/src/app/(dashboard)/admin/hr/attendance/page.tsx | admin | HR / Branch / Staff Operations | admin/hr/attendance | @/services/admin-hr | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/hr/expenses | frontend/src/app/(dashboard)/admin/hr/expenses/page.tsx | admin | HR / Branch / Staff Operations | admin/hr/expenses | @/services/admin-hr | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/hr/leave | frontend/src/app/(dashboard)/admin/hr/leave/page.tsx | admin | HR / Branch / Staff Operations | admin/hr/leave | @/services/admin-hr | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/hr | frontend/src/app/(dashboard)/admin/hr/page.tsx | admin | HR / Branch / Staff Operations | admin/hr | @/services/admin-hr | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/hr/payroll | frontend/src/app/(dashboard)/admin/hr/payroll/page.tsx | admin | HR / Branch / Staff Operations | admin/hr/payroll | @/services/admin-hr | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/hr/salary-payments | frontend/src/app/(dashboard)/admin/hr/salary-payments/page.tsx | admin | HR / Branch / Staff Operations | admin/hr/salary-payments | @/services/admin-hr | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/hr/staff/[id] | frontend/src/app/(dashboard)/admin/hr/staff/[id]/page.tsx | admin | HR / Branch / Staff Operations | admin/hr/staff/[id] | @/services/admin-hr; @/services/branch-control | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/hr/staff | frontend/src/app/(dashboard)/admin/hr/staff/page.tsx | admin | HR / Branch / Staff Operations | admin/hr/staff | @/services/admin-hr; @/services/branch-control | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/hr/staff-documents | frontend/src/app/(dashboard)/admin/hr/staff-documents/page.tsx | admin | HR / Branch / Staff Operations | admin/hr/staff-documents | @/services/admin-hr | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 15 |
| /admin/inventory/adjustments | frontend/src/app/(dashboard)/admin/inventory/adjustments/page.tsx | admin | Inventory / Stock Control | admin/inventory/adjustments | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/demand-planning | frontend/src/app/(dashboard)/admin/inventory/demand-planning/page.tsx | admin | Inventory / Stock Control | admin/inventory/demand-planning | @/services/inventory | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/items | frontend/src/app/(dashboard)/admin/inventory/items/page.tsx | admin | Inventory / Stock Control | admin/inventory/items | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/ledger | frontend/src/app/(dashboard)/admin/inventory/ledger/page.tsx | admin | Inventory / Stock Control | admin/inventory/ledger | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/locations | frontend/src/app/(dashboard)/admin/inventory/locations/page.tsx | admin | Inventory / Stock Control | admin/inventory/locations | @/services/branch-control; @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/movements | frontend/src/app/(dashboard)/admin/inventory/movements/page.tsx | admin | Inventory / Stock Control | admin/inventory/movements | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/opening-stock | frontend/src/app/(dashboard)/admin/inventory/opening-stock/page.tsx | admin | Inventory / Stock Control | admin/inventory/opening-stock | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory | frontend/src/app/(dashboard)/admin/inventory/page.tsx | admin | Inventory / Stock Control | admin/inventory | @/services/inventory | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/profiles/[id] | frontend/src/app/(dashboard)/admin/inventory/profiles/[id]/page.tsx | admin | Inventory / Stock Control | admin/inventory/profiles/[id] | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/profiles | frontend/src/app/(dashboard)/admin/inventory/profiles/page.tsx | admin | Inventory / Stock Control | admin/inventory/profiles | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/purchase-needs | frontend/src/app/(dashboard)/admin/inventory/purchase-needs/page.tsx | admin | Inventory / Stock Control | admin/inventory/purchase-needs | @/services/direct-sale-workspace | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/readiness | frontend/src/app/(dashboard)/admin/inventory/readiness/page.tsx | admin | Inventory / Stock Control | admin/inventory/readiness | @/services/inventory-ops | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/stock-needs | frontend/src/app/(dashboard)/admin/inventory/stock-needs/page.tsx | admin | Inventory / Stock Control | admin/inventory/stock-needs | @/services/inventory-ops | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/stock-on-hand | frontend/src/app/(dashboard)/admin/inventory/stock-on-hand/page.tsx | admin | Inventory / Stock Control | admin/inventory/stock-on-hand | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/valuation | frontend/src/app/(dashboard)/admin/inventory/valuation/page.tsx | admin | Inventory / Stock Control | admin/inventory/valuation | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/inventory/workspace | frontend/src/app/(dashboard)/admin/inventory/workspace/page.tsx | admin | Inventory / Stock Control | admin/inventory/workspace | @/services/admin-erp | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/leads/[id] | frontend/src/app/(dashboard)/admin/leads/[id]/page.tsx | admin | Admin Cockpit / Operations | admin/leads/[id] | @/services/admin-leads; @/services/internal-users | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/leads | frontend/src/app/(dashboard)/admin/leads/page.tsx | admin | Admin Cockpit / Operations | admin/leads | @/services/admin-leads; @/services/internal-users | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/lucky-draw/history | frontend/src/app/(dashboard)/admin/lucky-draw/history/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/lucky-draw/history | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/lucky-draw | frontend/src/app/(dashboard)/admin/lucky-draw/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/lucky-draw | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/lucky-draws/[id] | frontend/src/app/(dashboard)/admin/lucky-draws/[id]/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/lucky-draws/[id] | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/lucky-draws/[id]/reveal | frontend/src/app/(dashboard)/admin/lucky-draws/[id]/reveal/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/lucky-draws/[id]/reveal | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/lucky-draws/create | frontend/src/app/(dashboard)/admin/lucky-draws/create/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/lucky-draws/create | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/lucky-draws | frontend/src/app/(dashboard)/admin/lucky-draws/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/lucky-draws | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/lucky-ids/[id]/edit | frontend/src/app/(dashboard)/admin/lucky-ids/[id]/edit/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/lucky-ids/[id]/edit | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/lucky-ids/[id] | frontend/src/app/(dashboard)/admin/lucky-ids/[id]/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/lucky-ids/[id] | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/lucky-ids | frontend/src/app/(dashboard)/admin/lucky-ids/page.tsx | admin | Batches / Lucky IDs / Lucky Draw | admin/lucky-ids | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 8 |
| /admin/manufacturing/boms | frontend/src/app/(dashboard)/admin/manufacturing/boms/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/manufacturing/boms | @/services/manufacturing | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/manufacturing/jobs/[id] | frontend/src/app/(dashboard)/admin/manufacturing/jobs/[id]/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/manufacturing/jobs/[id] | @/services/manufacturing | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/manufacturing/jobs | frontend/src/app/(dashboard)/admin/manufacturing/jobs/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/manufacturing/jobs | @/services/manufacturing | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/manufacturing | frontend/src/app/(dashboard)/admin/manufacturing/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/manufacturing | @/services/manufacturing | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/notifications | frontend/src/app/(dashboard)/admin/notifications/page.tsx | admin | Admin Cockpit / Operations | admin/notifications | @/services/notifications | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/online-enquiries/[id] | frontend/src/app/(dashboard)/admin/online-enquiries/[id]/page.tsx | admin | Customer / CRM Intelligence | admin/online-enquiries/[id] | @/services/online-enquiries | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/online-enquiries | frontend/src/app/(dashboard)/admin/online-enquiries/page.tsx | admin | Customer / CRM Intelligence | admin/online-enquiries | @/services/online-enquiries | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/operations/command-center | frontend/src/app/(dashboard)/admin/operations/command-center/page.tsx | admin | Admin Cockpit / Operations | admin/operations/command-center | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/operations | frontend/src/app/(dashboard)/admin/operations/page.tsx | admin | Admin Cockpit / Operations | admin/operations | @/services/admin-hr; @/services/phase5-control | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/operations/today-work | frontend/src/app/(dashboard)/admin/operations/today-work/page.tsx | admin | Admin Cockpit / Operations | admin/operations/today-work | @/services/admin-erp | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/outstandings | frontend/src/app/(dashboard)/admin/outstandings/page.tsx | admin | Admin Cockpit / Operations | admin/outstandings | @/services/outstandings | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin | frontend/src/app/(dashboard)/admin/page.tsx | admin | Admin Cockpit / Operations | admin | @/services/admin; @/services/admin-hr; @/services/branch-control; @/services/dashboard-types; @/services/dashboards; @/services/deliveries; … | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/partner/commisions | frontend/src/app/(dashboard)/admin/partner/commisions/page.tsx | admin | Partner Portal / Commission / Payout | admin/partner/commisions | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 13 |
| /admin/partner/commissions | frontend/src/app/(dashboard)/admin/partner/commissions/page.tsx | admin | Partner Portal / Commission / Payout | admin/partner/commissions | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 13 |
| /admin/partner-payment-requests | frontend/src/app/(dashboard)/admin/partner-payment-requests/page.tsx | admin | Admin Cockpit / Operations | admin/partner-payment-requests | @/services/phase5-control | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/partners/[id] | frontend/src/app/(dashboard)/admin/partners/[id]/page.tsx | admin | Admin Cockpit / Operations | admin/partners/[id] | - | App Router page (varies; see file) | L:Y / E:Y / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/partners/collection-requests | frontend/src/app/(dashboard)/admin/partners/collection-requests/page.tsx | admin | Payments / Receipts / Collections | admin/partners/collection-requests | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/partners/commisions | frontend/src/app/(dashboard)/admin/partners/commisions/page.tsx | admin | Partner Portal / Commission / Payout | admin/partners/commisions | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 13 |
| /admin/partners/commissions | frontend/src/app/(dashboard)/admin/partners/commissions/page.tsx | admin | Partner Portal / Commission / Payout | admin/partners/commissions | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 13 |
| /admin/partners | frontend/src/app/(dashboard)/admin/partners/page.tsx | admin | Admin Cockpit / Operations | admin/partners | endpoint:/admin/partners/ | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/partners/workspace | frontend/src/app/(dashboard)/admin/partners/workspace/page.tsx | admin | Admin Cockpit / Operations | admin/partners/workspace | @/services/admin-erp | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/payments/[id] | frontend/src/app/(dashboard)/admin/payments/[id]/page.tsx | admin | Payments / Receipts / Collections | admin/payments/[id] | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/payments/create | frontend/src/app/(dashboard)/admin/payments/create/page.tsx | admin | Payments / Receipts / Collections | admin/payments/create | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/payments/history | frontend/src/app/(dashboard)/admin/payments/history/page.tsx | admin | Payments / Receipts / Collections | admin/payments/history | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/payments | frontend/src/app/(dashboard)/admin/payments/page.tsx | admin | Payments / Receipts / Collections | admin/payments | @/services/payments | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/payments/reconciliation | frontend/src/app/(dashboard)/admin/payments/reconciliation/page.tsx | admin | Payments / Receipts / Collections | admin/payments/reconciliation | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/products/[id]/edit | frontend/src/app/(dashboard)/admin/products/[id]/edit/page.tsx | admin | Products / Catalog Master | admin/products/[id]/edit | @/services/inventory; @/services/products | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 4 |
| /admin/products/[id] | frontend/src/app/(dashboard)/admin/products/[id]/page.tsx | admin | Products / Catalog Master | admin/products/[id] | @/services/products | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 4 |
| /admin/products/create | frontend/src/app/(dashboard)/admin/products/create/page.tsx | admin | Products / Catalog Master | admin/products/create | @/services/products | App Router page (varies; see file) | L:N / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 4 |
| /admin/products/import | frontend/src/app/(dashboard)/admin/products/import/page.tsx | admin | Products / Catalog Master | admin/products/import | @/services/api/errors; @/services/import-hub | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 4 |
| /admin/products/masters | frontend/src/app/(dashboard)/admin/products/masters/page.tsx | admin | Products / Catalog Master | admin/products/masters | @/services/products | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 4 |
| /admin/products | frontend/src/app/(dashboard)/admin/products/page.tsx | admin | Products / Catalog Master | admin/products | - | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 4 |
| /admin/products/workspace | frontend/src/app/(dashboard)/admin/products/workspace/page.tsx | admin | Products / Catalog Master | admin/products/workspace | @/services/admin-erp | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 4 |
| /admin/purchases/bills | frontend/src/app/(dashboard)/admin/purchases/bills/page.tsx | admin | Admin Cockpit / Operations | admin/purchases/bills | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/purchases/orders | frontend/src/app/(dashboard)/admin/purchases/orders/page.tsx | admin | Admin Cockpit / Operations | admin/purchases/orders | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/purchases | frontend/src/app/(dashboard)/admin/purchases/page.tsx | admin | Admin Cockpit / Operations | admin/purchases | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/purchases/receipts | frontend/src/app/(dashboard)/admin/purchases/receipts/page.tsx | admin | Payments / Receipts / Collections | admin/purchases/receipts | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/purchases/requests | frontend/src/app/(dashboard)/admin/purchases/requests/page.tsx | admin | Admin Cockpit / Operations | admin/purchases/requests | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/purchases/vendor-agreements | frontend/src/app/(dashboard)/admin/purchases/vendor-agreements/page.tsx | admin | Admin Cockpit / Operations | admin/purchases/vendor-agreements | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/purchases/vendor-payables | frontend/src/app/(dashboard)/admin/purchases/vendor-payables/page.tsx | admin | Admin Cockpit / Operations | admin/purchases/vendor-payables | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/purchases/vendor-payments | frontend/src/app/(dashboard)/admin/purchases/vendor-payments/page.tsx | admin | Admin Cockpit / Operations | admin/purchases/vendor-payments | @/services/inventory | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/purchases/vendor-returns | frontend/src/app/(dashboard)/admin/purchases/vendor-returns/page.tsx | admin | Admin Cockpit / Operations | admin/purchases/vendor-returns | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/receipts/sample/acknowledgement | frontend/src/app/(dashboard)/admin/receipts/sample/acknowledgement/page.tsx | admin | Payments / Receipts / Collections | admin/receipts/sample/acknowledgement | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/receipts/sample/invoice | frontend/src/app/(dashboard)/admin/receipts/sample/invoice/page.tsx | admin | Payments / Receipts / Collections | admin/receipts/sample/invoice | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/receipts/sample | frontend/src/app/(dashboard)/admin/receipts/sample/page.tsx | admin | Payments / Receipts / Collections | admin/receipts/sample | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/receipts/sample/payment | frontend/src/app/(dashboard)/admin/receipts/sample/payment/page.tsx | admin | Payments / Receipts / Collections | admin/receipts/sample/payment | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/receipts/sample/subscription | frontend/src/app/(dashboard)/admin/receipts/sample/subscription/page.tsx | admin | Payments / Receipts / Collections | admin/receipts/sample/subscription | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/receipts/sample/waiver | frontend/src/app/(dashboard)/admin/receipts/sample/waiver/page.tsx | admin | Payments / Receipts / Collections | admin/receipts/sample/waiver | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/reconciliation | frontend/src/app/(dashboard)/admin/reconciliation/page.tsx | admin | Accounting / Finance Control Room | admin/reconciliation | @/services/reconciliation; @/services/reports | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/reminders | frontend/src/app/(dashboard)/admin/reminders/page.tsx | admin | Service Desk / Reminders / Support | admin/reminders | @/services/reminders | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 16 |
| /admin/reminders/payment-reminders | frontend/src/app/(dashboard)/admin/reminders/payment-reminders/page.tsx | admin | Service Desk / Reminders / Support | admin/reminders/payment-reminders | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 16 |
| /admin/reports/advance-emi | frontend/src/app/(dashboard)/admin/reports/advance-emi/page.tsx | admin | Reports / Analytics / BI | admin/reports/advance-emi | @/services/phase5-control | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/reports/batch-performance | frontend/src/app/(dashboard)/admin/reports/batch-performance/page.tsx | admin | Reports / Analytics / BI | admin/reports/batch-performance | @/services/reports | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/reports/collections | frontend/src/app/(dashboard)/admin/reports/collections/page.tsx | admin | Payments / Receipts / Collections | admin/reports/collections | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /admin/reports/contracts | frontend/src/app/(dashboard)/admin/reports/contracts/page.tsx | admin | Subscriptions / Contract Desk | admin/reports/contracts | @/services/phase5-control | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /admin/reports/crm | frontend/src/app/(dashboard)/admin/reports/crm/page.tsx | admin | Customer / CRM Intelligence | admin/reports/crm | @/services/phase5-control | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /admin/reports/customer-analytics | frontend/src/app/(dashboard)/admin/reports/customer-analytics/page.tsx | admin | Reports / Analytics / BI | admin/reports/customer-analytics | - | App Router page (varies; see file) | L:N / E:N / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/reports/delivery | frontend/src/app/(dashboard)/admin/reports/delivery/page.tsx | admin | Reports / Analytics / BI | admin/reports/delivery | @/services/phase5-control | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/reports/direct-sales | frontend/src/app/(dashboard)/admin/reports/direct-sales/page.tsx | admin | Direct Sale / Billing / Receivables | admin/reports/direct-sales | @/services/phase5-control | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/reports/finance | frontend/src/app/(dashboard)/admin/reports/finance/page.tsx | admin | Accounting / Finance Control Room | admin/reports/finance | @/services/phase5-control | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/reports/inventory | frontend/src/app/(dashboard)/admin/reports/inventory/page.tsx | admin | Inventory / Stock Control | admin/reports/inventory | @/services/phase5-control | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/reports/overdue | frontend/src/app/(dashboard)/admin/reports/overdue/page.tsx | admin | Reports / Analytics / BI | admin/reports/overdue | @/services/emis; @/services/reports | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/reports | frontend/src/app/(dashboard)/admin/reports/page.tsx | admin | Reports / Analytics / BI | admin/reports | @/services/dashboard-types; @/services/reports; @/services/reports-center | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/reports/partners | frontend/src/app/(dashboard)/admin/reports/partners/page.tsx | admin | Reports / Analytics / BI | admin/reports/partners | @/services/phase5-control | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/reports/reconciliation | frontend/src/app/(dashboard)/admin/reports/reconciliation/page.tsx | admin | Accounting / Finance Control Room | admin/reports/reconciliation | @/services/phase5-control | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /admin/reports/rent-lease | frontend/src/app/(dashboard)/admin/reports/rent-lease/page.tsx | admin | Reports / Analytics / BI | admin/reports/rent-lease | @/services/phase5-control | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/reports/revenue | frontend/src/app/(dashboard)/admin/reports/revenue/page.tsx | admin | Reports / Analytics / BI | admin/reports/revenue | @/services/payments; @/services/reports | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/reports/waiver-loss | frontend/src/app/(dashboard)/admin/reports/waiver-loss/page.tsx | admin | Reports / Analytics / BI | admin/reports/waiver-loss | @/services/phase5-control | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/reports-center/[reportKey] | frontend/src/app/(dashboard)/admin/reports-center/[reportKey]/page.tsx | admin | Reports / Analytics / BI | admin/reports-center/[reportKey] | @/services/reports-center | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/reports-center | frontend/src/app/(dashboard)/admin/reports-center/page.tsx | admin | Reports / Analytics / BI | admin/reports-center | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 17 |
| /admin/sales/direct-sale/create | frontend/src/app/(dashboard)/admin/sales/direct-sale/create/page.tsx | admin | Direct Sale / Billing / Receivables | admin/sales/direct-sale/create | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/sales | frontend/src/app/(dashboard)/admin/sales/page.tsx | admin | Direct Sale / Billing / Receivables | admin/sales | @/services/admin-erp | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /admin/service | frontend/src/app/(dashboard)/admin/service/page.tsx | admin | Service Desk / Reminders / Support | admin/service | @/services/admin-erp | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 16 |
| /admin/service-desk/[id] | frontend/src/app/(dashboard)/admin/service-desk/[id]/page.tsx | admin | Service Desk / Reminders / Support | admin/service-desk/[id] | @/services/support | App Router page (varies; see file) | L:Y / E:Y / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 16 |
| /admin/service-desk/cases/[id] | frontend/src/app/(dashboard)/admin/service-desk/cases/[id]/page.tsx | admin | Service Desk / Reminders / Support | admin/service-desk/cases/[id] | @/services/service-desk | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 16 |
| /admin/service-desk/complaints | frontend/src/app/(dashboard)/admin/service-desk/complaints/page.tsx | admin | Service Desk / Reminders / Support | admin/service-desk/complaints | @/services/service-desk | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 16 |
| /admin/service-desk | frontend/src/app/(dashboard)/admin/service-desk/page.tsx | admin | Service Desk / Reminders / Support | admin/service-desk | @/services/service-desk; @/services/support | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 16 |
| /admin/service-desk/returns | frontend/src/app/(dashboard)/admin/service-desk/returns/page.tsx | admin | Service Desk / Reminders / Support | admin/service-desk/returns | @/services/service-desk | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 16 |
| /admin/service-desk/tickets | frontend/src/app/(dashboard)/admin/service-desk/tickets/page.tsx | admin | Service Desk / Reminders / Support | admin/service-desk/tickets | @/services/service-desk | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 16 |
| /admin/settings/business | frontend/src/app/(dashboard)/admin/settings/business/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-compliance | frontend/src/app/(dashboard)/admin/settings/business-compliance/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-compliance | @/services/policies | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup/branches | frontend/src/app/(dashboard)/admin/settings/business-setup/branches/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup/branches | @/services/business-setup | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup/cash-desks | frontend/src/app/(dashboard)/admin/settings/business-setup/cash-desks/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup/cash-desks | @/services/business-setup | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup/chart-accounts | frontend/src/app/(dashboard)/admin/settings/business-setup/chart-accounts/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup/chart-accounts | @/services/accounting-setup | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup/checklist | frontend/src/app/(dashboard)/admin/settings/business-setup/checklist/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup/checklist | @/services/business-setup | App Router page (varies; see file) | L:Y / E:N / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup/document-numbering | frontend/src/app/(dashboard)/admin/settings/business-setup/document-numbering/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup/document-numbering | @/services/business-setup | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup/dry-runs | frontend/src/app/(dashboard)/admin/settings/business-setup/dry-runs/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup/dry-runs | @/services/business-setup/dry-runs | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup/finance-accounts | frontend/src/app/(dashboard)/admin/settings/business-setup/finance-accounts/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup/finance-accounts | @/services/accounting-setup; @/services/business-setup | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup | frontend/src/app/(dashboard)/admin/settings/business-setup/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup | @/services/accounting; @/services/business-setup; @/services/public-site | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup/profile | frontend/src/app/(dashboard)/admin/settings/business-setup/profile/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup/profile | @/services/business-setup | App Router page (varies; see file) | L:Y / E:Y / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup/public-site | frontend/src/app/(dashboard)/admin/settings/business-setup/public-site/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup/public-site | @/services/public-site | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup/reset | frontend/src/app/(dashboard)/admin/settings/business-setup/reset/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup/reset | @/services/business-setup | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/business-setup/staff | frontend/src/app/(dashboard)/admin/settings/business-setup/staff/page.tsx | admin | Admin Settings / Business Setup | admin/settings/business-setup/staff | @/services/business-setup | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/finance | frontend/src/app/(dashboard)/admin/settings/finance/page.tsx | admin | Admin Settings / Business Setup | admin/settings/finance | @/services/compliance | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/imports | frontend/src/app/(dashboard)/admin/settings/imports/page.tsx | admin | Admin Settings / Business Setup | admin/settings/imports | @/services/import-hub | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/local-sandbox | frontend/src/app/(dashboard)/admin/settings/local-sandbox/page.tsx | admin | Admin Settings / Business Setup | admin/settings/local-sandbox | @/services/local-sandbox | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/masters | frontend/src/app/(dashboard)/admin/settings/masters/page.tsx | admin | Admin Settings / Business Setup | admin/settings/masters | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings | frontend/src/app/(dashboard)/admin/settings/page.tsx | admin | Admin Settings / Business Setup | admin/settings | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/policies/[slug] | frontend/src/app/(dashboard)/admin/settings/policies/[slug]/page.tsx | admin | Admin Settings / Business Setup | admin/settings/policies/[slug] | @/services/policies | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/policies | frontend/src/app/(dashboard)/admin/settings/policies/page.tsx | admin | Admin Settings / Business Setup | admin/settings/policies | @/services/policies | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/roles | frontend/src/app/(dashboard)/admin/settings/roles/page.tsx | admin | Admin Settings / Business Setup | admin/settings/roles | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/roles-permissions | frontend/src/app/(dashboard)/admin/settings/roles-permissions/page.tsx | admin | Admin Settings / Business Setup | admin/settings/roles-permissions | @/services/role-capabilities | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/users/[id]/edit | frontend/src/app/(dashboard)/admin/settings/users/[id]/edit/page.tsx | admin | Admin Settings / Business Setup | admin/settings/users/[id]/edit | @/services/internal-users | App Router page (varies; see file) | L:Y / E:Y / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/users/[id] | frontend/src/app/(dashboard)/admin/settings/users/[id]/page.tsx | admin | Admin Settings / Business Setup | admin/settings/users/[id] | @/services/internal-users | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/users/create | frontend/src/app/(dashboard)/admin/settings/users/create/page.tsx | admin | Admin Settings / Business Setup | admin/settings/users/create | @/services/internal-users | App Router page (varies; see file) | L:N / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/settings/users | frontend/src/app/(dashboard)/admin/settings/users/page.tsx | admin | Admin Settings / Business Setup | admin/settings/users | @/services/internal-users | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /admin/subscription-requests/[id] | frontend/src/app/(dashboard)/admin/subscription-requests/[id]/page.tsx | admin | Subscriptions / Contract Desk | admin/subscription-requests/[id] | @/services/subscription-requests | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /admin/subscription-requests | frontend/src/app/(dashboard)/admin/subscription-requests/page.tsx | admin | Subscriptions / Contract Desk | admin/subscription-requests | @/services/subscription-requests | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /admin/subscriptions/[id]/lifecycle | frontend/src/app/(dashboard)/admin/subscriptions/[id]/lifecycle/page.tsx | admin | Subscriptions / Contract Desk | admin/subscriptions/[id]/lifecycle | @/services/contracts; @/services/subscriptions | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /admin/subscriptions/[id] | frontend/src/app/(dashboard)/admin/subscriptions/[id]/page.tsx | admin | Subscriptions / Contract Desk | admin/subscriptions/[id] | @/services/deliveries; @/services/payments | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /admin/subscriptions/advance-emi/create | frontend/src/app/(dashboard)/admin/subscriptions/advance-emi/create/page.tsx | admin | Subscriptions / Contract Desk | admin/subscriptions/advance-emi/create | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /admin/subscriptions/create | frontend/src/app/(dashboard)/admin/subscriptions/create/page.tsx | admin | Subscriptions / Contract Desk | admin/subscriptions/create | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /admin/subscriptions/lease/create | frontend/src/app/(dashboard)/admin/subscriptions/lease/create/page.tsx | admin | Subscriptions / Contract Desk | admin/subscriptions/lease/create | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /admin/subscriptions | frontend/src/app/(dashboard)/admin/subscriptions/page.tsx | admin | Subscriptions / Contract Desk | admin/subscriptions | - | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /admin/subscriptions/rent/create | frontend/src/app/(dashboard)/admin/subscriptions/rent/create/page.tsx | admin | Subscriptions / Contract Desk | admin/subscriptions/rent/create | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /admin/support-requests/[id] | frontend/src/app/(dashboard)/admin/support-requests/[id]/page.tsx | admin | Service Desk / Reminders / Support | admin/support-requests/[id] | @/services/admin-support-requests; @/services/internal-users | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 16 |
| /admin/support-requests | frontend/src/app/(dashboard)/admin/support-requests/page.tsx | admin | Service Desk / Reminders / Support | admin/support-requests | @/services/admin-support-requests | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 16 |
| /admin/vendors/[id] | frontend/src/app/(dashboard)/admin/vendors/[id]/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/vendors/[id] | @/services/vendor-account-links; @/services/vendor-ops | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/vendors/categories | frontend/src/app/(dashboard)/admin/vendors/categories/page.tsx | admin | Inventory / Stock Control | admin/vendors/categories | @/services/vendors | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/vendors/ledger | frontend/src/app/(dashboard)/admin/vendors/ledger/page.tsx | admin | Inventory / Stock Control | admin/vendors/ledger | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /admin/vendors/outstanding | frontend/src/app/(dashboard)/admin/vendors/outstanding/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/vendors/outstanding | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/vendors | frontend/src/app/(dashboard)/admin/vendors/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/vendors | @/services/vendors | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/vendors/products | frontend/src/app/(dashboard)/admin/vendors/products/page.tsx | admin | Products / Catalog Master | admin/vendors/products | @/services/vendor-ops; @/services/vendors | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 4 |
| /admin/vendors/purchase-returns | frontend/src/app/(dashboard)/admin/vendors/purchase-returns/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/vendors/purchase-returns | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/vendors/purchases | frontend/src/app/(dashboard)/admin/vendors/purchases/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/vendors/purchases | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/vendors/quotes/[id] | frontend/src/app/(dashboard)/admin/vendors/quotes/[id]/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/vendors/quotes/[id] | @/services/vendor-ops | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/vendors/quotes | frontend/src/app/(dashboard)/admin/vendors/quotes/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/vendors/quotes | @/services/vendor-ops; @/services/vendors | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/vendors/sourcing | frontend/src/app/(dashboard)/admin/vendors/sourcing/page.tsx | admin | Vendor / Manufacturing / Marketplace | admin/vendors/sourcing | @/services/vendor-ops | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /admin/workspace | frontend/src/app/(dashboard)/admin/workspace/page.tsx | admin | Admin Cockpit / Operations | admin/workspace | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 3 |
| /cashier/billing/direct-sale | frontend/src/app/(dashboard)/cashier/billing/direct-sale/page.tsx | cashier | Cashier POS / Counter Workspace | cashier/billing/direct-sale | @/services/direct-sale-workspace | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 9 |
| /cashier/billing | frontend/src/app/(dashboard)/cashier/billing/page.tsx | cashier | Cashier POS / Counter Workspace | cashier/billing | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 9 |
| /cashier/collect | frontend/src/app/(dashboard)/cashier/collect/page.tsx | cashier | Cashier POS / Counter Workspace | cashier/collect | @/services/cashier; @/services/receivables | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 9 |
| /cashier/notifications | frontend/src/app/(dashboard)/cashier/notifications/page.tsx | cashier | Cashier POS / Counter Workspace | cashier/notifications | @/services/notifications | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 9 |
| /cashier | frontend/src/app/(dashboard)/cashier/page.tsx | cashier | Cashier POS / Counter Workspace | cashier | @/services/cashier; @/services/dashboard-types; @/services/dashboards | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 9 |
| /cashier/payments/[id] | frontend/src/app/(dashboard)/cashier/payments/[id]/page.tsx | cashier | Cashier POS / Counter Workspace | cashier/payments/[id] | @/services/cashier | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 9 |
| /cashier/payments | frontend/src/app/(dashboard)/cashier/payments/page.tsx | cashier | Cashier POS / Counter Workspace | cashier/payments | @/services/cashier | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 9 |
| /customer/account-statement | frontend/src/app/(dashboard)/customer/account-statement/page.tsx | customer | Customer Portal / Self-Service | customer/account-statement | @/services/phase4-finance | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/contracts | frontend/src/app/(dashboard)/customer/contracts/page.tsx | customer | Subscriptions / Contract Desk | customer/contracts | @/services/customer; @/services/customer/paginated-subscriptions | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /customer/dashboard | frontend/src/app/(dashboard)/customer/dashboard/page.tsx | customer | Customer Portal / Self-Service | customer/dashboard | - | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/deliveries/[id] | frontend/src/app/(dashboard)/customer/deliveries/[id]/page.tsx | customer | Customer Portal / Self-Service | customer/deliveries/[id] | @/services/deliveries | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/deliveries | frontend/src/app/(dashboard)/customer/deliveries/page.tsx | customer | Customer Portal / Self-Service | customer/deliveries | @/services/deliveries | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/delivery | frontend/src/app/(dashboard)/customer/delivery/page.tsx | customer | Customer Portal / Self-Service | customer/delivery | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/direct-sales/[id] | frontend/src/app/(dashboard)/customer/direct-sales/[id]/page.tsx | customer | Direct Sale / Billing / Receivables | customer/direct-sales/[id] | @/services/customer | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /customer/direct-sales | frontend/src/app/(dashboard)/customer/direct-sales/page.tsx | customer | Direct Sale / Billing / Receivables | customer/direct-sales | @/services/customer | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /customer/documents | frontend/src/app/(dashboard)/customer/documents/page.tsx | customer | Customer Portal / Self-Service | customer/documents | @/services/phase4-finance | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/emis | frontend/src/app/(dashboard)/customer/emis/page.tsx | customer | Customer Portal / Self-Service | customer/emis | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/finance | frontend/src/app/(dashboard)/customer/finance/page.tsx | customer | Accounting / Finance Control Room | customer/finance | @/services/phase4-finance | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /customer/invoices | frontend/src/app/(dashboard)/customer/invoices/page.tsx | customer | Direct Sale / Billing / Receivables | customer/invoices | @/services/phase4-finance | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 11 |
| /customer/notifications | frontend/src/app/(dashboard)/customer/notifications/page.tsx | customer | Customer Portal / Self-Service | customer/notifications | @/services/notifications | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer | frontend/src/app/(dashboard)/customer/page.tsx | customer | Customer Portal / Self-Service | customer | @/services/customer; @/services/dashboard-types; @/services/dashboards; @/services/deliveries; @/services/notifications; @/services/support | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/payment-schedule | frontend/src/app/(dashboard)/customer/payment-schedule/page.tsx | customer | Customer Portal / Self-Service | customer/payment-schedule | @/services/phase4-finance | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/payments/[id] | frontend/src/app/(dashboard)/customer/payments/[id]/page.tsx | customer | Payments / Receipts / Collections | customer/payments/[id] | @/services/customer | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /customer/payments | frontend/src/app/(dashboard)/customer/payments/page.tsx | customer | Payments / Receipts / Collections | customer/payments | @/services/customer; @/services/phase4-finance | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /customer/profile | frontend/src/app/(dashboard)/customer/profile/page.tsx | customer | Customer Portal / Self-Service | customer/profile | @/services/customer; @/services/customer/index; @/services/customer/paginated-subscriptions | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/receipts | frontend/src/app/(dashboard)/customer/receipts/page.tsx | customer | Payments / Receipts / Collections | customer/receipts | @/services/phase4-finance | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /customer/subscription-requests/[id] | frontend/src/app/(dashboard)/customer/subscription-requests/[id]/page.tsx | customer | Subscriptions / Contract Desk | customer/subscription-requests/[id] | @/services/subscription-requests | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /customer/subscription-requests/create | frontend/src/app/(dashboard)/customer/subscription-requests/create/page.tsx | customer | Subscriptions / Contract Desk | customer/subscription-requests/create | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /customer/subscription-requests | frontend/src/app/(dashboard)/customer/subscription-requests/page.tsx | customer | Subscriptions / Contract Desk | customer/subscription-requests | @/services/subscription-requests | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /customer/subscriptions/[id] | frontend/src/app/(dashboard)/customer/subscriptions/[id]/page.tsx | customer | Subscriptions / Contract Desk | customer/subscriptions/[id] | @/services/customer | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /customer/subscriptions | frontend/src/app/(dashboard)/customer/subscriptions/page.tsx | customer | Subscriptions / Contract Desk | customer/subscriptions | @/services/customer; @/services/customer/paginated-subscriptions | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /customer/support/[id] | frontend/src/app/(dashboard)/customer/support/[id]/page.tsx | customer | Customer Portal / Self-Service | customer/support/[id] | @/services/support | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/support/new | frontend/src/app/(dashboard)/customer/support/new/page.tsx | customer | Customer Portal / Self-Service | customer/support/new | @/services/customer; @/services/support | App Router page (varies; see file) | L:Y / E:Y / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /customer/support | frontend/src/app/(dashboard)/customer/support/page.tsx | customer | Customer Portal / Self-Service | customer/support | @/services/support | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 14 |
| /partner/collection-requests | frontend/src/app/(dashboard)/partner/collection-requests/page.tsx | partner | Payments / Receipts / Collections | partner/collection-requests | @/services/partner | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /partner/collections/[id] | frontend/src/app/(dashboard)/partner/collections/[id]/page.tsx | partner | Payments / Receipts / Collections | partner/collections/[id] | @/services/partner | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /partner/collections/create | frontend/src/app/(dashboard)/partner/collections/create/page.tsx | partner | Payments / Receipts / Collections | partner/collections/create | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /partner/collections | frontend/src/app/(dashboard)/partner/collections/page.tsx | partner | Payments / Receipts / Collections | partner/collections | @/services/partner | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /partner/commisions | frontend/src/app/(dashboard)/partner/commisions/page.tsx | partner | Partner Portal / Commission / Payout | partner/commisions | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 13 |
| /partner/commissions | frontend/src/app/(dashboard)/partner/commissions/page.tsx | partner | Partner Portal / Commission / Payout | partner/commissions | - | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 13 |
| /partner/customers/[id] | frontend/src/app/(dashboard)/partner/customers/[id]/page.tsx | partner | Customer / CRM Intelligence | partner/customers/[id] | @/services/partner | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /partner/customers | frontend/src/app/(dashboard)/partner/customers/page.tsx | partner | Customer / CRM Intelligence | partner/customers | @/services/partner; @/services/partner/registers | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 6 |
| /partner/finance | frontend/src/app/(dashboard)/partner/finance/page.tsx | partner | Accounting / Finance Control Room | partner/finance | @/services/phase4-finance | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (high) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 12 |
| /partner/notifications | frontend/src/app/(dashboard)/partner/notifications/page.tsx | partner | Partner Portal / Commission / Payout | partner/notifications | @/services/notifications | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 13 |
| /partner | frontend/src/app/(dashboard)/partner/page.tsx | partner | Partner Portal / Commission / Payout | partner | @/services/dashboard-types; @/services/dashboards; @/services/notifications; @/services/partner | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 13 |
| /partner/payments/[id] | frontend/src/app/(dashboard)/partner/payments/[id]/page.tsx | partner | Payments / Receipts / Collections | partner/payments/[id] | @/services/partner | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /partner/payments | frontend/src/app/(dashboard)/partner/payments/page.tsx | partner | Payments / Receipts / Collections | partner/payments | @/services/partner | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 10 |
| /partner/payouts | frontend/src/app/(dashboard)/partner/payouts/page.tsx | partner | Partner Portal / Commission / Payout | partner/payouts | - | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (critical) | MANUAL_REVIEW | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 13 |
| /partner/reports | frontend/src/app/(dashboard)/partner/reports/page.tsx | partner | Partner Portal / Commission / Payout | partner/reports | @/services/partner | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 13 |
| /partner/subscription-requests/[id] | frontend/src/app/(dashboard)/partner/subscription-requests/[id]/page.tsx | partner | Subscriptions / Contract Desk | partner/subscription-requests/[id] | @/services/subscription-requests | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /partner/subscription-requests/create | frontend/src/app/(dashboard)/partner/subscription-requests/create/page.tsx | partner | Subscriptions / Contract Desk | partner/subscription-requests/create | @/services/subscription-requests | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /partner/subscription-requests | frontend/src/app/(dashboard)/partner/subscription-requests/page.tsx | partner | Subscriptions / Contract Desk | partner/subscription-requests | @/services/subscription-requests | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /partner/subscriptions/[id] | frontend/src/app/(dashboard)/partner/subscriptions/[id]/page.tsx | partner | Subscriptions / Contract Desk | partner/subscriptions/[id] | @/services/partner | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /partner/subscriptions | frontend/src/app/(dashboard)/partner/subscriptions/page.tsx | partner | Subscriptions / Contract Desk | partner/subscriptions | @/services/partner; @/services/partner/registers | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 7 |
| /vendor/documents | frontend/src/app/(dashboard)/vendor/documents/page.tsx | vendor | Vendor / Manufacturing / Marketplace | vendor/documents | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /vendor/ledger | frontend/src/app/(dashboard)/vendor/ledger/page.tsx | vendor | Inventory / Stock Control | vendor/ledger | @/services/vendor-ops | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 5 |
| /vendor/notifications | frontend/src/app/(dashboard)/vendor/notifications/page.tsx | vendor | Vendor / Manufacturing / Marketplace | vendor/notifications | @/services/notifications | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /vendor/orders | frontend/src/app/(dashboard)/vendor/orders/page.tsx | vendor | Vendor / Manufacturing / Marketplace | vendor/orders | @/services/vendor-ops | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /vendor/outstanding | frontend/src/app/(dashboard)/vendor/outstanding/page.tsx | vendor | Vendor / Manufacturing / Marketplace | vendor/outstanding | @/services/vendor-ops | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /vendor | frontend/src/app/(dashboard)/vendor/page.tsx | vendor | Vendor / Manufacturing / Marketplace | vendor | @/services/notifications; @/services/vendor-ops | App Router page (varies; see file) | L:Y / E:Y / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /vendor/products | frontend/src/app/(dashboard)/vendor/products/page.tsx | vendor | Products / Catalog Master | vendor/products | @/services/vendor-ops | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 4 |
| /vendor/profile | frontend/src/app/(dashboard)/vendor/profile/page.tsx | vendor | Vendor / Manufacturing / Marketplace | vendor/profile | @/services/vendor-ops | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /vendor/purchase-returns | frontend/src/app/(dashboard)/vendor/purchase-returns/page.tsx | vendor | Vendor / Manufacturing / Marketplace | vendor/purchase-returns | @/services/vendor-ops | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /vendor/quotes/[id] | frontend/src/app/(dashboard)/vendor/quotes/[id]/page.tsx | vendor | Vendor / Manufacturing / Marketplace | vendor/quotes/[id] | @/services/vendor-ops | App Router page (varies; see file) | L:Y / E:N / Ø:N | YES (medium) | SAFE_LAYOUT_ONLY | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /vendor/quotes | frontend/src/app/(dashboard)/vendor/quotes/page.tsx | vendor | Vendor / Manufacturing / Marketplace | vendor/quotes | @/services/vendor-ops | App Router page (varies; see file) | L:Y / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style dashboard shell + Studio Admin ERP polish (shadcn/ui) | 18 |
| /about | frontend/src/app/(public)/about/page.tsx | public | Public Website / Brand Site | about | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /apply | frontend/src/app/(public)/apply/page.tsx | public | Public Website / Brand Site | apply | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /blog/[slug] | frontend/src/app/(public)/blog/[slug]/page.tsx | public | Public Website / Brand Site | blog/[slug] | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /blog | frontend/src/app/(public)/blog/page.tsx | public | Public Website / Brand Site | blog | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /business-compliance | frontend/src/app/(public)/business-compliance/page.tsx | public | Public Website / Brand Site | business-compliance | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /contact | frontend/src/app/(public)/contact/page.tsx | public | Public Website / Brand Site | contact | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /data-requests | frontend/src/app/(public)/data-requests/page.tsx | public | Public Website / Brand Site | data-requests | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /delivery-policy | frontend/src/app/(public)/delivery-policy/page.tsx | public | Public Website / Brand Site | delivery-policy | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /direct-sale | frontend/src/app/(public)/direct-sale/page.tsx | public | Public Website / Brand Site | direct-sale | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /direct-sale-policy | frontend/src/app/(public)/direct-sale-policy/page.tsx | public | Public Website / Brand Site | direct-sale-policy | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /grievance | frontend/src/app/(public)/grievance/page.tsx | public | Public Website / Brand Site | grievance | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /how-it-works | frontend/src/app/(public)/how-it-works/page.tsx | public | Public Website / Brand Site | how-it-works | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /lease | frontend/src/app/(public)/lease/page.tsx | public | Public Website / Brand Site | lease | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /lucky-plan/fair-draw/[id] | frontend/src/app/(public)/lucky-plan/fair-draw/[id]/page.tsx | public | Public Website / Brand Site | lucky-plan/fair-draw/[id] | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /lucky-plan/fair-draw | frontend/src/app/(public)/lucky-plan/fair-draw/page.tsx | public | Public Website / Brand Site | lucky-plan/fair-draw | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /lucky-plan | frontend/src/app/(public)/lucky-plan/page.tsx | public | Public Website / Brand Site | lucky-plan | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /lucky-plan-policy | frontend/src/app/(public)/lucky-plan-policy/page.tsx | public | Public Website / Brand Site | lucky-plan-policy | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| / | frontend/src/app/(public)/page.tsx | public | Public Website / Brand Site | home | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /payment-policy | frontend/src/app/(public)/payment-policy/page.tsx | public | Public Website / Brand Site | payment-policy | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /policies/[slug] | frontend/src/app/(public)/policies/[slug]/page.tsx | public | Public Website / Brand Site | policies/[slug] | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /policies | frontend/src/app/(public)/policies/page.tsx | public | Public Website / Brand Site | policies | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /privacy | frontend/src/app/(public)/privacy/page.tsx | public | Public Website / Brand Site | privacy | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /products/[id] | frontend/src/app/(public)/products/[id]/page.tsx | public | Public Website / Brand Site | products/[id] | - | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /products | frontend/src/app/(public)/products/page.tsx | public | Public Website / Brand Site | products | - | App Router page (varies; see file) | L:Y / E:Y / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /refund-cancellation | frontend/src/app/(public)/refund-cancellation/page.tsx | public | Public Website / Brand Site | refund-cancellation | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /rent | frontend/src/app/(public)/rent/page.tsx | public | Public Website / Brand Site | rent | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /rental-lease-policy | frontend/src/app/(public)/rental-lease-policy/page.tsx | public | Public Website / Brand Site | rental-lease-policy | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /service-policy | frontend/src/app/(public)/service-policy/page.tsx | public | Public Website / Brand Site | service-policy | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /terms | frontend/src/app/(public)/terms/page.tsx | public | Public Website / Brand Site | terms | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /udyam-msme | frontend/src/app/(public)/udyam-msme/page.tsx | public | Public Website / Brand Site | udyam-msme | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /vision-trust | frontend/src/app/(public)/vision-trust/page.tsx | public | Public Website / Brand Site | vision-trust | - | App Router page (varies; see file) | L:N / E:N / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /warranty | frontend/src/app/(public)/warranty/page.tsx | public | Public Website / Brand Site | warranty | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /winner-history | frontend/src/app/(public)/winner-history/page.tsx | public | Public Website / Brand Site | winner-history | - | App Router page (varies; see file) | L:N / E:N / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /winners | frontend/src/app/(public)/winners/page.tsx | public | Public Website / Brand Site | winners | - | App Router page (varies; see file) | L:N / E:N / Ø:Y | NO (low) | SAFE_AUTO | Kiranism-style public marketing shell + shadcn/ui polish | 2 |
| /profile | frontend/src/app/profile/page.tsx | unknown | Unknown / Needs Manual Review | profile | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Preserve current (compatibility/auth) | 0 |
| /settings | frontend/src/app/settings/page.tsx | compatibility | Compatibility / Redirect / Legacy Routes | settings | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (critical) | DO_NOT_TOUCH | Preserve current (compatibility/auth) | 0 |
| /unauthorized | frontend/src/app/unauthorized/page.tsx | unknown | Unknown / Needs Manual Review | unauthorized | - | App Router page (varies; see file) | L:N / E:N / Ø:N | NO (low) | SAFE_AUTO | Preserve current (compatibility/auth) | 0 |
