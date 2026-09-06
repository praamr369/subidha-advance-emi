# API gap triage — the remaining 48

Measured 2026-09-06 by `manage.py check_frontend_api_urls`.
Ratcheted in `backend/api_url_baseline.txt`; enforced in CI.

**Trajectory:** 89 → 86 → 66 → 59 → **48**.

Two things closed the last 18, and only one of them was building:

| Step | Closed | What it was |
|---|---|---|
| 7 repoints | 66 → 59 | The path already existed verbatim under `/admin/` |
| Checker fix | 59 → 48 | **11 were never gaps.** A trailing `${qs}` / `${suffix}` holds a query string, not a path segment |

That second row is the important one. Roughly a fifth of what this programme
was chasing did not exist as a problem. Before building anything from the list
below, assume the same could be true of it.

---

## How to read a verdict

- **REPOINT** — a working endpoint exists; edit the frontend.
- **BUILD** — models exist, no HTTP layer.
- **DECIDE** — blocked on a policy call, not code. See `project_blocked_product_decisions` in memory.
- **DELETE** — no model, no caller worth keeping.
- **VERIFY** — evidence is suggestive, not conclusive. Confirm before acting.

Confidence is stated because the last three passes each found that a
confident-looking group dissolved on inspection.

---

## DECIDE — 10 endpoints, blocked on Pradip

Nothing technical blocks these. Each pays money to a customer or creates legal
evidence, which is why none should be built on a guessed policy.

| Endpoint | Blocker |
|---|---|
| `refunds/assess-damage/` (+`{}/`) | Damage bands: what deduction at what condition grade |
| `refunds/inspect/{}/`, `refunds/inspection-jobs/` | Same decision |
| `refunds/{}/advance/` | Same decision |
| `admin/lucky-plan/waiver-settlements/{}/approve/` | `EmiWaiverSettlement` has no approval state — a row *is* the settlement |
| `privacy/retention-policies/` (+`{}/purge/`) | Needs a `RetentionPurgeJob` model; `purge` **permanently deletes customer data** |
| `admin/privacy/retention-schedule/` (+`{}/{}/`) | Same subsystem as above |
| `lucky-plan/draw-results/`, `draw-audit/`, `public/lucky-plan/verify-seed/` | Which verification path is canonical — the plan's legal defensibility rests on it |

## REPOINT — likely, needs confirmation

| Frontend calls | Existing route | Confidence |
|---|---|---|
| `customers/kyc-upload/` | `POST customer/kyc-documents/` | **CONFIRMED REPOINT.** Verified 2026-09-06: `CustomerKycDocumentView` is `IsCustomer` with `MultiPartParser`, matching the page's `FormData` POST exactly. Frontend edit only |
| `customers/kyc-status/` | `GET customer/kyc-documents/` | **NOT a clean repoint.** The route exists and is the right portal, but the shapes disagree: it returns `{count, kyc_status, results}` while the page expects `{status, submitted_at, verified_at, rejection_reason, documents}`. Two of those fields are not returned at all. Needs a small backend addition or a frontend mapper — decide which, do not just repoint |
| `accounting/expense-claims/{}/` | `admin/hr/expense-claims/{}/` | **CONFIRMED REPOINT.** Part of the HR consolidation below; the target exists with detail, `approve/` and `post/` actions |
| `accounting/salary-sheets/{}/` | `admin/hr/payroll/{}/` | **CONFIRMED REPOINT** — see the HR consolidation note below |
| `subscriptions/deposits/` | `admin/finance/deposits/` | **VERIFY** — customer-facing vs admin; auth differs |
| `payments/receipt/{}/download/` | `admin/receipts/{}/pdf/`, `customer/receipts/{}/pdf/` | **NOT a clean repoint.** Verified: both routes take a *receipt* pk, the caller passes a *payment* id. Same-looking path, different identifier — repointing would 404 on valid data or, worse, return someone else's receipt. Needs a payment→receipt lookup |
| `customer/returns/` | `admin/billing/returns/` | **VERIFY** — same caveat |
| `crm-pipeline/requests/online/{}/accept-quote/` | `admin/customer/requests/online/{}/accept-quote/` | High |

**The recurring trap in this table:** a customer-portal page calling an
`/admin/` endpoint will 403, not 404. Repointing a customer surface at an admin
route trades a visible failure for an invisible one. Check the caller's portal
before every one of these.

## FIXED IMMEDIATELY — the public lead form was posting to a 404

Found while triaging, fixed on the spot, because it is losing live business.

The lead-capture form on the public website (`(website)/forms/public-lead-form`)
POSTed to `/api/v1/crm-pipeline/leads/public/`, which has never existed. The
real endpoint, `/api/v1/public/leads/`, has been there all along — throttled,
public, and accepting **exactly** the seven fields the form sends
(`name, phone, email, city, interested_product, preferred_emi_amount, notes`),
with an identical `^\d{10}$` phone rule.

Confirmed against production before changing anything:

| Path | Live response |
|---|---|
| `/api/v1/public/leads/` | **405** (exists, POST-only) |
| `/api/v1/crm-pipeline/leads/public/` | **404** |

Two call sites were repointed: the form itself and `createPublicLead` in
`services/crm-pipeline.ts`. `apiFetch` JSON-encodes plain objects, so the
payload never needed changing — only the URL.

**This is the counter-argument to treating the whole gap as low priority.**
Most of the 48 are internal screens with workarounds. This one was the top of
the sales funnel on the public site, and every submission through it was
discarded. Triage by consequence, not by count.

The other six `leads/public/*` endpoints are the admin-side management surface
(list, detail, bulk-assign, bulk-convert, conversion-history,
convert-to-online-request). Those are genuinely unbuilt — `PublicLead` exists as
a model and `admin/crm/internal/public-leads/{}/promote/` is the only admin
route serving it.

## The HR consolidation — a moved surface, half-migrated, failing silently

The strongest finding of this triage, and it is not a missing feature. HR moved
from `/accounting/*` to `/admin/hr/*`, and **the codebase documents its own
breakage**. From `services/accounting.ts`:

> Salary sheets moved from `/accounting/salary-sheets/` to `/admin/hr/payroll/`
> (HR consolidation).

One call site was migrated (`listSalarySheetsSafe`). The others were not:
`listSalarySheets`, `createSalarySheet`, the salary-sheet detail call, and the
whole `accounting/employees/` CRUD still point at the old paths.

Verified against the URLconf:

| Old path | Status |
|---|---|
| `accounting/salary-sheets/` (list, create, detail) | **gone** — only the orphaned `{}/statutory-deductions/` sub-route survives, under a parent that no longer exists |
| `accounting/employees/` (list, create, detail) | **gone** — only `accounting/imports/employees/{preview,post}/` remain |
| `accounting/expense-claims/{}/` | **gone** — now `admin/hr/expense-claims/{}/` |

New homes exist and are complete: `admin/hr/payroll/` with `{}/approve/` and
`{}/post/`, plus `payroll-periods/` and `payroll-payments/`.

**Why nobody reported it.** The one migrated call site is wrapped so it
"always resolves (never throws) so a single widget can't break the dashboard":

```ts
} catch {
    return empty;      // count: 0, results: []
}
```

A dead endpoint therefore renders as an empty widget, not an error. This is the
concrete counter-example to reading silence as evidence of disuse — the failure
was engineered to be invisible. **Check that catch after repointing**; it will
keep hiding the next breakage too.

**Verdict:** REPOINT with shape adaptation — `admin/hr/payroll/` returns
`{salary_sheets: [...]}` unpaginated, not the paginated shape the old callers
expect. `listSalarySheetsSafe` already contains the adapter to copy.

## BUILD — models exist, no HTTP layer

| Cluster | Endpoints | Notes |
|---|---|---|
| CRM pipeline public leads | 7 | `leads/public/` list, detail, bulk-assign, bulk-convert, conversion-history, convert-to-online-request. Largest single cluster |
| Partner portal | 4 | `partner/`, `profile-info/`, `support/tickets/`, `product-requests/{}/cancel/` — note `partner/collection-requests/` and `partner/catalog/` already exist, so this is a partial surface |
| Admin collections | 3 | `due-today/`, `overdue/`, `recent/` |
| Dashboard | 2 | `memos/`, `calendar-events` |
| Misc | 4 | `business/msme/`, `deliveries/handover-receipts/`, `customers/document-consents/`, `admin/commissions/summary/{}/` |

## INVESTIGATE — not yet classifiable

| Endpoint | Why |
|---|---|
| `admin/{}/{}/` from `services/admin.ts` | A fully dynamic path built from two variables. The checker cannot resolve it and neither can static reading — read the call site and decide whether it is even one endpoint |
| `subscriptions/{}/balance/`, `subscriptions/{}/emis/` | **Corrected 2026-09-06: no admin equivalent exists** — I assumed one did. Neither `admin/subscriptions/{}/emis/` nor any `/balance/` route is registered. So BUILD or DELETE, not REPOINT. Note `listSubscriptionEmisForCollection` sits in the *admin* section of `services/payments.ts`, beside a neighbour that correctly uses `/admin/subscriptions/{}/` — so the intended surface is admin |
| `accounting/employees/{}/` | **Resolved: part of the HR consolidation above.** The old CRUD is gone; find its new home under `admin/hr/` before building anything |

---

## Order to work in

1. **Decisions first.** They are free to make and unblock 10.
2. **Confirm the REPOINT table**, one at a time, checking the caller's portal.
   Cheapest remaining work.
3. **Ask before building each cluster.** Every one has been 404ing for two
   months without a report. That is evidence of a workaround, not of demand —
   staff work from WhatsApp and a notebook rather than filing a bug. It argues
   for asking, not for assuming either way.
4. **Delete is a valid outcome** and closes the count exactly as building does.

## Do not trust the number blindly

The checker has now been wrong five times: it ignored four fifths of the
frontend, mangled every DRF-router route, invented endpoints from prose, and —
while being fixed — truncated every parameterised route, cutting the backend
count by a thousand before anyone noticed. Each bug moved the headline number
for a reason nobody had checked.

`tests/system_jobs/test_frontend_api_url_normalisation.py` now pins every one
of those failures. Add a case there before trusting any new count.
