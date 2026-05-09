"""
Read-only reporting payloads for the admin Reports Center.

All querysets are read-only. No writes, no reconciliation mutations.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from accounting.services.control_validation_service import validate_financial_period_balance
from billing.models import DirectSale, DirectSaleStatus
from crm.models import Lead, LeadStage
from inventory.models import StockLedger
from inventory.services.demand_service import get_purchase_suggestions
from subscriptions.models import (
    AuditLog,
    Batch,
    Emi,
    EmiStatus,
    Payment,
    PlanType,
    Subscription,
    SubscriptionDelivery,
)
from subscriptions.services.phase5_control_center_service import (
    _apply_common_emi_filters,
    _apply_common_payment_filters,
    build_accounting_waiver_loss,
)
from subscriptions.services.phase5_filter_service import AdminReportFilter
from subscriptions.services.rent_lease_billing_service import list_admin_deposit_register


def _money(v) -> str:
    if v is None:
        return "0.00"
    return f"{Decimal(str(v)).quantize(Decimal('0.01')):.2f}"


def _effective_window(flt: AdminReportFilter) -> tuple:
    end = flt.date_to or timezone.localdate()
    start = flt.date_from or (end - timedelta(days=29))
    return start, end


def _with_effective_dates(flt: AdminReportFilter) -> AdminReportFilter:
    start, end = _effective_window(flt)
    return replace(flt, date_from=start, date_to=end)


def _envelope(
    *,
    report_key: str,
    title: str,
    section: str,
    summary: list[dict],
    columns: list[dict],
    rows: list[dict],
    totals: dict | None = None,
    flt: AdminReportFilter,
) -> dict:
    return {
        "report_key": report_key,
        "title": title,
        "section": section,
        "summary": summary,
        "columns": columns,
        "rows": rows,
        "totals": totals or {},
        "filters_applied": flt.payload(),
        "ignored_filters": flt.ignored_filters,
        "branch_placeholder": "branch_id filter is honored where the underlying model exposes branch_id.",
    }


def get_reports_center_catalog() -> dict:
    return {
        "sections": [
            {
                "id": "finance",
                "label": "Finance",
                "reports": [
                    {"key": "daily-collection", "title": "Daily collection", "description": "Collections grouped by payment date."},
                    {"key": "cashier-collection", "title": "Cashier collection", "description": "Payments filtered by collector and date window."},
                    {"key": "payment-method", "title": "Payment method split", "description": "Totals by payment instrument in the window."},
                ],
            },
            {
                "id": "emi",
                "label": "EMI",
                "reports": [
                    {"key": "overdue-emi", "title": "Overdue EMI", "description": "Pending EMIs past due in the selected window."},
                    {"key": "subscription-performance", "title": "Subscription performance", "description": "Active subscriptions by plan and status."},
                    {"key": "batch-performance", "title": "Batch performance", "description": "Batches with subscription counts and slot usage."},
                    {"key": "waiver-loss", "title": "Waiver / loss", "description": "Waived EMI counts and amounts (read-only accounting view)."},
                ],
            },
            {
                "id": "rent_lease",
                "label": "Rent / Lease",
                "reports": [
                    {"key": "rent-deposit-liability", "title": "Rent deposit liability", "description": "Security deposit demands and held balances."},
                ],
            },
            {
                "id": "direct_sale",
                "label": "Direct Sale",
                "reports": [
                    {"key": "direct-sale-receivable", "title": "Direct sale receivable", "description": "Open balances on confirmed direct sales."},
                ],
            },
            {
                "id": "inventory",
                "label": "Inventory",
                "reports": [
                    {"key": "inventory-demand", "title": "Inventory demand", "description": "Purchase suggestions from operational demand signals."},
                    {"key": "stock-movement", "title": "Stock movement", "description": "Ledger movements in the date window."},
                ],
            },
            {
                "id": "crm",
                "label": "CRM",
                "reports": [
                    {"key": "crm-conversion", "title": "CRM conversion funnel", "description": "Internal leads by stage."},
                ],
            },
            {
                "id": "delivery",
                "label": "Delivery",
                "reports": [
                    {"key": "delivery-pending", "title": "Delivery pending", "description": "Subscription deliveries not yet completed."},
                ],
            },
            {
                "id": "audit",
                "label": "Audit",
                "reports": [
                    {"key": "audit-trail", "title": "Audit trail (read-only)", "description": "Recent immutable audit log entries."},
                ],
            },
            {
                "id": "accounting_health",
                "label": "Accounting health",
                "reports": [
                    {"key": "accounting-imbalance", "title": "Journal imbalance check", "description": "Unbalanced journal groups from control validation (read-only)."},
                ],
            },
        ]
    }


REPORT_KEYS = frozenset(
    {
        "daily-collection",
        "cashier-collection",
        "payment-method",
        "overdue-emi",
        "subscription-performance",
        "batch-performance",
        "waiver-loss",
        "rent-deposit-liability",
        "direct-sale-receivable",
        "inventory-demand",
        "stock-movement",
        "crm-conversion",
        "delivery-pending",
        "audit-trail",
        "accounting-imbalance",
    }
)


def run_report(*, report_key: str, flt: AdminReportFilter) -> dict:
    if report_key not in REPORT_KEYS:
        raise ValueError("Unknown report key.")
    flt_e = _with_effective_dates(flt)
    builders = {
        "daily-collection": _build_daily_collection,
        "cashier-collection": _build_cashier_collection,
        "payment-method": _build_payment_method,
        "overdue-emi": _build_overdue_emi,
        "subscription-performance": _build_subscription_performance,
        "batch-performance": _build_batch_performance,
        "waiver-loss": _build_waiver_loss,
        "rent-deposit-liability": _build_rent_deposit_liability,
        "direct-sale-receivable": _build_direct_sale_receivable,
        "inventory-demand": _build_inventory_demand,
        "stock-movement": _build_stock_movement,
        "crm-conversion": _build_crm_conversion,
        "delivery-pending": _build_delivery_pending,
        "audit-trail": _build_audit_trail,
        "accounting-imbalance": _build_accounting_imbalance,
    }
    return builders[report_key](flt_e)


def _build_daily_collection(flt: AdminReportFilter) -> dict:
    qs = _apply_common_payment_filters(Payment.objects.all(), flt)
    by_day = (
        qs.values("payment_date")
        .annotate(total=Coalesce(Sum("amount"), Value(Decimal("0.00"))), count=Count("id"))
        .order_by("payment_date")
    )
    rows = [{"payment_date": str(r["payment_date"]), "count": r["count"], "total": _money(r["total"])} for r in by_day]
    agg = qs.aggregate(total=Coalesce(Sum("amount"), Value(Decimal("0.00"))), count=Count("id"))
    summary = [
        {"label": "Payments", "value": str(agg["count"] or 0)},
        {"label": "Total collected", "value": _money(agg["total"])},
    ]
    cols = [
        {"key": "payment_date", "header": "Date"},
        {"key": "count", "header": "Count"},
        {"key": "total", "header": "Total"},
    ]
    return _envelope(
        report_key="daily-collection",
        title="Daily collection",
        section="finance",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={"payment_count": agg["count"], "amount_total": _money(agg["total"])},
        flt=flt,
    )


def _build_cashier_collection(flt: AdminReportFilter) -> dict:
    qs = _apply_common_payment_filters(Payment.objects.all(), flt)
    rows = []
    for p in qs.select_related("collected_by", "customer").order_by("-payment_date", "-id")[:500]:
        rows.append(
            {
                "payment_date": str(p.payment_date),
                "amount": _money(p.amount),
                "method": p.method,
                "customer": p.customer.name if p.customer_id else "",
                "collected_by": p.collected_by.get_full_name() or p.collected_by.username if p.collected_by_id else "",
            }
        )
    agg = qs.aggregate(total=Coalesce(Sum("amount"), Value(Decimal("0.00"))), count=Count("id"))
    summary = [{"label": "Row cap", "value": "500"}, {"label": "Total (window)", "value": _money(agg["total"])}]
    cols = [
        {"key": "payment_date", "header": "Date"},
        {"key": "amount", "header": "Amount"},
        {"key": "method", "header": "Method"},
        {"key": "customer", "header": "Customer"},
        {"key": "collected_by", "header": "Collected by"},
    ]
    return _envelope(
        report_key="cashier-collection",
        title="Cashier collection",
        section="finance",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={"payment_count": agg["count"], "amount_total": _money(agg["total"])},
        flt=flt,
    )


def _build_payment_method(flt: AdminReportFilter) -> dict:
    qs = _apply_common_payment_filters(Payment.objects.all(), flt)
    rows = list(
        qs.values("method")
        .annotate(total=Coalesce(Sum("amount"), Value(Decimal("0.00"))), count=Count("id"))
        .order_by("method")
    )
    out = [{"method": r["method"], "count": r["count"], "total": _money(r["total"])} for r in rows]
    agg = qs.aggregate(total=Coalesce(Sum("amount"), Value(Decimal("0.00"))))
    summary = [{"label": "Grand total", "value": _money(agg["total"])}]
    cols = [{"key": "method", "header": "Method"}, {"key": "count", "header": "Count"}, {"key": "total", "header": "Total"}]
    return _envelope(
        report_key="payment-method",
        title="Payment method report",
        section="finance",
        summary=summary,
        columns=cols,
        rows=out,
        totals={"amount_total": _money(agg["total"])},
        flt=flt,
    )


def _build_overdue_emi(flt: AdminReportFilter) -> dict:
    today = timezone.localdate()
    qs = Emi.objects.filter(status=EmiStatus.PENDING, due_date__lt=today)
    qs = _apply_common_emi_filters(qs, flt)
    rows = []
    for emi in qs.select_related("subscription", "subscription__customer", "subscription__product").order_by("due_date")[:500]:
        rows.append(
            {
                "emi_id": emi.id,
                "due_date": str(emi.due_date),
                "amount": _money(emi.amount),
                "balance": _money(emi.balance_amount()),
                "customer": emi.subscription.customer.name,
                "subscription_id": emi.subscription_id,
                "product": getattr(emi.subscription.product, "name", ""),
            }
        )
    total_due = qs.aggregate(t=Coalesce(Sum("amount"), Value(Decimal("0.00"))))["t"] or Decimal("0.00")
    summary = [{"label": "Overdue rows (capped 500)", "value": str(len(rows))}, {"label": "EMI principal sum (filtered)", "value": _money(total_due)}]
    cols = [
        {"key": "emi_id", "header": "EMI"},
        {"key": "due_date", "header": "Due"},
        {"key": "amount", "header": "Amount"},
        {"key": "balance", "header": "Balance"},
        {"key": "customer", "header": "Customer"},
        {"key": "subscription_id", "header": "Sub #"},
        {"key": "product", "header": "Product"},
    ]
    return _envelope(
        report_key="overdue-emi",
        title="Overdue EMI",
        section="emi",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={"row_count": len(rows)},
        flt=flt,
    )


def _build_subscription_performance(flt: AdminReportFilter) -> dict:
    qs = Subscription.objects.all()
    if flt.date_from:
        qs = qs.filter(start_date__gte=flt.date_from)
    if flt.date_to:
        qs = qs.filter(start_date__lte=flt.date_to)
    if flt.contract_type and flt.contract_type in {*PlanType.values}:
        qs = qs.filter(plan_type=flt.contract_type)
    if flt.customer_id:
        qs = qs.filter(customer_id=flt.customer_id)
    if flt.branch_id:
        qs = qs.filter(branch_id=flt.branch_id)
    grouped = qs.values("plan_type", "status").annotate(count=Count("id"), contract_total=Coalesce(Sum("total_amount"), Value(Decimal("0.00"))))
    rows = [
        {
            "plan_type": r["plan_type"],
            "status": r["status"],
            "count": r["count"],
            "contract_total": _money(r["contract_total"]),
        }
        for r in grouped.order_by("plan_type", "status")
    ]
    summary = [{"label": "Subscriptions in window", "value": str(qs.count())}]
    cols = [
        {"key": "plan_type", "header": "Plan"},
        {"key": "status", "header": "Status"},
        {"key": "count", "header": "Count"},
        {"key": "contract_total", "header": "Contract total"},
    ]
    return _envelope(
        report_key="subscription-performance",
        title="Subscription performance",
        section="emi",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={},
        flt=flt,
    )


def _build_batch_performance(flt: AdminReportFilter) -> dict:
    qs = Batch.objects.annotate(sub_count=Count("subscriptions"))
    rows = []
    for b in qs.order_by("-start_date")[:200]:
        rows.append(
            {
                "batch_code": b.batch_code,
                "status": b.status,
                "total_slots": b.total_slots,
                "subscriptions": b.sub_count,
                "start_date": str(b.start_date),
            }
        )
    summary = [{"label": "Batches shown", "value": str(len(rows))}]
    cols = [
        {"key": "batch_code", "header": "Batch"},
        {"key": "status", "header": "Status"},
        {"key": "total_slots", "header": "Slots"},
        {"key": "subscriptions", "header": "Subs"},
        {"key": "start_date", "header": "Start"},
    ]
    return _envelope(
        report_key="batch-performance",
        title="Batch performance",
        section="emi",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={},
        flt=flt,
    )


def _build_waiver_loss(flt: AdminReportFilter) -> dict:
    raw = build_accounting_waiver_loss(flt=flt)
    summary = [
        {"label": "Waived EMIs", "value": str(raw.get("waived_count", 0))},
        {"label": "Waived amount", "value": str(raw.get("waived_amount", "0.00"))},
    ]
    cols = [{"key": "metric", "header": "Metric"}, {"key": "value", "header": "Value"}]
    rows = [{"metric": "waived_count", "value": raw.get("waived_count", 0)}, {"metric": "waived_amount", "value": raw.get("waived_amount", "0.00")}]
    return _envelope(
        report_key="waiver-loss",
        title="Waiver / loss summary",
        section="emi",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={"waived_count": raw.get("waived_count", 0), "waived_amount": str(raw.get("waived_amount", "0.00"))},
        flt=flt,
    )


def _build_rent_deposit_liability(flt: AdminReportFilter) -> dict:
    reg = list_admin_deposit_register(limit=1000)
    rows_all = reg.get("results") or []
    rows = [r for r in rows_all if str(r.get("plan_type", "")).upper() in {"", "RENT", "LEASE"}]
    if flt.contract_type in {PlanType.RENT, PlanType.LEASE}:
        rows = [r for r in rows if str(r.get("plan_type", "")).upper() == flt.contract_type]
    held = sum((Decimal(str(r.get("held_amount") or "0")) for r in rows), start=Decimal("0.00"))
    summary = [{"label": "Rows", "value": str(len(rows))}, {"label": "Held total (listed)", "value": _money(held)}]
    cols = [
        {"key": "subscription_id", "header": "Sub"},
        {"key": "customer_name", "header": "Customer"},
        {"key": "plan_type", "header": "Plan"},
        {"key": "held_amount", "header": "Held"},
        {"key": "status", "header": "Status"},
    ]
    return _envelope(
        report_key="rent-deposit-liability",
        title="Rent / lease deposit liability",
        section="rent_lease",
        summary=summary,
        columns=cols,
        rows=rows[:500],
        totals={"held_total": _money(held), "row_count": len(rows)},
        flt=flt,
    )


def _build_direct_sale_receivable(flt: AdminReportFilter) -> dict:
    qs = DirectSale.objects.filter(status__in=[DirectSaleStatus.CONFIRMED, DirectSaleStatus.INVOICED]).exclude(balance_total=Decimal("0.00"))
    if flt.date_from:
        qs = qs.filter(sale_date__gte=flt.date_from)
    if flt.date_to:
        qs = qs.filter(sale_date__lte=flt.date_to)
    if flt.branch_id:
        qs = qs.filter(branch_id=flt.branch_id)
    if flt.customer_id:
        qs = qs.filter(customer_id=flt.customer_id)
    rows = []
    for ds in qs.select_related("customer").order_by("-sale_date")[:500]:
        rows.append(
            {
                "sale_no": ds.sale_no or "",
                "sale_date": str(ds.sale_date),
                "grand_total": _money(ds.grand_total),
                "received_total": _money(ds.received_total),
                "balance_total": _money(ds.balance_total),
                "customer": ds.customer_name_snapshot or (ds.customer.name if ds.customer_id else ""),
            }
        )
    agg = qs.aggregate(t=Coalesce(Sum("balance_total"), Value(Decimal("0.00"))))
    summary = [{"label": "Open receivable (sum balance)", "value": _money(agg["t"])}]
    cols = [
        {"key": "sale_no", "header": "Sale #"},
        {"key": "sale_date", "header": "Date"},
        {"key": "grand_total", "header": "Grand"},
        {"key": "received_total", "header": "Received"},
        {"key": "balance_total", "header": "Balance"},
        {"key": "customer", "header": "Customer"},
    ]
    return _envelope(
        report_key="direct-sale-receivable",
        title="Direct sale receivable",
        section="direct_sale",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={"balance_sum": _money(agg["t"]), "row_count": len(rows)},
        flt=flt,
    )


def _build_inventory_demand(flt: AdminReportFilter) -> dict:
    suggestions = get_purchase_suggestions(product_ids=None) or []
    rows = []
    for s in suggestions[:300]:
        if not isinstance(s, dict):
            rows.append({"detail": str(s)})
            continue
        row = {}
        for k, v in s.items():
            row[k] = str(v) if isinstance(v, Decimal) else v
        rows.append(row)
    summary = [{"label": "Suggestions", "value": str(len(rows))}]
    cols = [{"key": k, "header": k.replace("_", " ").title()} for k in (rows[0].keys() if rows else ["detail"])]
    return _envelope(
        report_key="inventory-demand",
        title="Inventory demand",
        section="inventory",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={"row_count": len(rows)},
        flt=flt,
    )


def _build_stock_movement(flt: AdminReportFilter) -> dict:
    qs = StockLedger.objects.select_related("inventory_item__product", "stock_location")
    if flt.date_from:
        qs = qs.filter(movement_date__gte=flt.date_from)
    if flt.date_to:
        qs = qs.filter(movement_date__lte=flt.date_to)
    rows = []
    for row in qs.order_by("-movement_date", "-id")[:500]:
        rows.append(
            {
                "movement_date": str(row.movement_date),
                "type": row.movement_type,
                "qty_in": str(row.quantity_in),
                "qty_out": str(row.quantity_out),
                "product": getattr(row.inventory_item.product, "product_code", ""),
                "location": getattr(row.stock_location, "code", "") or "",
                "reference": f"{row.reference_model}:{row.reference_id}",
            }
        )
    summary = [{"label": "Movements (capped)", "value": str(len(rows))}]
    cols = [
        {"key": "movement_date", "header": "Date"},
        {"key": "type", "header": "Type"},
        {"key": "qty_in", "header": "In"},
        {"key": "qty_out", "header": "Out"},
        {"key": "product", "header": "Product"},
        {"key": "location", "header": "Location"},
        {"key": "reference", "header": "Reference"},
    ]
    return _envelope(
        report_key="stock-movement",
        title="Stock movement",
        section="inventory",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={"row_count": len(rows)},
        flt=flt,
    )


def _build_crm_conversion(flt: AdminReportFilter) -> dict:
    qs = Lead.objects.all()
    if flt.date_from:
        qs = qs.filter(created_at__date__gte=flt.date_from)
    if flt.date_to:
        qs = qs.filter(created_at__date__lte=flt.date_to)
    grouped = qs.values("stage").annotate(count=Count("id")).order_by("stage")
    rows = [{"stage": r["stage"], "count": r["count"]} for r in grouped]
    converted = qs.filter(stage=LeadStage.CONVERTED).count()
    total = qs.count()
    summary = [
        {"label": "Leads in window", "value": str(total)},
        {"label": "Converted", "value": str(converted)},
    ]
    cols = [{"key": "stage", "header": "Stage"}, {"key": "count", "header": "Count"}]
    return _envelope(
        report_key="crm-conversion",
        title="CRM conversion funnel",
        section="crm",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={"leads": total, "converted": converted},
        flt=flt,
    )


def _build_delivery_pending(flt: AdminReportFilter) -> dict:
    from subscriptions.models import DeliveryStatus

    qs = SubscriptionDelivery.objects.filter(status=DeliveryStatus.PENDING).select_related("subscription", "subscription__customer")
    if flt.branch_id:
        qs = qs.filter(subscription__branch_id=flt.branch_id)
    rows = []
    for d in qs.order_by("created_at")[:500]:
        rows.append(
            {
                "id": d.id,
                "reference": d.delivery_reference,
                "customer": d.subscription.customer.name,
                "subscription_id": d.subscription_id,
                "status": d.status,
                "created_at": d.created_at.isoformat() if d.created_at else "",
            }
        )
    summary = [{"label": "Pending deliveries", "value": str(len(rows))}]
    cols = [
        {"key": "id", "header": "ID"},
        {"key": "reference", "header": "Ref"},
        {"key": "customer", "header": "Customer"},
        {"key": "subscription_id", "header": "Sub"},
        {"key": "status", "header": "Status"},
        {"key": "created_at", "header": "Created"},
    ]
    return _envelope(
        report_key="delivery-pending",
        title="Delivery pending",
        section="delivery",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={"row_count": len(rows)},
        flt=flt,
    )


def _build_audit_trail(flt: AdminReportFilter) -> dict:
    qs = AuditLog.objects.select_related("performed_by").all()
    if flt.date_from:
        qs = qs.filter(created_at__date__gte=flt.date_from)
    if flt.date_to:
        qs = qs.filter(created_at__date__lte=flt.date_to)
    rows = []
    for a in qs.order_by("-created_at")[:300]:
        rows.append(
            {
                "created_at": a.created_at.isoformat() if a.created_at else "",
                "action_type": a.action_type,
                "model_name": a.model_name,
                "object_id": a.object_id,
                "performed_by": a.performed_by.username if a.performed_by_id else "",
            }
        )
    summary = [{"label": "Entries (capped)", "value": str(len(rows))}]
    cols = [
        {"key": "created_at", "header": "When"},
        {"key": "action_type", "header": "Action"},
        {"key": "model_name", "header": "Model"},
        {"key": "object_id", "header": "Object"},
        {"key": "performed_by", "header": "User"},
    ]
    return _envelope(
        report_key="audit-trail",
        title="Audit trail",
        section="audit",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={"row_count": len(rows)},
        flt=flt,
    )


def _build_accounting_imbalance(flt: AdminReportFilter) -> dict:
    payload = validate_financial_period_balance(date_from=flt.date_from, date_to=flt.date_to)
    groups = payload.get("unbalanced_groups") or []
    rows = [
        {
            "journal_group_id": g.get("journal_group_id", ""),
            "delta": str(g.get("delta", g.get("imbalance", ""))),
            "detail": str(g)[:500],
        }
        for g in groups[:200]
    ]
    summary = [
        {"label": "Unbalanced groups", "value": str(payload.get("unbalanced_group_count", 0))},
        {"label": "Orphan ledger rows", "value": str(payload.get("orphan_ledger_entries", 0))},
    ]
    cols = [
        {"key": "journal_group_id", "header": "Journal group"},
        {"key": "is_balanced", "header": "Balanced"},
        {"key": "computed_total_debit", "header": "Debit"},
        {"key": "computed_total_credit", "header": "Credit"},
    ]
    return _envelope(
        report_key="accounting-imbalance",
        title="Accounting imbalance check",
        section="accounting_health",
        summary=summary,
        columns=cols,
        rows=rows,
        totals={"unbalanced_group_count": payload.get("unbalanced_group_count", 0)},
        flt=flt,
    )
