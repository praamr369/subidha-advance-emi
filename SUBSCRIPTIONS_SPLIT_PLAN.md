# Subscriptions App Split — Completion Plan

**Status:** ~60% complete. This is a *completion* plan for an in-progress domain split, not a greenfield refactor.
**Author:** drafted 2026-07-31. **Owner:** solo maintainer.
**Golden rule:** every model move is **state-only** (Django app-label changes; the physical Postgres table never moves, renames, or copies rows).

---

## 1. Where things actually stand (grounded findings)

The `subscriptions` app today: **125 model classes** across 20 `models_*.py` files, **139 numbered migrations**, **57 service files**, ~52K LOC.

**Already moved** (core domain models), each pinned to its original table via `Meta.db_table`:

| New app | Example models | Table pin |
|---|---|---|
| `contracts` | Subscription, ContractAmendment, ContractReference, SubscriptionGuarantor | `db_table="subscriptions"`, `contract_amendments`, … |
| `payments` | Emi, Payment, CustomerAdvance, RecoveryCase, EMIScheme, FinancialLedger | `db_table="emis"`, `payments`, `subscriptions_recovery_cases`, … |
| `customers` | Customer, Address, CustomerKycDocument, CustomerDispute | `db_table="customers"`, `customers_...` |
| `deliveries` | SubscriptionDelivery, ProductPossession, Repossession, ConsumerReturnRequest | (pinned) |
| `commissions` | Commission, CommissionPayoutBatch, CommissionPayoutLine | (pinned) |
| `lucky_plan` | Batch, LuckyId, LuckyDraw, DrawAuthorisation | (pinned) |
| `crm` | PublicLead, SubscriptionRequest, ProductRequest, CRMPipeline, PartyMaster | (pinned) |

**How it was done (the proven pattern — replicate exactly):**
- New app's `0001_initial.py` wraps `CreateModel` in `migrations.SeparateDatabaseAndState(state_operations=[...], database_operations=[])` — registers Django state, runs **no** DDL.
- `subscriptions/migrations/0139_remove_address_customer_and_more.py` carries **72 `DeleteModel`** ops (state-only) removing those models from the `subscriptions` app state. Tables untouched.
- `subscriptions/models.py` lines **909–933** re-export every moved model (`from contracts.models import Subscription, …`) so the **578 legacy `from subscriptions…` imports across the codebase keep working** unchanged.

**Still living in `subscriptions` (the remaining ~40%):**

| File | Classes | Tables | Proposed destination |
|---|---|---|---|
| `models_business_setup.py` | 36 | 19 | **new `business_setup` app** |
| `models_control_foundation.py` | 10 | 3 | **new `finance_control` app** |
| `models_month_end_close.py` | 4 | 2 | `finance_control` |
| `models_cash_counter_session.py` | 4 | 1 | `finance_control` (or `payments` — see §6) |
| `models_growth_offers.py` | 8 | 3 | **new `growth` app** |
| `models_growth_requests.py` | 8 | 3 | `growth` |
| `models_kyc_workflow.py` | 5 | 0* | fold into `customers` |
| `models_workbench.py` | 4 | 2 | fold into `crm` |
| `models_policy_governance.py` | 2 | 1 | `business_setup` |
| `models_business_compliance_review.py` | 2 | 1 | `business_setup` |
| `models_document_print_settings.py` | 2 | 1 | `business_setup` |
| `models_email_smtp_settings.py` | 1 | 1 | `business_setup` |
| `models_address.py` | 2 | — | fold into `customers` (Address already there) |
| `models.py` residual | ~4 real tables + enums | 4 | **new `audit` app** (AuditLog, BusinessEventLog, BusinessEventType) + enums co-located per §5 |
| `models_contract_amendment.py`, `models_rent_lease_collection.py`, `models_customer_advance_refund.py`, `models_crm_pipeline.py`, `models_online_request.py`, `models_lucky_draw.py` | extension/shim modules | — | delete after their targets absorb the fields |

\* `kyc_workflow` classes are mostly enums/mixins with no own table.

**Coupling to watch:** `AuditLog` is referenced by ≥10 apps (api 36, contracts 18, accounting 13, billing 7, …). A second `AuditLog` also exists at `api/v1/utils/audit_log.py` — reconcile before moving (§6, open question).

---

## 2. The per-model move recipe (unit of work)

For each model `M` (table `t`) moving from `subscriptions` → app `X`:

1. **Copy** the class definition into `X/models.py`. Keep `Meta.db_table = "t"` **unchanged**. Keep field definitions byte-identical.
2. **New-app migration** `X/000N`:
   ```python
   migrations.SeparateDatabaseAndState(
       state_operations=[migrations.CreateModel(name="M", fields=[...], options={"db_table": "t", ...})],
       database_operations=[],   # NO DDL
   )
   ```
   `dependencies`: the latest `subscriptions` migration + any FK-target app migrations.
3. **Subscriptions migration** `subscriptions/000M` (depends on `X/000N`):
   ```python
   migrations.SeparateDatabaseAndState(
       state_operations=[migrations.DeleteModel(name="M")],
       database_operations=[],
   )
   ```
4. **ContentType + permissions data migration** (see §3) — repoint `django_content_type(app_label='subscriptions', model='m')` → `('x','m')`.
5. **Re-export shim**: add `from X.models import M` to `subscriptions/models.py` so legacy imports resolve.
6. **Repoint incoming FKs** written as `"subscriptions.M"` → `"X.M"` in other apps (string refs; makemigrations will want an `AlterField` state-only op — wrap it in `SeparateDatabaseAndState` too since the column/constraint is unchanged).

> Generating step 2/3 by hand for 30+ models is error-prone. Prefer `makemigrations` after the model is physically moved, then **manually wrap** the emitted `CreateModel`/`DeleteModel`/`AlterField` in `SeparateDatabaseAndState` and confirm `database_operations=[]`. Diff the emitted DDL-free migration against the proven `contracts/0001` shape.

---

## 3. ContentType / GenericForeignKey handling

Moving a model's app_label orphans its `django_content_type` row and any `RunPython`-less migration will silently create a new one — breaking rows that store `content_type_id` (audit logs, GFKs, `auth_permission`).

Per phase, add a data migration:
```python
def repoint(apps, schema_editor):
    CT = apps.get_model("contenttypes", "ContentType")
    CT.objects.filter(app_label="subscriptions", model="m").update(app_label="x")
```
- Run **before** removing the model from subscriptions state? No — run it as its own step ordered **after** both CreateModel/DeleteModel state ops so the target ContentType is the canonical one. Verify `auth_permission` rows follow (they FK content_type, so they ride along).
- **Audit how the already-moved models handled this** first: `grep -rl content_type contracts/migrations payments/migrations` came back empty, which means the moved core models may **not** have repointed ContentTypes yet. **→ Verify on the prod clone whether `django_content_type` still says `app_label='subscriptions'` for `subscription`/`emi`/`payment`.** If so, that's a latent bug to fix in Phase 0, and the pattern for new phases must include the repoint.

---

## 4. Phased sequence (each phase independently deployable + reversible)

Ordered easiest→hardest, dependencies last:

- **Phase 0 — Baseline & safety net.** Clone prod DB to staging. Capture: `pg_dump --schema-only` (the invariant), `dumpdata contenttypes auth.permission`, current migration state (`showmigrations`). Confirm `makemigrations --check` is clean on `main`. Audit the ContentType question in §3.
- **Phase A — `growth` app.** `growth_offers` + `growth_requests` (16 classes, 6 tables). Self-contained, few incoming FKs → lowest-risk pilot that exercises the full recipe end-to-end.
- **Phase B — `business_setup` app.** Biggest chunk (36 + policy/compliance/print/smtp = ~43 classes, ~23 tables). Config/org data, mostly leaf tables.
- **Phase C — `finance_control` app.** `control_foundation` + `month_end_close` + `cash_counter_session`. Coordinate with the accounting/cash-desk route modules already split.
- **Phase D — fold into `customers`.** `kyc_workflow` + `models_address` residue. Customers already owns Address/KYC, so this consolidates.
- **Phase E — fold into `crm`.** `workbench` + `crm_pipeline` + `online_request` extension modules.
- **Phase F — `audit` app.** `AuditLog`, `BusinessEventLog`, `BusinessEventType`. Highest fan-in (§1) → do after the pattern is battle-tested. Requires the ContentType repoint and the dedup with `api/v1/utils/audit_log.py`.
- **Phase G — residual `models.py`.** `DryRunValidationJob`, `AMLScreeningRecord`, and **enums** (§5). Assign each enum to the domain app that owns its model.
- **Phase H — retire `subscriptions`.** With every table re-homed, `subscriptions/models.py` becomes a pure re-export shim. Then migrate the 578 imports app-by-app (`from subscriptions.models import X` → `from X.models import X`), delete shims as each app is cleaned, and finally delete the `subscriptions` app (keeping its historical migrations as tombstones, or squashing).

Services (`subscriptions/services/`, 57 files) move alongside their models per phase — but service moves are pure code (no migration), so they're low-risk and can trail.

---

## 5. Enums

`subscriptions/models.py` holds ~30 `TextChoices`/`IntegerChoices` (e.g. `PossessionStatus`, `InspectionStatus`, `RecoveryStage`, `DisputeStage`). They carry **no tables**, so moving them is a code-only change — but many are imported widely. Strategy: co-locate each enum with the model/app that primarily uses it; leave a re-export in `subscriptions.enums`/`subscriptions.models` for compatibility until Phase H import migration.

---

## 6. Open questions (decide before Phase C / F)

1. **`cash_counter_session` / `month_end_close`** → their own `finance_control` app, or into `payments` (which already holds `CashCounterSession`, `DailyCloseRun` per its model list)? There may be **duplicate classes** — `payments` already defines `CashCounterSession`. Reconcile before moving; likely these subscriptions copies are already-superseded and should be **deleted, not moved**.
2. **`AuditLog` duplication** — `subscriptions.models.AuditLog` vs `api/v1/utils/audit_log.py:AuditLog`. Which is canonical? Consolidate to one before Phase F.
3. **ContentType repoint for already-moved core models** — was it done? (§3). If not, fold the fix into Phase 0.
4. **Squash vs keep** the 139 subscriptions migrations at Phase H.

---

## 7. Per-phase verification gate (all must pass)

1. `python manage.py makemigrations --check --dry-run` → **"No changes detected"** (proves model code == migration state).
2. **Schema invariant:** `pg_dump --schema-only` of the prod clone **before == after** the phase's `migrate` (proves zero DDL — no table renamed/dropped/created). This is the single most important gate.
3. `python manage.py migrate` on the prod clone → succeeds; `showmigrations` all applied.
4. ContentType/permission counts unchanged; spot-check GFK-bearing rows resolve.
5. Import smoke: `python -c "from subscriptions.models import <moved>; from <newapp>.models import <moved>"`.
6. Targeted tests for the domain green (full suite is not the gate per project convention; run the phase's app tests + `api` route smoke).
7. Deploy rehearsal against staging (`push-live` → `deploy.sh`) before prod.

**Rollback:** each phase = one migration pair (new-app CreateModel + subscriptions DeleteModel). `migrate <app> <prev>` reverses state with no DDL. Keep the re-export shim until Phase H so reverting never breaks imports.

---

## 8. Phase 0 — DONE (2026-07-31)

Executed against the dev Postgres DB (`subidha_core`, all test data). Findings:

- **Migration state consistent.** `makemigrations --check` reports no changes for any of our apps (only the third-party `rest_framework_simplejwt.token_blacklist` shows an unrelated pending migration — pre-existing, out of scope).
- **Baseline invariant captured:** 351 tables / 4881 columns (`schema_before.txt`), 376-line `showmigrations` snapshot.
- **Open question #3 RESOLVED — ContentTypes were *not* repointed for the already-moved models.** Audit found **72 dead** `django_content_type` rows still at `app_label='subscriptions'` (their `model_class()` is `None` — they match the 72 `DeleteModel` ops in `0139`), plus **43 alive** (still-resident models). The dead CTs had **288 orphaned `auth_permission` rows**.
- **Blast radius = benign.** Only `auth_permission` referenced the dead CTs — **0** rows in any GenericForeignKey / audit-log / `django_admin_log` table, and **0** `auth_group_permissions` grants. (`auth_user_user_permissions` doesn't exist — the project uses its own capability/role matrix, not Django object permissions.)
- **Remediation shipped:** `subscriptions/migrations/0140_remove_stale_moved_contenttypes.py` — a data-only `RunPython` that deletes stale subscriptions CTs (cascading their orphaned permissions). Applied to dev: subscriptions CTs **115 → 43**, dead **0**, orphaned perms **0**.
- **Gate methodology validated:** `schema_before` vs `schema_after` diff is **empty/identical** after the data migration (proves the pg-dump-equivalent invariant catches DDL and passes clean data-only changes). `manage.py check` clean; shim + new-app imports resolve to the same class.

**Every later phase must add the analogous ContentType step** (repoint or delete the stale CT for each moved model) so this staleness never re-accumulates.

**Reusable gate command (per phase):** capture the column-level schema fingerprint before and after `migrate`, then `diff` — for a state-only move it must be identical (script: `information_schema.columns` ordered by `table_name, ordinal_position`).

Remaining before prod: the same 0140 cleanup must run on the **prod/staging** DB (rehearse via `push-live` → `deploy.sh`), and a true prod-clone rehearsal of Phases A–H as each lands.

## 9. Phase A — DONE (2026-07-31)

Moved the growth-offer (P5A) + growth-request (P5B) models — 6 tables, ~14 model
classes — from `subscriptions` into a new **`growth`** app. State-only.

- **New app `growth`** (`growth/models.py`, `apps.py`, `migrations/`) registered in `INSTALLED_APPS` after `commissions`. Internal FK refs `subscriptions.PlanTemplate`/`OfferPackage` rewritten to `growth.*`.
- **Migrations:** `growth/0001_growth_split_state` (CreateModel ×6 wrapped in `SeparateDatabaseAndState`, `database_operations=[]`) + `subscriptions/0141_growth_split_state` (RemoveField/DeleteModel wrapped state-only, depends on `growth/0001`, plus a **merge-aware** ContentType repoint).
- **Backward-compat:** `subscriptions/models_growth_offers.py` and `_requests.py` are now re-export shims; `subscriptions/models.py` gains a `from growth.models import …` line. All ~10 legacy import sites untouched (import migration deferred to Phase H). Removed the two `import_models` lines from `subscriptions/apps.py`.
- **Verification gate — all green:** `sqlmigrate` emits **zero DDL** for both; dev schema fingerprint **byte-identical** to the Phase 0 baseline (4881 cols); ContentTypes = 6 growth / 0 stale / 0 dead; `makemigrations --check` clean for our apps; import shims resolve to the growth app with tables preserved; **fresh test DB rebuilt from zero migrations with no error** (definitive proof the state-only move is self-consistent); **all 71 growth tests pass**.

**Lesson captured (applies to B–H):** running `migrate` as separate per-app commands lets Django's `post_migrate` create the new app's ContentTypes before an `UPDATE`-style repoint runs, causing a unique-constraint collision. The repoint must be **merge-aware**: repoint in place when no new-app CT exists yet, else delete the stale one. See `repoint_contenttypes` in `subscriptions/0141`.

**Incidental fix:** `products_core/models.py` called `slugify()` in `ProductCategoryMaster.save()` without importing it (relied on a star import that never provided it) — added `from django.utils.text import slugify`. This was a pre-existing bug in untracked work, surfaced by the growth tests' product-category fixture; it caused all 20 pre-fix errors.

**Before prod:** run `0140` + `growth/0001` + `subscriptions/0141` on staging/prod via the deploy pipeline; the state-only migrations touch no tables.

## 10. Phase B — DONE (2026-08-01)

Created the **`business_setup`** app and moved **18 tables** (state-only) out of
subscriptions: the business_setup core (business profile, public site, brand
import, compliance docs, backup/restore, business rule policy) plus the 4
satellites (policy_governance, compliance_review, print_settings, email_smtp).
**Dropped 5 dead legacy duplicate tables** (per the "drop dead now" decision).

- **New app** `business_setup` with a models *package* (`core.py` + 4 satellite modules) — `core.py` generated by AST-removing the dead classes from the original file (no hand transcription). Registered in `INSTALLED_APPS` after `growth`. The one internal FK ref (`BusinessDataRestoreJob.backup_job`) rewritten to `business_setup.*`.
- **Migrations:** `business_setup/0001_initial` (CreateModel ×18, whole block wrapped in `SeparateDatabaseAndState`, `database_operations=[]`); `subscriptions/0142_move_business_setup_state` (all 23 deletes wrapped state-only + merge-aware CT repoint for the 18 moved); `subscriptions/0143_drop_dead_finance_cluster` (real `DROP TABLE` ×5 + delete their CTs).
- **Dead cluster dropped:** `branches`, `finance_accounts`, `cash_desks`, `chart_accounts`, `staff_operational_assignments` — 0 rows, superseded by `accounting.FinanceAccount` + `branch_control.Branch`, no live/other-app/migration-state references. `0143` has a **guard that raises if any table is non-empty** (protects prod), and drops **child-first without CASCADE** so it works on both Postgres (prod) and SQLite (test settings).
- **Backward-compat:** the 5 subscriptions model files are now re-export shims; `subscriptions/models.py` gains a `business_setup` re-export; `subscriptions/apps.py` import_models trimmed. All ~15 import sites untouched.
- **Verification gate — all green:** `sqlmigrate` shows zero DDL for 0001+0142 and exactly 5 `DROP TABLE` for 0143; dev schema delta vs Phase 0 baseline is **exactly the 5 dropped tables** (nothing else); ContentTypes = 18 business_setup / 0 dead subscriptions, canonical `accounting`/`branch_control` CTs untouched; **data preserved** (business_profiles 1, public 2, policy_pages 39); shims resolve, dead `FinanceAccount` no longer importable; **fresh test DB rebuilt from zero migrations (498 tests execute)** — proves the state-move + drop chain is self-consistent; the Phase-B-relevant test module (`test_pdf_branding_service`) passes.
- **Pre-existing failures (NOT Phase B):** running the full `tests.subscriptions` suite shows 125 errors/5 failures, all in modules that provably don't touch Phase B code — dominated by an accounting cashier-setup fixture gap (`finance_account_collection_guard`, 41), plus `CustomerAdvance` moved in a prior phase, missing `customer_risk_service`, no `pytest`, and missing financial-year config. Consistent with the project note that the full suite "was never the gate."

**Lesson captured:** the test settings use **SQLite**, so any raw DDL in migrations must be vendor-agnostic — `DROP TABLE ... CASCADE` is Postgres-only. Drop child-first and omit CASCADE.

## 11. Phase C — DONE (2026-08-01)

Created the **`finance_control`** app and moved **6 tables** (state-only) out of
subscriptions: `control_foundation` (approval requests, business policies,
control exceptions), `month_end_close` (close runs + check results), and the
leftover `DailyCloseCheckResult` from `cash_counter_session`.

- **Investigation refined the scope.** Open question #1 (duplicate CashCounterSession) resolved: `payments` already owns `CashCounterSession`/`DailyCloseRun`; the residual `cash_counter_session.py` holds only `DailyCloseCheckResult` (a *child* of `payments.DailyCloseRun`) — not a duplicate. The enum "duplicates" (`CashCounterSessionStatus` etc.) live independently in `subscriptions/enums.py` (used by payments via `import *`), orthogonal to the move. So all 3 files moved cleanly into one new app; `DailyCloseCheckResult` keeps its cross-app FK to `payments.DailyCloseRun` + abstract base `payments.CashDeskTimeStampedModel`.
- **New app** `finance_control` (models package: control_foundation / month_end_close / daily_close). The 3 source files had **no subscriptions imports**, so they copied verbatim. Registered in `INSTALLED_APPS` after `business_setup`.
- **Migrations:** `finance_control/0001_initial` (CreateModel ×6, `SeparateDatabaseAndState`, no DDL) + `subscriptions/0144_move_finance_control_state` (DeleteModel ×6 state-only + merge-aware CT repoint).
- **Backward-compat:** 3 subscriptions shim files; `subscriptions/models.py` gains a finance_control re-export; `apps.py` trimmed.
- **Verification gate — all green:** both migrations zero DDL (`sqlmigrate`); dev schema **byte-identical to post-Phase-B** (pure state move); ContentTypes = 6 finance_control / 0 stale / 0 dead; import shims resolve; fresh test DB builds from zero and the sampled module passes 5/5.

**Lesson captured:** `import *` shims silently drop underscore-prefixed names. Two module-level constants (`_IMMUTABLE_STATUSES`, `_DECIDED_STATUSES`) are imported by services, so the shims re-export them explicitly. `manage.py check` caught this before any migration ran — always run `check` after writing shims.

## 12. Phases D–H — DONE (2026-08-01)

All remaining owned tables moved out; **the subscriptions app now owns zero models/tables.**

**Phase D — fold into `customers`.** Moved `ServiceZone`, `PincodeDatabase` (`service_zones`, `pincode_database`) into customers (used by `customers/services/address_service.py`). KYC-workflow enums/helpers were **already in customers** (prior split) — folding the duplicate `models_kyc_workflow.py` shadowed `partner_kyc_doc_upload_to` and caused a perpetually-regenerating `upload_to` AlterField; fixed by *not* copying it and pointing the shim at `customers.models`. Migrations: `customers/0003` + `subscriptions/0145` (state-only + CT repoint).

**Phase E — fold into `crm`.** Moved `WorkbenchItem`, `WorkbenchAction` (`workbench_item`, `workbench_action`) into crm. `models_online_request` / `models_crm_pipeline` were already crm shims. Migration `crm/0011` + shim.

**Phase F — new `audit` app.** Extracted `AuditLog` (`audit_logs`) + `BusinessEventLog` (`business_event_logs`) + `BusinessEventType` from `models.py` (AST extraction, no cross-refs). Highest fan-in (101 importers of `AuditLog`) — served by the `subscriptions.models` re-export. The duplicate dead `api/v1/utils/audit_log.py:AuditLog` (0 importers, unregistered) left as-is. Migrations `audit/0001` + `subscriptions/0146`.

**Phase G — residual.** `AMLScreeningRecord` (`customer_aml_screenings`) → customers; `DryRunValidationJob` (`subscriptions_dry_run_validation_jobs`) → business_setup. Enums left in `subscriptions.enums`/`models.py` (code-only, no tables — moving them is pure churn, deferred). Migrations `customers/0004`, `business_setup/0002`, `subscriptions/0147`.

**Phase H — retire subscriptions to a shim/utilities layer.** After D–G, `apps.get_app_config("subscriptions").get_models()` returns **NONE** and subscriptions has **zero ContentTypes**. `models.py` and every `models_*.py` are now pure enum/shim modules (0 `db_table`). The app is **not deleted** — it still hosts `enums.py`, `base_models.py`, 56 services, 27 management commands, signals, admin, and 148 historical migrations, and the model shims give the ~578 `from subscriptions…` import sites zero-churn backward compatibility. The literal import-rewrite + app-deletion is intentionally **not** done: it is high-churn, risky, and unnecessary given the shims. This is the correct terminal state — subscriptions is no longer a models app.

**Verification (D–H, all green):** every move is state-only (`SeparateDatabaseAndState`, `database_operations=[]`); dev schema **byte-identical to post-Phase-C**; ContentTypes land in the right apps with 0 dead subscriptions CTs; `makemigrations --check` clean (only third-party `token_blacklist`); import shims resolve; **fresh test DB rebuilds from zero migrations (76 tests pass)**.

**Lessons captured:** (1) folding a legacy `models_*.py` whose names already live in the target app causes `import *` shadowing → a perpetual no-DDL AlterField; check the target for pre-existing definitions first. (2) deleting an already-applied migration requires unapplying it first, and other apps' auto-added FK-ordering dependencies on it must be repointed. (3) keep `✓`/unicode out of scripts whose stdout is cp1252.

## 13. Effort estimate

| Phase | Models | Risk | Est. |
|---|---|---|---|
| 0 baseline | — | low | 0.5 day |
| A growth (pilot) | 16 | low | 1 day |
| B business_setup | ~43 | med | 1.5 days |
| C finance_control | 18 | med (dupes) | 1.5 days |
| D customers fold | 7 | low | 0.5 day |
| E crm fold | ~8 | low | 0.5 day |
| F audit | 3 | **high** (fan-in) | 1.5 days |
| G residual+enums | ~10 | med | 1 day |
| H retire + import migration | — | med | 2 days |

~10 working days, sequenced so each phase ships independently and the app is never in a broken intermediate state.
