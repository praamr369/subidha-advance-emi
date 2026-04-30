from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from accounting.models import FinanceAccount, FinanceAccountCoaMapping
from accounting.services.control_validation_service import validate_financial_period_balance

from subscriptions.models import (
    Commission,
    CommissionPayoutBatch,
    Customer,
    Emi,
    EmiStatus,
    KycStatus,
    MONEY_ZERO,
    Payment,
    PaymentReconciliation,
    PlanType,
    ReconciliationStatus,
    RentLeaseReturnInspection,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.phase5_chart_service import build_chart_payload
from subscriptions.services.phase5_filter_service import AdminReportFilter
from subscriptions.services.phase5_severity_service import infer_severity, rank_alert_rows
from subscriptions.services.admin_reporting_analytics_service import (
    _build_collections_trend,
    _build_contract_performance,
    _build_crm_customer_posture,
    _build_delivery_posture,
    _build_direct_sales_posture,
    _build_finance_posture,
    _build_inventory_movement_posture,
    _build_payment_method_mix,
    _build_receivables_pressure,
    build_admin_reporting_analytics_summary,
)
from subscriptions.services.dashboard_canonical_financial_summary_service import (
    DashboardWindowParams,
    resolve_dashboard_window,
)
from subscriptions.services.phase4_finance_service import FinanceFilter, build_admin_finance_dashboard
from subscriptions.services.rent_lease_billing_service import list_admin_deposit_register


def _money(value) -> str:
    return f"{Decimal(str(value or MONEY_ZERO)).quantize(Decimal('0.01')):.2f}"


Phase5Filter = AdminReportFilter


def _kpi_card(*, label: str, value, source: str, detail_url: str, flt: AdminReportFilter, severity: str = "INFO", empty_reason: str | None = None) -> dict:
    return {
        "label": label,
        "value": value,
        "severity": severity,
        "source": source,
        "detail_url": detail_url,
        "filter_payload": flt.payload(),
        "empty_reason": empty_reason,
    }


def _apply_common_subscription_filters(qs, flt: AdminReportFilter):
    if flt.date_from:
        qs = qs.filter(created_at__date__gte=flt.date_from)
    if flt.date_to:
        qs = qs.filter(created_at__date__lte=flt.date_to)
    if flt.contract_type and flt.contract_type in {*PlanType.values}:
        qs = qs.filter(plan_type=flt.contract_type)
    if flt.partner_id:
        qs = qs.filter(partner_id=flt.partner_id)
    if flt.product_id:
        qs = qs.filter(product_id=flt.product_id)
    if flt.customer_id:
        qs = qs.filter(customer_id=flt.customer_id)
    if flt.status:
        qs = qs.filter(status=flt.status)
    if flt.branch_id:
        qs = qs.filter(branch_id=flt.branch_id)
    return qs


def _apply_common_payment_filters(qs, flt: AdminReportFilter):
    if flt.date_from:
        qs = qs.filter(payment_date__gte=flt.date_from)
    if flt.date_to:
        qs = qs.filter(payment_date__lte=flt.date_to)
    if flt.payment_method:
        qs = qs.filter(method=flt.payment_method)
    if flt.customer_id:
        qs = qs.filter(customer_id=flt.customer_id)
    if flt.partner_id:
        qs = qs.filter(subscription__partner_id=flt.partner_id)
    if flt.contract_type and flt.contract_type in {*PlanType.values}:
        qs = qs.filter(subscription__plan_type=flt.contract_type)
    if flt.product_id:
        qs = qs.filter(subscription__product_id=flt.product_id)
    if flt.branch_id:
        qs = qs.filter(branch_id=flt.branch_id)
    return qs


def _apply_common_emi_filters(qs, flt: AdminReportFilter):
    if flt.date_from:
        qs = qs.filter(due_date__gte=flt.date_from)
    if flt.date_to:
        qs = qs.filter(due_date__lte=flt.date_to)
    if flt.contract_type and flt.contract_type in {*PlanType.values}:
        qs = qs.filter(subscription__plan_type=flt.contract_type)
    if flt.status:
        qs = qs.filter(status=flt.status)
    if flt.customer_id:
        qs = qs.filter(subscription__customer_id=flt.customer_id)
    if flt.partner_id:
        qs = qs.filter(subscription__partner_id=flt.partner_id)
    if flt.product_id:
        qs = qs.filter(subscription__product_id=flt.product_id)
    if flt.branch_id:
        qs = qs.filter(subscription__branch_id=flt.branch_id)
    return qs


def _window_from_filter(flt: Phase5Filter) -> DashboardWindowParams:
    if flt.date_from or flt.date_to:
        return resolve_dashboard_window(
            window="CUSTOM",
            start_date=(flt.date_from or timezone.localdate()).isoformat(),
            end_date=(flt.date_to or timezone.localdate()).isoformat(),
        )
    return resolve_dashboard_window(window="THIS_MONTH")


def _phase4_filter(flt: Phase5Filter) -> FinanceFilter:
    plan_type = flt.contract_type if flt.contract_type in PlanType.values else ""
    return FinanceFilter(
        date_from=flt.date_from,
        date_to=flt.date_to,
        payment_method=flt.payment_method,
        plan_type=plan_type,
        status=flt.status,
        branch_id=flt.branch_id,
    )


def build_admin_accounting_control_center(*, flt: Phase5Filter) -> dict:
    finance = build_admin_finance_dashboard(flt=_phase4_filter(flt))
    today = timezone.localdate()
    mtd_start = today.replace(day=1)
    mtd_total = _apply_common_payment_filters(
        Payment.objects.filter(payment_date__gte=mtd_start, payment_date__lte=today),
        flt,
    ).aggregate(total=Sum("amount"))["total"]
    receivables = _apply_common_emi_filters(Emi.objects.filter(status=EmiStatus.PENDING), flt)
    if flt.overdue_only:
        receivables = receivables.filter(due_date__lt=today)
    deposit_rows = list_admin_deposit_register(limit=1000)["results"]
    deposit_liability = sum(Decimal(str(row["held_amount"])) for row in deposit_rows) if deposit_rows else Decimal("0.00")
    refunds_pending = RentLeaseReturnInspection.objects.filter(
        deposit_refund_approved=False,
        deposit_refund_amount__gt=Decimal("0.00"),
    ).count()
    kpis = {
        "today_collection": finance["cards"]["today_total_collection"],
        "month_to_date_collection": _money(mtd_total),
        "total_receivables": _money(receivables.aggregate(total=Sum("amount"))["total"]),
        "overdue_receivables": finance["cards"]["overdue_payments"],
        "unreconciled_payments": finance["cards"]["unreconciled_transactions"],
        "cash_collection": finance["cards"]["today_cash_collection"],
        "upi_collection": finance["cards"]["today_upi_collection"],
        "bank_collection": finance["cards"]["today_bank_collection"],
        "rent_lease_deposit_liability": _money(deposit_liability),
        "deposit_refunds_pending": refunds_pending,
        "damage_deductions": finance["cards"].get("deposit_deductions", "0.00"),
        "advance_emi_income_collection": finance["cards"]["advance_emi_collection"],
        "rent_income": finance["cards"]["rent_lease_income"],
        "lease_income": finance["cards"]["rent_lease_income"],
        "direct_sale_revenue": finance["cards"]["direct_sale_revenue"],
        "waiver_loss_exposure": finance["cards"]["waiver_loss_exposure"],
        "commission_payable": _money(
            Commission.objects.filter(status="PENDING").aggregate(total=Sum("commission_amount"))["total"]
        ),
        "partner_payout_pending": _money(
            CommissionPayoutBatch.objects.filter(status=CommissionPayoutBatch.Status.DRAFT).aggregate(total=Sum("total_amount"))["total"]
        ),
    }
    validation = validate_financial_period_balance(date_from=flt.date_from, date_to=flt.date_to)
    kpis["unbalanced_journal_warnings"] = str(validation["unbalanced_group_count"])
    kpis["unmapped_account_warnings"] = str(
        max(
            FinanceAccount.objects.filter(is_active=True).count()
            - FinanceAccountCoaMapping.objects.filter(is_active=True).values("finance_account_id").distinct().count(),
            0,
        )
    )
    kpi_cards = [
        _kpi_card(label="Today Collection", value=kpis["today_collection"], source="Payment", detail_url="/admin/reports/collections", flt=flt),
        _kpi_card(label="Overdue Receivables", value=kpis["overdue_receivables"], source="Emi", detail_url="/admin/reports/overdue", flt=flt, severity="HIGH"),
        _kpi_card(label="Unreconciled Payments", value=kpis["unreconciled_payments"], source="PaymentReconciliation", detail_url="/admin/accounting/reconciliation", flt=flt, severity="CRITICAL" if int(kpis["unreconciled_payments"]) > 0 else "INFO"),
        _kpi_card(label="Deposit Liability", value=kpis["rent_lease_deposit_liability"], source="RentLeaseBillingDemand", detail_url="/admin/finance/deposits", flt=flt),
        _kpi_card(label="Waiver/Loss Exposure", value=kpis["waiver_loss_exposure"], source="Emi", detail_url="/admin/reports/waiver-loss", flt=flt),
    ]
    return {
        "kpis": kpis,
        "kpi_cards": kpi_cards,
        "payment_method_split": finance["payment_method_split_range"],
        "reconciliation": {
            "unreconciled": finance["cards"]["unreconciled_transactions"],
            "overdue_aging": finance["overdue_aging"],
        },
        "deep_links": {
            "invoices": "/admin/billing/invoices",
            "receipts": "/admin/billing/receipts",
            "reconciliation": "/admin/accounting/reconciliation",
            "deposits": "/admin/finance/deposits",
            "waiver_loss": "/admin/reports/waiver-loss",
        },
    }


def build_accounting_chart_summary(*, flt: Phase5Filter) -> dict:
    finance_posture = _build_finance_posture(_window_from_filter(flt))
    return {
        "chart_of_accounts_count": finance_posture["chart_of_accounts_count"],
        "finance_accounts_count": finance_posture["finance_accounts_count"],
        "purchase_obligations": finance_posture["purchase_obligations"],
    }


def build_accounting_ledger_summary(*, flt: Phase5Filter) -> dict:
    return build_admin_accounting_control_center(flt=flt)["reconciliation"]


def build_accounting_cash_bank_summary(*, flt: Phase5Filter) -> dict:
    split = _build_payment_method_mix(_window_from_filter(flt))
    return {"rows": split["rows"], "summary": split["summary"]}


def build_accounting_receivables(*, flt: Phase5Filter) -> dict:
    pressure = _build_receivables_pressure(_window_from_filter(flt))
    return pressure


def build_accounting_payables(*, flt: Phase5Filter) -> dict:
    return _build_finance_posture(_window_from_filter(flt))["purchase_obligations"]


def build_accounting_reconciliation_control(*, flt: Phase5Filter) -> dict:
    rows = PaymentReconciliation.objects.select_related("payment", "payment__customer", "payment__subscription")
    rows = _apply_common_payment_filters(rows, flt)
    if flt.unreconciled_only:
        rows = rows.filter(Q(status=ReconciliationStatus.PENDING) | Q(is_flagged=True))
    return {
        "count": rows.count(),
        "unreconciled_count": rows.filter(Q(status=ReconciliationStatus.PENDING) | Q(is_flagged=True)).count(),
    }


def build_accounting_unreconciled(*, flt: Phase5Filter) -> dict:
    rows = PaymentReconciliation.objects.filter(Q(status=ReconciliationStatus.PENDING) | Q(is_flagged=True)).select_related("payment", "payment__customer", "payment__subscription")
    rows = _apply_common_payment_filters(rows, flt).order_by("-created_at")[:200]
    return {
        "count": len(rows),
        "results": [
            {
                "id": row.id,
                "payment_id": row.payment_id,
                "payment_date": row.payment.payment_date,
                "payment_method": row.payment.method,
                "customer_name": row.payment.customer.name if row.payment.customer_id else "",
                "subscription_number": row.payment.subscription.subscription_number if row.payment.subscription_id else "",
                "status": row.status,
                "is_flagged": row.is_flagged,
                "notes": row.notes,
                "variance_amount": _money(row.variance_amount),
            }
            for row in rows
        ],
    }


def build_accounting_waiver_loss(*, flt: Phase5Filter) -> dict:
    qs = _apply_common_emi_filters(Emi.objects.filter(status=EmiStatus.WAIVED), flt)
    return {
        "waived_count": qs.count(),
        "waived_amount": _money(qs.aggregate(total=Sum("amount"))["total"]),
    }


def build_accounting_deposit_liability(*, flt: Phase5Filter) -> dict:
    register = list_admin_deposit_register(limit=1000)
    total_held = sum(Decimal(str(row["held_amount"])) for row in register["results"])
    return {"deposit_rows": register["results"], "held_total": _money(total_held)}


def build_accounting_revenue_breakdown(*, flt: Phase5Filter) -> dict:
    card = build_admin_accounting_control_center(flt=flt)["kpis"]
    return {
        "advance_emi": card["advance_emi_income_collection"],
        "rent": card["rent_income"],
        "lease": card["lease_income"],
        "direct_sale": card["direct_sale_revenue"],
    }


def build_accounting_payment_method_split(*, flt: Phase5Filter) -> dict:
    payments = _apply_common_payment_filters(Payment.objects.all(), flt)
    rows = (
        payments.values("method")
        .annotate(total=Coalesce(Sum("amount"), Value(Decimal("0.00"))), count=Count("id"))
        .order_by("method")
    )
    return {
        "rows": [{"method": row["method"], "count": row["count"], "net_amount": _money(row["total"])} for row in rows],
        "summary": {"total_net_amount": _money(sum((row["total"] for row in rows), Decimal("0.00")))},
    }


def build_accounting_audit_trail(*, flt: Phase5Filter) -> dict:
    from subscriptions.models import AuditLog

    qs = AuditLog.objects.order_by("-created_at")[:200]
    return {
        "count": len(qs),
        "results": [
            {
                "id": row.id,
                "action_type": row.action_type,
                "model_name": row.model_name,
                "object_id": row.object_id,
                "created_at": row.created_at,
            }
            for row in qs
        ],
    }


def build_operations_command_center(*, flt: Phase5Filter) -> dict:
    today = timezone.localdate()
    queue = {
        "contracts_awaiting_approval": Subscription.objects.filter(status=SubscriptionStatus.PENDING_APPROVAL).count(),
        "contracts_awaiting_activation": Subscription.objects.filter(status=SubscriptionStatus.APPROVED).count(),
        "invoices_pending": build_admin_finance_dashboard(flt=_phase4_filter(flt))["cards"]["invoices_pending"],
        "overdue_dues": Emi.objects.filter(status=EmiStatus.PENDING, due_date__lt=today).count(),
        "deliveries_pending": _build_delivery_posture(_window_from_filter(flt))["summary"].get("pending", 0),
        "returns_due": Subscription.objects.filter(
            plan_type__in=[PlanType.RENT, PlanType.LEASE],
            status__in=[SubscriptionStatus.ACTIVE, SubscriptionStatus.APPROVED],
            start_date__lte=today - timedelta(days=330),
        ).count(),
        "return_inspections_pending": RentLeaseReturnInspection.objects.filter(
            status__in=["PENDING", "IN_PROGRESS", "COMPLETED"]
        ).count(),
        "kyc_pending": Customer.objects.filter(kyc_status=KycStatus.PENDING).count(),
        "partner_commission_pending": Commission.objects.filter(status="PENDING").count(),
        "unreconciled_payments": PaymentReconciliation.objects.filter(
            Q(status=ReconciliationStatus.PENDING) | Q(is_flagged=True)
        ).count(),
    }
    return queue


def build_operations_alerts(*, flt: Phase5Filter) -> dict:
    queue = build_operations_command_center(flt=flt)
    alerts = [
        {
            "key": key,
            "count": int(count),
            "severity": infer_severity(key, int(count)),
            "oldest_pending_at": None,
            "detail_url": f"/admin/operations/command-center?queue={key}",
            "filter_payload": flt.payload(),
        }
        for key, count in queue.items()
    ]
    alerts = rank_alert_rows(alerts)
    return {"count": len(alerts), "results": alerts}


def build_operations_work_queue(*, flt: Phase5Filter) -> dict:
    queue = build_operations_alerts(flt=flt)["results"]
    return {
        "count": len(queue),
        "results": queue,
    }


def build_operations_today(*, flt: Phase5Filter) -> dict:
    today = timezone.localdate()
    return {
        "date": today.isoformat(),
        "today_collection": _money(Payment.objects.filter(payment_date=today).aggregate(total=Sum("amount"))["total"]),
        "today_receipts": Payment.objects.filter(payment_date=today).count(),
    }


def build_executive_summary(*, flt: Phase5Filter, actor_user=None) -> dict:
    window = _window_from_filter(flt)
    analytics = build_admin_reporting_analytics_summary(actor_user=actor_user, window_params=window)
    accounting = build_admin_accounting_control_center(flt=flt)
    operations = build_operations_command_center(flt=flt)
    return {
        "overview": analytics["overview"],
        "accounting_kpis": accounting["kpis"],
        "operations_queue": operations,
    }


def build_finance_performance_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    rows = build_accounting_payment_method_split(flt=flt)["rows"]
    labels = [row["method"] for row in rows]
    values = [Decimal(str(row["net_amount"])) for row in rows]
    return build_chart_payload(
        labels=labels,
        series=[{"name": "net_amount", "data": [str(v) for v in values]}],
        totals={"net_total": _money(sum(values, Decimal("0.00")))},
        source="Payment",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason="No payment rows for selected filters." if not rows else None,
        ignored_filters=flt.ignored_filters,
    )


def build_contract_performance_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    qs = _apply_common_subscription_filters(Subscription.objects.all(), flt)
    rows = list(
        qs.values("plan_type")
        .annotate(contract_value=Coalesce(Sum("total_amount"), Value(Decimal("0.00"))), count=Count("id"))
        .order_by("plan_type")
    )
    return build_chart_payload(
        labels=[row["plan_type"] for row in rows],
        series=[{"name": "contract_value", "data": [_money(row["contract_value"]) for row in rows]}],
        totals={"plan_count": len(rows)},
        source="Subscription",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason="No contract rows for selected filters." if not rows else None,
        ignored_filters=flt.ignored_filters,
    )


def build_advance_emi_performance_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    flt2 = Phase5Filter(**{**flt.__dict__, "contract_type": PlanType.EMI})
    return build_contract_performance_report(flt=flt2, actor_user=actor_user)


def build_rent_lease_performance_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    qs = _apply_common_subscription_filters(
        Subscription.objects.filter(plan_type__in={PlanType.RENT, PlanType.LEASE}),
        flt,
    )
    rows = list(
        qs.values("plan_type")
        .annotate(monthly_value=Coalesce(Sum("monthly_amount"), Value(Decimal("0.00"))))
        .order_by("plan_type")
    )
    return build_chart_payload(
        labels=[row["plan_type"] for row in rows],
        series=[{"name": "monthly_value", "data": [_money(row["monthly_value"]) for row in rows]}],
        totals={"row_count": len(rows)},
        source="Subscription",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason="No rent/lease rows available." if not rows else None,
        ignored_filters=flt.ignored_filters,
    )


def build_direct_sale_performance_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    data = _build_direct_sales_posture(_window_from_filter(flt))
    rows = data["trend"]
    return build_chart_payload(
        labels=[row["date"] for row in rows],
        series=[{"name": "gross_total", "data": [row["gross_total"] for row in rows]}],
        totals=data["summary"],
        source="DirectSale",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason="No direct sale trend rows." if not rows else None,
        ignored_filters=flt.ignored_filters,
    )


def build_inventory_performance_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    data = _build_inventory_movement_posture(_window_from_filter(flt))
    rows = data["movement_type"]
    return build_chart_payload(
        labels=[row["movement_type"] for row in rows],
        series=[{"name": "quantity_out", "data": [row["quantity_out"] for row in rows]}],
        totals=data["movement_summary"],
        source="StockLedger",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason="No stock movement rows." if not rows else None,
        ignored_filters=flt.ignored_filters,
    )


def build_delivery_performance_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    summary = _build_delivery_posture(_window_from_filter(flt))["summary"]
    labels = ["pending", "scheduled", "in_transit", "delivered", "blocked_stock"]
    return build_chart_payload(
        labels=labels,
        series=[{"name": "count", "data": [summary.get(k, 0) for k in labels]}],
        totals=summary,
        source="SubscriptionDelivery",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason=None,
        ignored_filters=flt.ignored_filters,
    )


def build_customer_crm_performance_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    data = _build_crm_customer_posture(_window_from_filter(flt))
    labels = [row["status"] for row in data["leads"]["by_status"]]
    values = [row["count"] for row in data["leads"]["by_status"]]
    return build_chart_payload(
        labels=labels,
        series=[{"name": "lead_count", "data": values}],
        totals={"open_leads": data["leads"]["open_count"], "new_customers": data["customers"]["new_count"]},
        source="PublicLead/Customer",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason="No lead rows." if not labels else None,
        ignored_filters=flt.ignored_filters,
    )


def build_partner_performance_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    rows = (
        _apply_common_subscription_filters(Subscription.objects.exclude(partner__isnull=True), flt)
        .values("partner_id", "partner__username")
        .annotate(contract_count=Count("id"), collection_total=Coalesce(Sum("payments__amount"), Value(Decimal("0.00"))))
        .order_by("-collection_total")[:50]
    )
    labels = [row["partner__username"] or f"PARTNER-{row['partner_id']}" for row in rows]
    return build_chart_payload(
        labels=labels,
        series=[{"name": "collection_total", "data": [_money(row["collection_total"]) for row in rows]}],
        totals={"partner_count": len(labels)},
        source="Subscription/Payment",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason="No partner-linked contracts." if not labels else None,
        ignored_filters=flt.ignored_filters,
    )


def build_waiver_loss_analysis_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    qs = _apply_common_emi_filters(Emi.objects.filter(status=EmiStatus.WAIVED), flt)
    grouped = qs.values("due_date").annotate(amount=Coalesce(Sum("amount"), Value(Decimal("0.00")))).order_by("due_date")
    return build_chart_payload(
        labels=[row["due_date"].isoformat() for row in grouped],
        series=[{"name": "waived_amount", "data": [_money(row["amount"]) for row in grouped]}],
        totals={"waived_total": _money(qs.aggregate(total=Sum("amount"))["total"])},
        source="Emi",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason="No waived EMI rows." if not grouped else None,
        ignored_filters=flt.ignored_filters,
    )


def build_reconciliation_analysis_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    qs = _apply_common_payment_filters(PaymentReconciliation.objects.select_related("payment"), flt)
    rows = qs.values("status").annotate(count=Count("id")).order_by("status")
    return build_chart_payload(
        labels=[row["status"] for row in rows],
        series=[{"name": "count", "data": [row["count"] for row in rows]}],
        totals={"unreconciled": qs.filter(Q(status=ReconciliationStatus.PENDING) | Q(is_flagged=True)).count()},
        source="PaymentReconciliation",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason="No reconciliation rows." if not rows else None,
        ignored_filters=flt.ignored_filters,
    )


def build_overdue_aging_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    pressure = _build_receivables_pressure(_window_from_filter(flt))
    return build_chart_payload(
        labels=[row["label"] for row in pressure["aging"]],
        series=[{"name": "amount", "data": [row["amount"] for row in pressure["aging"]]}],
        totals={"overdue_amount": pressure["overdue_amount"], "overdue_count": pressure["overdue_count"]},
        source="Emi",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason=None,
        ignored_filters=flt.ignored_filters,
    )


def build_revenue_trend_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    trend = _build_collections_trend(_window_from_filter(flt))
    return build_chart_payload(
        labels=[row["date"] for row in trend["points"]],
        series=[{"name": "net_amount", "data": [row["net_amount"] for row in trend["points"]]}],
        totals=trend["summary"],
        source="Payment",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason="No collection trend rows." if not trend["points"] else None,
        ignored_filters=flt.ignored_filters,
    )


def build_collection_trend_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    return build_revenue_trend_report(flt=flt, actor_user=actor_user)


def build_product_demand_analysis_report(*, flt: Phase5Filter, actor_user=None) -> dict:
    rows = (
        _apply_common_subscription_filters(Subscription.objects.all(), flt)
        .values("product_id", "product__name")
        .annotate(contract_count=Count("id"), contract_value=Coalesce(Sum("total_amount"), Value(Decimal("0.00"))))
        .order_by("-contract_count")[:50]
    )
    labels = [row["product__name"] or f"PRODUCT-{row['product_id']}" for row in rows]
    return build_chart_payload(
        labels=labels,
        series=[{"name": "contract_count", "data": [row["contract_count"] for row in rows]}],
        totals={"product_count": len(rows)},
        source="Subscription",
        date_from=flt.date_from,
        date_to=flt.date_to,
        empty_reason="No product demand rows." if not rows else None,
        ignored_filters=flt.ignored_filters,
    )

