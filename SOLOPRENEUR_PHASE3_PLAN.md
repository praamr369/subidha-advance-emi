# Solopreneur Master Upgrade — Phase 3 Implementation Plan
## Billing, Collections & Smart Collection Engine

> **For: Antigravity implementation session**
> **Prepared: 2026-07-20 · Repo: subidha-advance-emi (branch `update`)**
>
> Locked product decisions (do not re-litigate):
> 1. Waterfall order: **(0) apply existing Customer Advance (toggle, default ON) → (1) oldest unpaid EMIs → (2) oldest pending Direct Sale invoices → (3) remainder deposited to Customer Advance**
> 2. Partial EMI rule: **SKIP partial EMIs.** If remaining money cannot cover a full EMI, do NOT partially pay it — route the remainder to the next bucket. Clean reconciliation over aggressive allocation.
> 3. `dry_run=true` preview mode is mandatory; frontend preview must show backend-computed allocation, never frontend math.
> 4. `finance_account_id` is required on every real posting (where the money lands).
> 5. Idempotency key required on the posting call.

---

# PHASE 3.0 — Fix Phase 1/2 Gaps FIRST (prerequisites)

Audit of the existing solopreneur artifacts found these defects. Fix them before building Phase 3, because Phase 3 reuses the same patterns.

## GAP-1 (CRITICAL, runtime bug): `apiFetch` misuse breaks the Daily Close page

**File:** `frontend/src/services/accounting.ts` lines ~2557–2587 ("Solopreneur Endpoints" section)

`apiFetch<T>` (defined in `frontend/src/lib/api/index.ts:469`) **returns parsed JSON** (`Promise<T>`), not a `Response` object. The Phase 2 code treats it like raw `fetch`:

```ts
// CURRENT — BROKEN. res is already parsed JSON; res.ok is undefined → always throws.
export async function fetchSolopreneurLedgerHealth(): Promise<LedgerHealthResponse> {
  const res = await apiFetch("/api/v1/admin/accounting/ledger-health/");
  if (!res.ok) throw new Error("Failed to fetch ledger health");   // ALWAYS throws
  return res.json();
}
```

Consequence: `/admin/finance/daily-close` **always** shows "Could not load ledger health" and posting **always** alerts failure — even when the backend succeeded. Fix:

```ts
// CORRECT — match the style of every other function in accounting.ts
export async function fetchSolopreneurLedgerHealth(): Promise<LedgerHealthResponse> {
  return apiFetch<LedgerHealthResponse>("/admin/accounting/ledger-health/");
}

export async function postSolopreneurDailyClose(as_of?: string): Promise<SolopreneurCloseResponse> {
  return apiFetch<SolopreneurCloseResponse>("/admin/accounting/solopreneur-close/", {
    method: "POST",
    body: JSON.stringify({ as_of }),
  });
}
```

Note: drop the `/api/v1` prefix — `API_BASE_URL` already ends with `/api/v1` (dedup exists in `buildApiUrl` but the house style is unprefixed paths). Also replace `checks: any[]` with a typed `{ key: string; passed: boolean; count?: number }[]`.

## GAP-2: Daily Close page is unreachable + dead quick-action link

- `/admin/finance/daily-close` (`frontend/src/app/(dashboard)/admin/finance/daily-close/page.tsx`) is registered **nowhere**: not in `frontend/src/lib/routes.ts`, not in the admin route registry, not in any nav.
- `frontend/src/config/admin-module-data.ts:222` has a "Daily Close" quick action pointing to `/admin/operations/daily-close` — **that page does not exist** (dead link). The only daily-close pages are `admin/control/daily-close` and `admin/finance/daily-close`.

Fix:
1. Add `financeDailyClose: "/admin/finance/daily-close"` to `ROUTES.admin` in `frontend/src/lib/routes.ts`.
2. Point the `admin-module-data.ts:222` quick action at `ROUTES.admin.financeDailyClose`.
3. Register the page in `frontend/src/config/admin-route-registry.ts` so nav/search can find it.
4. Add a cross-link between `/admin/control/daily-close` (enterprise close) and `/admin/finance/daily-close` (solopreneur close) explaining which to use — a solo operator should not discover two "daily close" pages with no explanation. One-line banner each is enough.

## GAP-3: Daily Close page violates house conventions

**File:** `frontend/src/app/(dashboard)/admin/finance/daily-close/page.tsx`

- Uses ad-hoc `PageHeader` + hardcoded `bg-zinc-50/50`, `bg-white`, `text-zinc-900` — **dark mode is broken**; every other admin page uses `ERPPageShell` + semantic tokens (`bg-card`, `text-foreground`, `border-border`).
- Uses `confirm()` and `alert()` — house style is inline confirm panels / notice banners (see the reversal page or `ApprovalConfirmDialog`).
- `useState<any>(null)` for result — type it with `SolopreneurCloseResponse`.

Rewrite the page with `ERPPageShell` (eyebrow "Finance", breadcrumbs, stats row: Processed / Errors / Balanced?), semantic color tokens, and an inline confirm step instead of `window.confirm`.

## GAP-4: Backend daily-close service defects

**File:** `backend/accounting/services/solopreneur_finance_service.py`

1. `start_date = date(2020, 1, 1)` — every close re-scans 6+ years of records. Add a `SolopreneurCloseRun` bookmark (or reuse the last successful run date from an audit model) and scan from `last_success_date - 7 days` with a manual `full_rescan=true` escape hatch.
2. One giant `transaction.atomic()` wraps all six bridges — a single raising bridge rolls back everything and surfaces as a 500. Either run each bridge in its own atomic block (collecting per-bridge errors → true `PARTIAL_SUCCESS`) or keep the global atomic but document that PARTIAL_SUCCESS can only come from bridges that swallow errors internally. Recommendation: **per-bridge atomic, collect errors, never 500 for a data problem.**
3. `backend/api/v1/views/admin_solopreneur_finance.py:38` — bare `except Exception: return 500 str(e)` leaks internals. Catch `ValueError/ValidationError` → 400 with message; log unexpected exceptions and return a generic 500.
4. No audit trail — write one `AuditLog`/business-event row per close run (who, when, counts). Follow the existing audit pattern in `subscriptions/services/audit_service.py`.
5. Add `dry_run: bool` to the endpoint (bridge runners already accept `dry_run` — currently hardcoded `False`).

## GAP-5: Ledger-health endpoint has no caching

`AdminSolopreneurLedgerHealthView` runs a full trial-balance build on every page load. Wrap in a 30-second cache (same pattern as the navigation-badges fix: `django.core.cache`, key `solopreneur:ledger-health`, invalidate after a close run posts).

---

# PHASE 3.1 — Smart Collection Service (Backend)

## Reuse map — DO NOT rebuild these; call them

The codebase already has every posting primitive with locking + idempotency. The smart engine is an **orchestrator**, nothing more:

| Capability | Existing function | Location |
|---|---|---|
| Pay one EMI | `record_emi_payment(...)` (has `idempotency_key`, `finance_account_id`, `branch_id`, `cash_counter_id`) | `backend/subscriptions/services/payment_service.py:487` |
| Collect against a Direct Sale | `collect_direct_sale_payment(...)` (same param family, `select_for_update`) | `backend/billing/services/direct_sale_collection_service.py:213` |
| Apply existing advance to an EMI | `PaymentAllocationService.allocate_customer_advance(...)` (guards: same-customer, ≤ unapplied, ≤ EMI outstanding, idempotent replay by reference) | `backend/subscriptions/services/payment_allocation_service.py:35` |
| Deposit remainder as new advance | `CustomerAdvanceService.collect_unapplied_advance(...)` | `backend/subscriptions/services/customer_advance_service.py:67` |
| Per-source dispatch precedent | `route_collection(...)` | `backend/services/collection_router.py:57` |

Models: `CustomerAdvance` / `CustomerAdvanceAllocation` at `backend/subscriptions/models.py:3333/3456`; EMI ordering fields on `Emi` (`due_date`, `month_no`).

## [NEW] `backend/billing/services/smart_collection_service.py`

Two public functions sharing one planner:

```python
def plan_smart_collection(
    *,
    customer_id: int,
    amount: Decimal,
    use_existing_advance: bool = True,
) -> dict:
    """Pure read-only planner. No writes, no locks beyond snapshot reads.
    Returns the allocation plan the UI previews."""

def execute_smart_collection(
    *,
    customer_id: int,
    amount: Decimal,
    payment_method: str,          # "CASH" | "UPI" | "BANK"
    finance_account_id: int,
    collected_by,                 # request.user
    use_existing_advance: bool = True,
    idempotency_key: str,         # REQUIRED
    branch_id: int | None = None,
    cash_counter_id: int | None = None,
    reference_no: str | None = None,
    notes: str | None = None,
) -> dict:
    """Re-plans under select_for_update, then posts each allocation via the
    existing services inside ONE transaction.atomic block."""
```

### Allocation algorithm (locked decisions applied)

```
pool_cash    = amount
pool_advance = customer's unapplied CustomerAdvance balance if use_existing_advance else 0
allocations  = []

# STEP 0 — existing advance consumes EMIs first (advance can only go to EMIs
#           per PaymentAllocationService guards; do NOT apply advance to direct sales)
for emi in unpaid EMIs of customer, ordered (due_date ASC, month_no ASC, subscription_id ASC):
    emi_due = emi outstanding amount (full EMI only — see partial rule)
    if pool_advance >= emi_due:
        allocations.append(ADVANCE_TO_EMI, emi, emi_due)
        pool_advance -= emi_due
    # partial rule: if advance can't cover the full EMI, leave it for cash

# STEP 1 — cash to remaining oldest unpaid EMIs (SKIP-PARTIAL rule)
for emi in remaining unpaid EMIs (same ordering):
    emi_due = full outstanding of that EMI
    if pool_cash >= emi_due:
        allocations.append(CASH_TO_EMI, emi, emi_due)
        pool_cash -= emi_due
    else:
        break   # skip partial EMI entirely; money flows to next bucket

# STEP 2 — cash to oldest pending Direct Sales (partial allowed here:
#           direct-sale collection already supports partial receipts natively)
for sale in DirectSales of customer with balance_total > 0, ordered sale_date ASC, id ASC,
           status in collectible states (use is_collectible / collectible filter
           consistent with direct_sale_collection_service):
    pay = min(pool_cash, sale outstanding)
    if pay > 0:
        allocations.append(CASH_TO_DIRECT_SALE, sale, pay)
        pool_cash -= pay
    if pool_cash == 0: break

# STEP 3 — remainder to Customer Advance
if pool_cash > 0:
    allocations.append(CASH_TO_ADVANCE, pool_cash)
```

Rationale notes for the implementer:
- **Advance never touches Direct Sales** — `allocate_customer_advance` only supports EMI targets, and that is correct business-wise (advance is a subscription-side balance).
- **Skip-partial applies to EMIs only.** Direct-sale receipts are inherently partial-friendly (`received_total`/`balance_total`), so partial allocation there is safe and expected.
- Use the same "EMI outstanding" computation as `payment_allocation_service._emi_outstanding_amount` — do not invent a new one.

### Execution rules

- Wrap `execute_smart_collection` in ONE `transaction.atomic()`. Inside it, **re-run the planner** with `select_for_update` on the EMIs / sales / advance rows (plans computed at preview time may be stale). If the fresh plan differs from what the preview showed, that's fine — the response reports what actually happened.
- Post each allocation through the existing service:
  - `ADVANCE_TO_EMI` → `PaymentAllocationService.allocate_customer_advance(...)`
  - `CASH_TO_EMI` → `record_emi_payment(..., idempotency_key=f"{idempotency_key}:emi:{emi_id}")`
  - `CASH_TO_DIRECT_SALE` → `collect_direct_sale_payment(..., reference_no derived from idempotency key)`
  - `CASH_TO_ADVANCE` → `CustomerAdvanceService.collect_unapplied_advance(...)`
- Derive **per-allocation idempotency keys** from the master key (`{master}:emi:{id}`, `{master}:ds:{id}`, `{master}:adv`) so a retry of the whole request replays idempotently at each step.
- Idempotency store for the master key: create a small model `SmartCollectionRun` (`idempotency_key` unique, `customer`, `amount`, `status`, `result_json`, `created_by`, `created_at`). On duplicate key: return the stored result with `"idempotent_replay": true`, HTTP 200. This also doubles as the audit trail.
- Validation errors (unknown customer, amount ≤ 0, missing finance account, nothing to allocate AND remainder-to-advance would be the entire amount — still allowed, but warn) → `ValidationError` → 400. Never 500 for data problems.

### Return shape (both plan & execute)

```json
{
  "customer": {"id": 1, "name": "…", "phone": "…"},
  "input": {"amount": "10000.00", "use_existing_advance": true},
  "opening": {
    "advance_balance": "2000.00",
    "emi_outstanding_total": "9000.00",
    "direct_sale_outstanding_total": "3500.00"
  },
  "allocations": [
    {"step": "ADVANCE_TO_EMI", "emi_id": 12, "subscription_number": "SUB-…", "month_no": 3, "amount": "1500.00"},
    {"step": "CASH_TO_EMI", "emi_id": 13, "subscription_number": "SUB-…", "month_no": 4, "amount": "1500.00"},
    {"step": "CASH_TO_DIRECT_SALE", "direct_sale_id": 7, "sale_no": "DS-…", "amount": "3500.00"},
    {"step": "CASH_TO_ADVANCE", "amount": "500.00"}
  ],
  "skipped": [
    {"reason": "PARTIAL_EMI_SKIPPED", "emi_id": 14, "emi_amount": "1500.00", "available": "900.00"}
  ],
  "closing": {"advance_balance": "500.00", "cash_unallocated": "0.00"},
  "receipt": {          // execute only, null on dry_run
    "receipt_no": "SC-2026-…", "receipt_date": "2026-07-20",
    "payment_ids": [...], "receipt_ids": [...], "advance_id": 5
  },
  "dry_run": true,
  "idempotent_replay": false
}
```

The `skipped` array is important UX: the operator must SEE why EMI #14 wasn't paid ("needs ₹1,500, only ₹900 left — routed to advance").

---

# PHASE 3.2 — Smart Collection API (Backend)

## [NEW] `backend/api/v1/views/admin_smart_collection.py`

```
POST /api/v1/admin/billing/smart-collect/
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `customer_id` | int | yes | |
| `amount` | decimal string | yes | > 0 |
| `payment_method` | "CASH"\|"UPI"\|"BANK" | yes (ignored on dry_run) | |
| `finance_account_id` | int | yes (ignored on dry_run) | where money lands |
| `dry_run` | bool | no, default false | plan only, zero writes |
| `use_existing_advance` | bool | no, default true | toggle |
| `idempotency_key` | uuid string | required when dry_run=false | |
| `branch_id` / `cash_counter_id` | int | optional | pass through |
| `reference_no` / `notes` | string | optional | |

Also expose a read endpoint the page loads on customer select:

```
GET /api/v1/admin/billing/smart-collect/outstanding/?customer_id=N
```
→ returns the `opening` block plus per-EMI and per-sale line detail (list of unpaid EMIs with due_date/amount, list of pending sales with balance). Implement it as `plan_smart_collection(amount=0)` variant or a dedicated summary query — either way, one endpoint, one round trip.

Conventions (copy from `admin_solopreneur_finance.py` but fixed per GAP-4):
- `permission_classes = [permissions.IsAuthenticated, IsAdmin]` (import from `api.v1.permissions`)
- ValidationError → 400 with field errors; unexpected → logged + generic 500.

## [NEW] `backend/api/v1/routes/admin_smart_collection.py` + [MODIFY] `backend/api/v1/urls.py`

Follow the exact pattern of `api/v1/routes/admin_solopreneur_finance.py` and its include at `urls.py:147`:

```python
path("admin/", include("api.v1.routes.admin_smart_collection")),
```

---

# PHASE 3.3 — Unified Collections Dashboard (Frontend)

## [NEW] `frontend/src/services/smart-collection.ts`

Typed service module (do NOT bolt onto accounting.ts). Use `apiFetch<T>` **correctly** (returns parsed JSON — see GAP-1):

```ts
export type SmartCollectionPlan = { /* mirror the return shape above */ };
export function getSmartCollectOutstanding(customerId: number): Promise<OutstandingSummary>;
export function previewSmartCollection(payload: SmartCollectPayload): Promise<SmartCollectionPlan>; // dry_run: true
export function executeSmartCollection(payload: SmartCollectPayload): Promise<SmartCollectionPlan>; // dry_run: false
```

Add the smart-collect path to `isPaymentCollectionMutation` in `frontend/src/lib/api/index.ts` (~line 161) so the existing client-side idempotency-key infrastructure auto-attaches — OR generate the UUID in the page component. Pick ONE mechanism; recommend reusing `isPaymentCollectionMutation` since the plumbing exists.

## [NEW] `frontend/src/app/(dashboard)/admin/billing/smart-collect/page.tsx`

Desktop-first, `ERPPageShell` wrapper (eyebrow "Billing", breadcrumbs Admin → Billing → Smart Collect, statusBadge "Solopreneur"). Three-step operator flow, all on one page:

**Step 1 — Customer.** Search input (reuse the customer search endpoint used by `/admin/customers`; server-backed `?q=`). On select → call `getSmartCollectOutstanding` → show an outstanding panel:
- KPI chips: Advance balance · EMI outstanding (count + ₹) · Direct-sale outstanding (count + ₹)
- Detail lists: unpaid EMIs (subscription #, month, due date, amount) and pending sales (sale no, date, balance) so the operator sees exactly what exists before typing an amount.
- Support `?customer=<id>` URL param prefill (same pattern used on billing/reversals — see `searchParams.get("customer")` there) so the Customer List can deep-link here.

**Step 2 — Amount + options.** 
- Amount input (₹), payment method select (CASH/UPI/BANK), finance-account select (reuse the finance-account fetch used by the collection workspace / `DirectSaleCollectionPayload` flow), optional reference/notes.
- Checkbox: **"Apply existing advance first"** — default checked, only shown when advance balance > 0, label shows the balance: "Apply existing advance (₹2,000) first".
- Every input change debounce-calls `previewSmartCollection` (dry_run) — the **Live Preview panel** renders the backend's allocation array as a waterfall list: each row = step badge (color-coded: EMI green, Direct Sale blue, Advance purple) + target + amount. Render the `skipped` array as amber warning rows ("EMI month 5 skipped — ₹900 short of full EMI; routed to advance").

**Step 3 — Confirm & post.** 
- "Post Collection" button disabled until a valid preview exists. Inline confirm row (not `window.confirm`): "Post ₹10,000 across 4 allocations?" → Confirm.
- On success: green receipt card (receipt_no, date, per-allocation breakdown, closing advance balance) with a Print button (`window.print` + print CSS is sufficient) and "New collection" reset.
- On `idempotent_replay: true`: show the stored receipt with an info banner "This collection was already posted — showing the original receipt."
- Error banner for 400s with the backend message.

House rules for this page (Antigravity: follow these strictly):
- Semantic tokens only (`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`) — no zinc/white hardcodes.
- `lucide-react` icons, direct imports.
- Loading/error/empty via `ERPLoadingState` / `ERPErrorState` / `ERPEmptyState`.
- All money display via `formatRupee` from `@/lib/utils/currency`.

## [MODIFY] Wiring & discoverability

1. `frontend/src/lib/routes.ts` → add `billingSmartCollect: "/admin/billing/smart-collect"` under `ROUTES.admin`.
2. `frontend/src/config/admin-route-registry.ts` → register the page (title "Smart Collect", module Billing/Collections).
3. `frontend/src/app/(dashboard)/admin/customers/page.tsx` → add a **"Smart Collect"** row action button linking `/admin/billing/smart-collect?customer=${row.id}` (same pattern as the existing "Reversals" / "SD Returns" row buttons added earlier), and highlight it (primary tone) when the row has outstandings (`hasOutstandings` flag already computed at ~line 770).
4. Add a lane to the customers-page `ControlLaneGrid`: title "Smart Collect", badge "Collections & Cashier", description "One lump sum → EMIs → direct sales → advance, automatically."
5. `frontend/src/config/admin-module-data.ts` → add Smart Collect to the Billing module's workflows/quick actions.

---

# PHASE 3.4 — Verification Plan

## Automated

1. `cd frontend && npx tsc --noEmit` → 0 errors (run with the Node path configured on this machine).
2. `cd backend && .venv\Scripts\python manage.py check` → clean; `manage.py makemigrations --check --dry-run` → only the new `SmartCollectionRun` migration expected.
3. **Backend unit tests** — `backend/tests/billing/test_smart_collection_service.py` (pytest, follow existing test style in `backend/tests/domain/test_payment_service.py`):
   - `test_exact_match` — amount covers all EMIs + sales exactly; remainder 0; no advance row created.
   - `test_underpayment_skips_partial_emi` — ₹10,000 vs 3 × ₹4,500 EMIs → pays 2 EMIs, ₹1,000 → advance (NOT partial EMI #3); `skipped` contains EMI #3.
   - `test_partial_direct_sale_allowed` — remainder after EMIs partially pays a sale; sale `balance_total` reduced, not zero.
   - `test_overpayment_to_advance` — excess lands in `CustomerAdvance`, balance correct.
   - `test_existing_advance_consumed_first` — toggle on: advance pays EMI 1 before cash; toggle off: advance untouched.
   - `test_advance_never_touches_direct_sales`.
   - `test_dry_run_writes_nothing` — plan call leaves Payment/Receipt/Advance counts unchanged, and equals the execute allocation list when data is unchanged.
   - `test_idempotent_replay` — same `idempotency_key` twice → second response `idempotent_replay: true`, no duplicate Payments/Receipts.
   - `test_ordering` — EMIs allocated strictly by due_date then month_no; sales by sale_date.
   - `test_validation` — amount ≤ 0 → 400; unknown customer → 400; missing finance_account on execute → 400.

## Manual (browser)

1. `/admin/billing/smart-collect` → search a seeded customer with 3 unpaid EMIs + 1 pending direct sale + existing advance.
2. Enter lump sum → preview shows waterfall incl. advance step and any skipped-partial warning.
3. Toggle "apply existing advance" off → preview re-computes without step 0.
4. Post → receipt card; verify in `/admin/payments`, the direct sale's balance, and the customer's advance balance.
5. Re-submit the same post (double-click simulation) → idempotent replay banner, no duplicates.
6. Phase 3.0 regression: `/admin/finance/daily-close` now loads ledger health successfully and posting shows the real result (GAP-1 fixed); dark mode renders correctly; the daily-close quick action in the admin dashboard opens a real page.

---

# Implementation order for Antigravity

1. **Phase 3.0 gap fixes** (GAP-1 first — it's a 10-line fix that unbreaks Phase 2).
2. `SmartCollectionRun` model + migration.
3. `smart_collection_service.py` planner (pure function) + unit tests for the planner.
4. `execute_smart_collection` + posting tests.
5. API view + routes + urls.
6. Frontend service module.
7. Smart-collect page (search → preview → post).
8. Wiring: routes.ts, route registry, customers page buttons/lane, module data.
9. Full verification pass (3.4).

# Acceptance criteria (definition of done)

- [ ] All 6 Phase 3.0 gaps closed (GAP-1…GAP-5 + dead link).
- [ ] `POST /admin/billing/smart-collect/` with `dry_run` works and writes nothing.
- [ ] Execute posts through existing services only (no new posting logic, no direct Payment/Receipt object creation in the new service).
- [ ] Skip-partial-EMI rule enforced and surfaced in `skipped`.
- [ ] Advance toggle works both ways; advance never applied to direct sales.
- [ ] Idempotent replay proven by test and manual double-post.
- [ ] Page reachable from customers list, route registry, and module quick actions.
- [ ] `tsc --noEmit` clean, `manage.py check` clean, all new pytest tests green.
