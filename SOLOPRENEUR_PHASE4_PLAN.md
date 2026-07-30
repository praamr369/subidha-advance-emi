# Solopreneur Master Upgrade — Phase 4 Implementation Plan
## Inventory & Logistics Cockpit

> **For: Antigravity implementation session**
> **Prepared: 2026-07-21 · Repo: subidha-advance-emi (branch `update`)**
> **Supersedes the earlier Phase 4 draft — same goal, corrected against the real codebase.**

## Verdict on the draft plan

The shape (3-section cockpit, 30s cache, read-only-first framing) is right. But the draft invents a data model that doesn't exist in this repo and would have caused Antigravity to build parallel/duplicate logic instead of reusing what's already there. Three corrections before any code is written:

1. **`reorder_level` already exists and is already computed correctly.** `inventory/services/stock_service.py:861` `build_stock_summary()` returns `reorder_level_qty`, `on_hand_qty`, `available_qty`, and a pre-computed `is_below_reorder` boolean per item, using the same bulk-query pattern that fixed the 1799→8 query stock-summary issue. **Do not write a new low-stock query** — call this function and filter `is_below_reorder == True`. (Note: `products_pim/models.py` also has an unrelated `reorder_level`/`is_low_stock` pair on a different model — that is a separate, likely legacy, concept. The inventory app's `InventoryItem.reorder_level_qty` is the canonical one; ignore products_pim's for this cockpit.)

2. **Deliveries are not one homogeneous list — the backend already models them as two types with two different mutation surfaces**, and a merged endpoint already exists: `AdminDeliveryListCreateView` (`api/v1/views/admin_deliveries.py:130`, routed at `GET /admin/deliveries/`) already unions `SubscriptionDelivery` rows and `DirectSale` delivery cases (backed by `ServiceDeskCase` with `case_type=DIRECT_SALE_DELIVERY`), interleaved by `created_at`, with a combined summary. **Do not build a second aggregator** — call the same underlying querysets this view uses: `get_delivery_queryset()` (subscriptions) and `direct_sale_delivery_cases_queryset()` (direct sales), both importable from `subscriptions.services.delivery_service` / `billing.services.direct_sale_delivery_queue`.
   - Consequence for the UI: a single generic "Mark Delivered" button is wrong. Subscription deliveries have a real one-call completion endpoint (`POST /admin/deliveries/<pk>/mark-delivered/`). Direct-sale delivery cases do **not** — they go through a multi-step case flow (`schedule/`, `dispatch/`, case detail) with no single "mark delivered" action. The cockpit must branch by `type`.
   - The existing filter helper `_apply_delivery_filters` filters on `created_at__date`, not `scheduled_date`. That is the wrong semantic for "ship today" — a delivery scheduled for today was likely created days ago. The cockpit's "Ship Today" query must filter on `scheduled_date == today` (plus anything overdue and not yet dispatched), not reuse that helper as-is.

3. **There is no `return_id: "RTN-456"` format anywhere in the codebase.** Returns/exchanges are `ServiceDeskCase` rows (`service_desk/models.py:105`) identified by `case_no` (auto-generated, format `generate_service_case_no()`), with real status enums: `ServiceDeskCaseStatus` (DRAFT/OPEN/UNDER_REVIEW/AUTHORIZED/IN_SERVICE/RESOLVED/CLOSED/REJECTED/CANCELLED) and separately `ServiceDeskStockStatus` (NOT_REQUIRED/PENDING/SETTLED) and `ServiceDeskFinanceStatus` (NOT_REQUIRED/PENDING/POSTED). "Returns in flight" = `ServiceDeskCase.objects.filter(case_type__in=[SALES_RETURN, DELIVERY_RETURN, EXCHANGE], stock_status=PENDING)`. This is the exact same model the Return Register page (`/admin/service-desk/returns`) and the Reversal Workbench (`/admin/billing/reversal-workbench`, shipped this branch) already query — reuse, don't reinvent.

## Answers to the two review questions

**Q1 — Should "Mark Delivered" mutate now, or stay read-only?**
Neither extreme is right, and the codebase already tells you why: wire it for what already has one safe, tested, one-call endpoint — **subscription deliveries** (`mark_subscription_delivery_delivered` via the existing view) — with an inline confirm, no new backend code. For **direct-sale delivery cases**, there is no equivalent single-call action; deep-link to the case detail page (`/admin/deliveries?case=<id>` or the case detail route) instead of faking a mutation. This matches the solopreneur "minimum clicks where it's safe, no shortcuts where it isn't" principle, and it costs zero new backend risk since it calls an endpoint that already exists and is already used elsewhere.

**Q2 — Is a 30s cache acceptable?**
Yes, with one addition: after the operator uses the inline "Mark Delivered" action from the cockpit itself, don't wait out the cache — either (a) invalidate the `solopreneur:logistics:cockpit` cache key synchronously in the mark-delivered response path, or (b) simpler and sufficient here: have the frontend optimistically remove that row from the local list state on success and just let the cache naturally refresh the counts on next 30s cycle. Recommend (b) — it's a frontend-only change, no cache-invalidation coupling between two unrelated views.

---

## Backend

### [NEW] `backend/api/v1/views/admin_logistics_cockpit.py`
```
GET /api/v1/admin/logistics/cockpit/
```
Cache key `solopreneur:logistics:cockpit`, TTL 30s (`django.core.cache`, same pattern as the navigation-badges fix). Admin-only (`IsAdmin`). Read-only, zero writes.

```python
from datetime import timedelta
from django.core.cache import cache
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from inventory.services.stock_service import build_stock_summary
from subscriptions.services.delivery_service import get_delivery_queryset
from billing.services.direct_sale_delivery_queue import direct_sale_delivery_cases_queryset
from subscriptions.models import DeliveryStatus
from service_desk.models import ServiceDeskCase, ServiceDeskCaseStatus, ServiceDeskCaseType, ServiceDeskStockStatus

CACHE_KEY = "solopreneur:logistics:cockpit"
CACHE_TTL_SECONDS = 30


class AdminLogisticsCockpitView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        cached = cache.get(CACHE_KEY)
        if cached is not None:
            return Response(cached)

        today = timezone.localdate()

        # Ship today: subscription deliveries scheduled today or overdue-and-not-dispatched
        sub_qs = (
            get_delivery_queryset()
            .filter(
                status__in=[DeliveryStatus.PENDING, DeliveryStatus.SCHEDULED, DeliveryStatus.DISPATCHED, DeliveryStatus.OUT_FOR_DELIVERY],
            )
            .filter(models.Q(scheduled_date__lte=today) | models.Q(scheduled_date__isnull=True))
            .order_by("scheduled_date", "id")[:100]
        )
        sub_rows = [
            {
                "id": d.id,
                "type": "SUBSCRIPTION",
                "customer_name": d.subscription.customer.name,
                "customer_phone": d.subscription.customer.phone,
                "address": d.delivery_address_snapshot or "",
                "product_name": d.subscription.product.name,
                "subscription_number": d.subscription.subscription_number,
                "status": d.status,
                "scheduled_date": d.scheduled_date.isoformat() if d.scheduled_date else None,
                "is_overdue": bool(d.scheduled_date and d.scheduled_date < today),
            }
            for d in sub_qs
        ]

        # Ship today: direct-sale delivery cases not yet delivered
        ds_qs = direct_sale_delivery_cases_queryset(active_only=True)[:100]
        ds_rows = [
            {
                "id": c.id,
                "type": "DIRECT_SALE",
                "case_no": c.case_no,
                "customer_name": c.reporter_name_snapshot or (c.direct_sale.customer_name if c.direct_sale_id else ""),
                "status": c.status,
            }
            for c in ds_qs
        ]

        # Stock alerts — reuse build_stock_summary, filter is_below_reorder
        stock_summary = build_stock_summary()
        stock_alerts = [row for row in stock_summary["results"] if row["is_below_reorder"]][:50]

        # Returns in flight — ServiceDeskCase, stock not yet settled
        returns_qs = (
            ServiceDeskCase.objects.filter(
                case_type__in=[ServiceDeskCaseType.SALES_RETURN, ServiceDeskCaseType.DELIVERY_RETURN, ServiceDeskCaseType.EXCHANGE],
                stock_status=ServiceDeskStockStatus.PENDING,
            )
            .exclude(status__in=[ServiceDeskCaseStatus.CLOSED, ServiceDeskCaseStatus.CANCELLED, ServiceDeskCaseStatus.REJECTED])
            .select_related("customer")
            .order_by("-created_at")[:50]
        )
        returns_rows = [
            {
                "id": r.id,
                "case_no": r.case_no,
                "case_type": r.case_type,
                "customer_name": r.reporter_name_snapshot or (r.customer.name if r.customer_id else ""),
                "status": r.status,
                "stock_status": r.stock_status,
                "finance_status": r.finance_status,
            }
            for r in returns_qs
        ]

        payload = {
            "generated_at": timezone.now().isoformat(),
            "deliveries_today": sub_rows + ds_rows,
            "deliveries_today_count": len(sub_rows) + len(ds_rows),
            "stock_alerts": stock_alerts,
            "stock_alerts_count": len(stock_alerts),
            "returns_in_flight": returns_rows,
            "returns_in_flight_count": len(returns_rows),
        }
        cache.set(CACHE_KEY, payload, CACHE_TTL_SECONDS)
        return Response(payload)
```

Verify the exact keyword args and import paths for `get_delivery_queryset` / `direct_sale_delivery_cases_queryset` against their current signatures in `subscriptions/services/delivery_service.py` and `billing/services/direct_sale_delivery_queue.py` before wiring — the sketch above assumes today's shape but names may drift.

### [NEW] `backend/api/v1/routes/admin_logistics.py` + [MODIFY] `backend/api/v1/urls.py`
Same registration pattern as the other solopreneur route modules:
```python
path("admin/", include("api.v1.routes.admin_logistics")),
```

### Tests — `backend/tests/api/test_logistics_cockpit.py`
- 200 shape check; admin-only (403 for non-admin).
- Cache hit on second call within 30s (`assertNumQueries` low on the second call).
- `stock_alerts` only contains items where `on_hand_qty <= reorder_level_qty` (cross-check against `build_stock_summary` directly for a seeded low-stock item).
- `deliveries_today` includes an overdue (`scheduled_date` < today, still PENDING) subscription delivery and excludes a delivered one.
- `returns_in_flight` excludes CLOSED/CANCELLED/REJECTED cases even if `stock_status=PENDING` (data can be inconsistent; the query must still exclude terminal cases).

---

## Frontend

### [NEW] `frontend/src/services/logistics.ts`
```ts
import { apiFetch } from "@/lib/api";

export type LogisticsCockpit = {
  generated_at: string;
  deliveries_today: Array<{
    id: number;
    type: "SUBSCRIPTION" | "DIRECT_SALE";
    customer_name: string;
    customer_phone?: string;
    address?: string;
    product_name?: string;
    subscription_number?: string;
    case_no?: string;
    status: string;
    scheduled_date?: string | null;
    is_overdue?: boolean;
  }>;
  deliveries_today_count: number;
  stock_alerts: Array<{
    item_id: number;
    product_id: number;
    product_name: string;
    sku?: string;
    on_hand_qty: string;
    available_qty: string;
    reorder_level_qty: string;
    is_below_reorder: boolean;
    default_stock_location_name?: string | null;
  }>;
  stock_alerts_count: number;
  returns_in_flight: Array<{
    id: number;
    case_no: string;
    case_type: string;
    customer_name: string;
    status: string;
    stock_status: string;
    finance_status: string;
  }>;
  returns_in_flight_count: number;
};

export function fetchLogisticsCockpit(): Promise<LogisticsCockpit> {
  return apiFetch<LogisticsCockpit>("/admin/logistics/cockpit/");
}
```
(`apiFetch<T>` returns parsed JSON directly — do not check `.ok` / call `.json()`, see the standing house rule.)

### [NEW] `frontend/src/app/(dashboard)/admin/logistics/page.tsx`
`ERPPageShell` — eyebrow "Operations", title "Logistics Cockpit", stats row: Ship Today (count) / Stock Alerts (count, warning tone if >0) / Returns Pending (count). Three stacked `Section`s (reuse the `Section` pattern from the reversal workbench page for consistency):

1. **Ship Today** — table rows with `type` badge (SUBSCRIPTION sky / DIRECT_SALE violet), customer, product/case, scheduled date (red text if `is_overdue`), status chip.
   - Subscription rows: inline "Mark Delivered" button → confirm inline (not `window.confirm`) → `POST /admin/deliveries/<id>/mark-delivered/` (reuse existing service function if one already exists in `frontend/src/services/deliveries.ts`, else add `markAdminDeliveryDelivered(id)` there — not in the new logistics service, since it's a deliveries-domain mutation) → on success, remove the row from local state (Q2 answer) and decrement the stat chip locally.
   - Direct-sale rows: no inline mutate button — link "Open Case" → `/admin/deliveries?case=<id>` (or wherever the direct-sale case detail already lives; confirm the exact route in `admin-route-registry.ts` / `ROUTES.admin` before wiring, don't invent one).
2. **Stock Alerts** — rows: product name, SKU, on-hand / reorder level, location. Deep-link to the inventory item (`/admin/inventory/items?item=<item_id>` or existing item detail route — confirm exact path) and a secondary "Create Purchase Requirement" link if that flow exists under `/admin/purchases` (check before adding; if it doesn't exist as a direct-link target, omit rather than invent).
3. **Returns in Flight** — rows: case_no, case_type badge, customer, stock/finance status chips, deep-link to `/admin/service-desk/returns` filtered or to the case detail (reuse whatever the Return Register page already links to for a row — do not build a new case-detail route).

Empty states for all three sections must read as good news ("Nothing to ship right now", "All stock healthy", "No returns pending") — same principle as Phase 1's action queue.

### Wiring
- `ROUTES.admin.logisticsCockpit = "/admin/logistics"` in `lib/routes.ts`.
- Register in `admin-route-registry.ts` under Inventory & Logistics.
- `admin-module-data.ts` — point the `inventory` module's primary workflow entry at `ROUTES.admin.logisticsCockpit` (don't just add a second entry next to whatever's there now if the intent is for this to become the module's front door — confirm with existing entries first, since duplicate near-identical nav entries are the recurring defect flagged in Phase 2's gap audit).
- If Phase 1 (`/admin/today`) exists by the time this ships, its action queue should link low-stock and returns-pending counts here (single shared query — don't fork the stock-alert logic a third time).

---

## Verification

**Automated:** `npx tsc --noEmit` clean; `manage.py check` clean; new pytest file green; confirm no duplicate low-stock query was added anywhere (grep for a second `is_below_reorder`-equivalent computation — there should be exactly one, in `build_stock_summary`).

**Manual:** Load `/admin/logistics` → confirm counts match `/admin/deliveries`, `/admin/inventory` stock summary, and `/admin/service-desk/returns` independently for the same data. Mark one subscription delivery delivered from the cockpit → row disappears immediately, and reappears correctly filtered out on next full reload. Confirm a direct-sale row's "Open Case" link lands on a real, working page — not a 404.

## Acceptance
- [ ] Zero new low-stock or delivery-aggregation query logic — cockpit calls `build_stock_summary`, `get_delivery_queryset`, `direct_sale_delivery_cases_queryset`, and `ServiceDeskCase` filters only.
- [ ] "Ship Today" filters on `scheduled_date`, not `created_at`.
- [ ] Mark Delivered wired for subscriptions only, via the existing endpoint; direct-sale cases deep-link instead of faking a mutation.
- [ ] All three sections' empty states read as good news.
- [ ] Every deep-link target verified to exist before wiring (no invented routes).
