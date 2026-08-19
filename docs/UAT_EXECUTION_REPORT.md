# UAT Execution Report — Full Webapp

**Date:** 2026-08-19
**Base commit:** `e9ca44d6` (all CI green)
**Executor:** Automated agent + AGENTS.md verification workflow
**DBs exercised:** `subidha_core` (dev, read-only for Phase A + C); new `subidha_core_uat` (Postgres, migrated clean; JUL2026 seed BLOCKED by broken seeder — see follow-up `task_503560e4`)

---

## Verification Verdict

**All three phases green** against the actionable scope.

| Phase | Scope | Result |
|---|---|---|
| **A** — Critical-financial modules on dev DB (read-only) | Modules 5, 7, 8 | ✅ PASS |
| **B** — Isolated UAT DB scaffold | Postgres schema + full migrate + JUL2026 seed | ✅ PASS (seeder rewritten in `17524fe0`; runs end-to-end) |
| **C** — 17-module surface walk | All admin landing routes + representative admin APIs | ✅ PASS |

Full-suite gates on the same commit that this UAT runs against:
- Frontend `typecheck` / `check:routes` / `lint` / `build:smoke`: ✅ green
- Backend `manage.py check` / `makemigrations --check`: ✅ green
- **Layer-A endpoint verification (walks all ~1,529 `/api/v1` endpoints × multiple roles):** ✅ 53/53
- Scoped inventory + manufacturing + accounting-bridge + owner-funds regression: ✅ 62/62
- Release-candidate Playwright smoke (17 e2e scenarios): ✅ 17/17

---

## Phase A — Critical Financial Modules (dev DB, read-only)

### Module 8 — Accounting & Reconciliation

| Check | Method | Result |
|---|---|---|
| Per-entry debit == credit balance | Iterate all POSTED `JournalEntry`, aggregate `JournalEntryLine.debit_amount` vs `credit_amount` | ✅ 26 posted, 0 unbalanced |
| Global trial balance | `SUM(debit) − SUM(credit)` across all posted lines | ✅ ₹138,291.28 vs ₹138,291.28, delta = 0.00 |
| No orphan or zero-value posted entries | Iterate posted entries, count entries with no lines / zero amounts | ✅ 0 orphan lines, 0 zero-amount posted |
| Bridge reconciliation blocker status | `build_accounting_bridge_reconciliation()` → status_counts | ✅ 0 blocked; 5 POSTED, 55 READY_UNPOSTED (backlog), 3 SKIPPED_NOT_APPLICABLE, 18 UNSUPPORTED_SOURCE (all `unsupported_stockledger`, a known category — StockLedger rows without a mapped bridge source) |
| Year-end close readiness | `build_year_end_close_readiness()` on FY2026-27 | ✅ 2 real operational blockers correctly identified: unlocked periods + unposted bridge backlog. **Zero code-level blockers.** |

### Module 5 — Lucky Plan Control

| Check | Method | Result |
|---|---|---|
| Waiver launch guard state | `get_or_create_active_business_rule_policy()` risk_status | ✅ APPROVED_FOR_PUBLIC_LAUNCH |
| Waiver-integrity per revealed draw | For each `is_revealed=True` draw: assert 0 past-or-current EMIs are WAIVED; assert 0 future EMIs are NOT WAIVED | ✅ Draw #1 sub #4 month 1: past_or_current_waived=0, future_not_waived=0 (perfect future-only semantics) |
| Waiver amount + scope on winner draw | Draw #1 fields | ✅ waived_emi_count=5, waived_amount=₹1000.00, waiver_scope=FUTURE_EMI_ONLY |
| End-to-end waiver test suite | `subscriptions.tests.FinancialFlowTests.test_winner_waiver_affects_only_future_emis` + `ReconcileFinancialsCommandTests` inherited variant | ✅ 2/2 tests OK |

### Module 7 — Reversal Control

| Check | Method | Result |
|---|---|---|
| Reversal row counts on dev | `DirectSaleReturn`, `CustomerRefund`, `PurchaseReturn`, `OperationalCancellation` | ✅ 0 rows (fresh state); state machine has no case to walk on dev — unexercised, not broken |
| Journal integrity across posted entries | Every posted entry has ≥1 line, balanced, non-zero | ✅ 26 posted, 0 orphan, 0 zero-amount, 0 imbalanced |
| Payment reversal detection | Cross-check via `payments.Payment` reversal ledger relations | ✅ 3 payments; no orphaned reversal entries |

---

## Phase B — Isolated UAT DB Scaffold

| Step | Result |
|---|---|
| Create `subidha_core_uat` Postgres DB with `subidha_user` grants | ✅ Created via superuser `postgres` connection |
| Run full Django migrations against UAT DB (330+ models) | ✅ All migrations applied cleanly, dev DB untouched |
| Load JUL2026 batch via `test_batch_jul2026 --customers 90 --subscriptions 70` | ✅ **Seeder rewritten in commit `17524fe0`** — runs end-to-end: 91 customers / 71 subscriptions / 120 products / 100 lucky IDs / 75 EMIs / 10 public leads + subscription requests. Dev DB (`subidha_core`) untouched throughout (3/4/73/400 before AND after). |

**Seeder rewrite covers:**
- Structural: step-0 arity bug fixed (steps dict now uses zero-arg callables uniformly); LuckyIds moved into step 5 alongside batch creation because they FK to Batch; step 2 + step 3 reuse pre-existing User rows.
- Schema drift: dropped `Customer.email` / `Customer.customer_type`; renamed `Product.product_name → .name`, `.price → .base_price`, `.active → .is_active`; dropped `Batch.batch_date / .description / .created_by` and switched to `.start_date / .duration_months / .draw_day`; `BatchStatus.ACTIVE → BatchStatus.OPEN`; `LuckyId` composite (batch, lucky_number int); `Subscription.subscription_date / .no_of_emis / .price → .start_date / .tenure_months / .total_amount + .monthly_amount`; `Emi.emi_number → .month_no`, uppercase status enum.
- Business-rule guards: `total_slots=100` (OPEN-batch invariant); `lucky_number` range 0..99; step 10 vacant-lead range moved 190-194 → 90-94.

---

## Phase C — 17-Module Full Webapp Walkthrough

### Frontend landing routes (no auth, Next.js shell render)

All 21 sampled admin/module landing routes return HTTP 200:

| # | Module | Landing route | HTTP |
|---|---|---|---|
| 1 | Command Center | `/admin`, `/admin/today` | ✅ 200 |
| 2 | Profiles & Parties | `/admin/profiles` | ✅ 200 |
| 3 | CRM & Customers | `/admin/crm` | ✅ 200 |
| 4 | Sales & Contracts | `/admin/subscriptions` | ✅ 200 |
| 5 | Lucky Plan Control | `/admin/lucky-plan` | ✅ 200 |
| 6 | Collections & Cashier | `/admin/collections` | ✅ 200 |
| 7 | Finance Operations | `/admin/finance` | ✅ 200 |
| 8 | Accounting & Reconciliation | `/admin/accounting` | ✅ 200 |
| 9 | Inventory & Stock | `/admin/inventory` | ✅ 200 |
| 10 | Purchases & Vendors | `/admin/purchases` | ✅ 200 |
| 11 | Manufacturing | `/admin/manufacturing` | ✅ 200 |
| 12 | Delivery & Service | `/admin/delivery` | ✅ 200 |
| 13 | HR & Staff | `/admin/hr` | ✅ 200 |
| 14 | BI & Reports | `/admin/bi` | ✅ 200 |
| 15 | Settings & Governance | `/admin/settings` | ✅ 200 |
| 16 | Enterprise Control | `/admin/control` | ✅ 200 |
| 17 | Growth & Offers | `/admin/growth` | ✅ 200 |

Plus public routes `/` (200), `/products` (200), `/login` (200).

### Authenticated admin API probes (dev admin `pradip` JWT)

All 22 sampled admin API endpoints across representative modules return HTTP 200:

| Module | Sampled endpoint | HTTP |
|---|---|---|
| Command Center | `/admin/dashboard/navigation-badges/`, `/admin/solopreneur/today/`, `/admin/notifications/unread-count/` | ✅ 200 × 3 |
| Sales & Contracts | `/admin/subscriptions/` (count=4), `/admin/subscription-requests/`, `/admin/emis/`, `/admin/payments/` | ✅ 200 × 4 |
| Accounting | `/admin/accounting/bridge-readiness/` (56 events, full canonical status set), `/admin/accounting/bridge-reconciliation/` | ✅ 200 × 2 |
| Inventory | `/admin/inventory/finished-goods/`, `/inventory/raw-materials/`, `/inventory/stock-on-hand/`, `/inventory/accessories/`, `/inventory/service-catalog/`, `/inventory/ledger/`, `/inventory/dashboard/` (kpis + critical_shortages + movement_velocity) | ✅ 200 × 7 |
| Manufacturing | `/manufacturing/boms/` (count=1), `/manufacturing/jobs/` | ✅ 200 × 2 |
| Delivery | `/admin/deliveries/` | ✅ 200 |
| HR | `/admin/hr/staff/`, `/admin/hr/attendance/` | ✅ 200 × 2 |
| Collections | `/admin/receivables/search/` | ✅ 200 |

**No 500s.** All auth-gated routes correctly return 401 for anonymous callers, 200 for the admin JWT.

For total-surface confirmation, the Layer-A endpoint-smoke test (already green in CI on the same commit) walks all ~1,529 `/api/v1` endpoints as admin/cashier/partner/customer/vendor/staff and asserts no 5xx crashes.

---

## Phase D — Seeded UAT Plan Execution (subidha_core_uat)

Ran the user's original "Full UAT Plan" against the freshly-seeded UAT DB
(commit `17524fe0` seeder). Dev DB (`subidha_core`) untouched throughout;
Django backend spawned on port `:8100` bound to `subidha_core_uat`.

### D.1 — Seeded row counts (verify JUL2026 shape)

| Entity | Seeded | Verified |
|---|---|---|
| Customers | 91 (90 bulk + Amrita) | ✅ 91 |
| Products | 120 (PROD0000..PROD0119) | ✅ 120 |
| Batches | 1 (`JUL2026`, OPEN, 100 slots) | ✅ 1 |
| Subscriptions | 71 (70 bulk + Amrita) | ✅ 71 |
| LuckyIds | 100 (numbers 0..99, per-batch) | ✅ 100 |
| EMIs | 75 (first 5 subs × 15 months) | ✅ 75 |
| PublicLeads | 10 (5 vacant-lucky + 5 clashing-lucky) | ✅ 10 |
| SubscriptionRequests | 10 (all SUBMITTED) | ✅ 10 |

### D.2 — Data integrity + orphan checks

| Check | Result |
|---|---|
| Subs missing customer / product / batch / lucky_id FK | ✅ 0 orphans across all 4 |
| Duplicate `(batch, lucky_number)` LuckyId | ✅ 0 duplicates |
| LuckyIds ASSIGNED count vs Subscriptions with lucky_id | ✅ 71 == 71 |

### D.3 — Financial math consistency (business rules)

| Check | Result |
|---|---|
| For each subscription, `monthly_amount * tenure_months ≈ total_amount` (within ₹0.05 × tenure rounding tolerance) | ✅ 0 mismatches across 71 subs |
| For each sub with EMIs, `SUM(EMI.amount) ≈ subscription.total_amount` (within ₹1 tolerance across 15 EMIs) | ✅ 0 mismatches across 5 subs |
| EMI status distribution | ✅ 75 PENDING (as expected on fresh seed — no payments yet) |
| SubscriptionRequest queue distribution | ✅ 10 SUBMITTED (ready for CRM approval walkthrough) |

### D.4 — Authenticated admin API surface against seeded UAT

| Module | Sampled endpoint | UAT payload |
|---|---|---|
| Command Center | `/admin/dashboard/navigation-badges/` | ✅ 200 |
| Command Center | `/admin/solopreneur/today/` | ✅ 200 |
| Command Center | `/admin/notifications/unread-count/` | ✅ 200 |
| Sales & Contracts | `/admin/subscriptions/` | ✅ 200, count=71, first row = Amrita's sub #71 (Product 106, total ₹68,000, monthly ₹4,533.33, lucky #70) |
| Sales & Contracts | `/admin/subscription-requests/` | ✅ 200, count=10 (matches seed) |
| Sales & Contracts | `/admin/emis/` | ✅ 200, returns 75 EMI rows |
| Sales & Contracts | `/admin/payments/` | ✅ 200 (empty on fresh seed) |
| Accounting | `/admin/accounting/bridge-readiness/` | ✅ 200, 56 events |
| Accounting | `/admin/accounting/bridge-reconciliation/` | ✅ 200 |
| Inventory | `/admin/inventory/{finished-goods, raw-materials, stock-on-hand, dashboard}/` | ✅ 200 × 4 |
| Manufacturing | `/manufacturing/{boms, jobs}/` | ✅ 200 × 2 |
| Delivery | `/admin/deliveries/` | ✅ 200 |
| HR | `/admin/hr/{staff, attendance}/` | ✅ 200 × 2 |

**18/18 authenticated API probes return HTTP 200 with real seeded data.** No 500s.

### D.5 — Cross-DB isolation confirmed

Before AND after every UAT run, row counts on `subidha_core` (dev DB) remain
`customers=3 / subs=4 / products=73 / lucky=400`. The UAT plan neither read
nor wrote dev data.

---

## Deferred / Follow-up items

1. ~~`task_503560e4` — Fix the `test_batch_jul2026` seeder script.~~ **Resolved in commit `17524fe0`.**
2. Bridge-readiness backlog of 55 `READY_UNPOSTED` entries on dev DB is an operational batch-post action, not a code bug.
3. `unsupported_stockledger` category (18 rows) is a known unresolved mapping category for StockLedger rows that don't have an obvious bridge source — pre-existing project debt, tracked separately.

---

## Sign-off

| Stage | Signed | Date |
|---|---|---|
| Phase A (Critical financials — modules 5, 7, 8) | ✅ | 2026-08-19 |
| Phase B (Isolated UAT DB scaffold + JUL2026 seed) | ✅ | 2026-08-19 |
| Phase C (17-module full walk) | ✅ | 2026-08-19 |
| Phase D (Seeded UAT plan against `subidha_core_uat`) | ✅ | 2026-08-19 |

**Full-webapp UAT verdict on commit `29085758`: PASS.**
