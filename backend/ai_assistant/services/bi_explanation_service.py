from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from accounting.services.hr_workspace_service import get_hr_summary
from api.v1.services.admin_dashboard_service import build_admin_dashboard
from inventory.services.stock_service import build_stock_summary
from subscriptions.services.admin_operations_queue_service import build_admin_queue_summary
from subscriptions.services.business_intelligence_service import build_business_intelligence_payload
from subscriptions.services.phase5_control_center_service import build_accounting_deposit_liability
from subscriptions.services.phase5_filter_service import AdminReportFilter


FOLLOW_UP_LINKS: dict[str, str] = {
    "OVERDUE_PAYMENTS": "/admin/emis/overdue",
    "RECONCILIATION_PENDING": "/admin/finance/reconciliation",
    "DEPOSITS_HELD": "/admin/finance/deposits",
    "LOW_STOCK": "/admin/inventory/stock-on-hand?below_reorder=1",
    "DELIVERY_BLOCKED": "/admin/deliveries?status=BLOCKED",
    "PENDING_LEAVE": "/admin/hr/leave",
    "PAYROLL_PENDING": "/admin/hr/payroll",
    "SUBSCRIPTION_REQUESTS_PENDING": "/admin/subscription-requests",
    "OPEN_LEADS": "/admin/leads",
    "PARTNER_PAYMENT_REQUESTS_PENDING": "/admin/partner-payment-requests",
}


def _to_decimal(value: object) -> Decimal:
    try:
        return Decimal(str(value or "0"))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def _window_dates(window: str) -> tuple[date, date]:
    today = timezone.localdate()
    if window == "TODAY":
        return today, today
    if window == "THIS_WEEK":
        start = today - timedelta(days=today.weekday())
        return start, today
    if window == "LAST_MONTH":
        first_this_month = today.replace(day=1)
        end_last_month = first_this_month - timedelta(days=1)
        start_last_month = end_last_month.replace(day=1)
        return start_last_month, end_last_month
    # THIS_MONTH and default
    return today.replace(day=1), today


def _filter_for_window(window: str) -> AdminReportFilter:
    date_from, date_to = _window_dates(window)
    return AdminReportFilter(
        date_from=date_from,
        date_to=date_to,
        contract_type="",
        payment_method="",
        status="",
        partner_id=None,
        product_id=None,
        category_id=None,
        customer_id=None,
        branch_id=None,
        overdue_only=False,
        unreconciled_only=False,
        ignored_filters=[],
    )


def _queue_count(queue_summary: dict, key: str) -> int:
    for row in queue_summary.get("results", []):
        if row.get("key") == key:
            return int(row.get("count") or 0)
    return 0


def _phase10_explanation(*, scope: str, window: str, topic: str) -> dict:
    flt = _filter_for_window(window)
    payload = build_business_intelligence_payload(flt=flt)
    profitability = payload["profitability"]["summary"]
    cashflow = payload["cashflow"]["summary"]
    customers = payload["customer_insights"]["summary"]
    batches = payload["batch_performance"]["rows"]
    high_risk_batches = sorted(
        batches,
        key=lambda row: (Decimal(str(row.get("default_rate") or "0")), int(row.get("overdue_emi_count") or 0)),
        reverse=True,
    )
    riskiest_batch = high_risk_batches[0] if high_risk_batches else None
    comparison = payload["comparisons"]["actual_inflow"]

    highlights: list[dict] = []
    risks: list[dict] = []
    follow_up: list[dict] = []
    source_metrics: list[dict] = [
        {
            "key": "current_actual_inflow",
            "label": "Current Actual Inflow",
            "value": comparison["current"],
            "source": "/api/v1/admin/bi/insights/",
        },
        {
            "key": "previous_actual_inflow",
            "label": "Previous Actual Inflow",
            "value": comparison["previous"],
            "source": "/api/v1/admin/bi/insights/",
        },
        {
            "key": "inflow_delta",
            "label": "Inflow Delta",
            "value": comparison["delta"],
            "source": "/api/v1/admin/bi/insights/",
        },
        {
            "key": "overdue_exposure",
            "label": "Overdue Exposure",
            "value": cashflow["overdue_exposure"],
            "source": "/api/v1/admin/bi/cashflow/",
        },
    ]

    if topic == "REVENUE_DROP":
        delta = _to_decimal(comparison["delta"])
        if delta < 0:
            risks.append(
                {
                    "label": "Revenue drop",
                    "message": "Actual inflow is below the previous comparable window.",
                    "severity": "WARNING",
                }
            )
        else:
            highlights.append(
                {
                    "label": "Revenue position",
                    "message": "Actual inflow is not below the previous comparable window.",
                    "severity": "INFO",
                }
            )
        source_metrics.extend(
            [
                {"key": "emi_revenue", "label": "EMI Revenue", "value": profitability["emi_revenue"], "source": "/api/v1/admin/bi/profitability/"},
                {"key": "direct_sale_revenue", "label": "Direct Sale Revenue", "value": profitability["direct_sale_revenue"], "source": "/api/v1/admin/bi/profitability/"},
                {"key": "rent_income", "label": "Rent Income", "value": profitability["rent_income"], "source": "/api/v1/admin/bi/profitability/"},
                {"key": "lease_income", "label": "Lease Income", "value": profitability["lease_income"], "source": "/api/v1/admin/bi/profitability/"},
            ]
        )
        summary = (
            f"Revenue explanation for {window}. Current actual inflow is {comparison['current']} "
            f"versus {comparison['previous']} in the previous comparable window, delta {comparison['delta']}. "
            "The explanation is based on current EMI, direct-sale, rent, and lease income components only; no prediction is used."
        )
        follow_up.append({"label": "Open profitability BI", "href": "/admin/bi/profitability"})
    elif topic == "OVERDUE_INCREASE":
        overdue_amount = _to_decimal(cashflow["overdue_exposure"])
        if overdue_amount > 0:
            risks.append(
                {
                    "label": "Overdue exposure",
                    "message": "Current overdue exposure is above zero and needs collection follow-up.",
                    "severity": "WARNING",
                }
            )
        else:
            highlights.append({"label": "Overdue exposure", "message": "No overdue exposure is visible in the BI snapshot.", "severity": "INFO"})
        source_metrics.extend(
            [
                {
                    "key": "high_overdue_customers",
                    "label": "High Overdue Customers",
                    "value": customers["high_overdue_customers"],
                    "source": "/api/v1/admin/bi/customer-insights/",
                },
                {
                    "key": "churn_risk_customers",
                    "label": "Churn Risk Customers",
                    "value": customers["churn_risk_customers"],
                    "source": "/api/v1/admin/bi/customer-insights/",
                },
            ]
        )
        summary = (
            f"Overdue explanation for {window}. Overdue exposure is {cashflow['overdue_exposure']}; "
            f"{customers['high_overdue_customers']} high-overdue customers and {customers['churn_risk_customers']} churn-risk customers are visible. "
            "This is a current-state explanation, not a forecast."
        )
        follow_up.append({"label": "Open cashflow BI", "href": "/admin/bi/cashflow"})
    elif topic == "RISKY_BATCH":
        if riskiest_batch:
            if riskiest_batch["risk_level"] == "HIGH":
                risks.append(
                    {
                        "label": "Risky batch",
                        "message": f"{riskiest_batch['batch_code']} has the highest current default rate.",
                        "severity": "WARNING",
                    }
                )
            else:
                highlights.append(
                    {
                        "label": "Batch risk",
                        "message": f"{riskiest_batch['batch_code']} is the highest-risk batch, but it is not currently HIGH risk.",
                        "severity": "INFO",
                    }
                )
            source_metrics.extend(
                [
                    {"key": "batch_code", "label": "Batch", "value": riskiest_batch["batch_code"], "source": "/api/v1/admin/bi/batch-performance/"},
                    {"key": "default_rate", "label": "Default Rate", "value": riskiest_batch["default_rate"], "source": "/api/v1/admin/bi/batch-performance/"},
                    {"key": "payment_discipline", "label": "Payment Discipline", "value": riskiest_batch["payment_discipline"], "source": "/api/v1/admin/bi/batch-performance/"},
                ]
            )
            summary = (
                f"Batch risk explanation for {window}. {riskiest_batch['batch_code']} is currently the highest-risk batch "
                f"with default rate {riskiest_batch['default_rate']}% and payment discipline {riskiest_batch['payment_discipline']}%. "
                "This is based only on current due EMI and draw completion data."
            )
        else:
            highlights.append({"label": "Batch risk", "message": "No batch performance rows are available.", "severity": "INFO"})
            summary = f"Batch risk explanation for {window}. No batch rows are available for the selected BI window."
        follow_up.append({"label": "Open batch BI", "href": "/admin/bi/batches"})
    else:
        highlights.append({"label": "BI summary", "message": "Phase 10 BI snapshot is available for owner/admin review.", "severity": "INFO"})
        summary = (
            f"BI summary for {scope} in {window}. Gross income is {profitability['gross_income']}, "
            f"window inflow is {cashflow['window_inflow']}, overdue exposure is {cashflow['overdue_exposure']}, "
            f"and high-risk batches count is {payload['batch_performance']['summary']['high_risk_batches']}."
        )
        follow_up.append({"label": "Open BI Control Center", "href": "/admin/bi"})

    if not highlights and not risks:
        highlights.append({"label": "BI explanation", "message": "No exception was detected for the selected explanation topic.", "severity": "INFO"})

    return {
        "summary": summary,
        "highlights": highlights,
        "risks": risks,
        "follow_up": follow_up,
        "source_metrics": source_metrics,
        "generated_at": timezone.now().isoformat(),
        "safety": {
            "read_only": True,
            "actions_executed": False,
            "financial_actions_enabled": False,
            "automation_enabled": False,
        },
    }


def explain_bi_summary(user, scope: str = "ADMIN_BI", window: str = "THIS_MONTH", topic: str = "SUMMARY") -> dict:
    phase10_scopes = {"PROFITABILITY", "CUSTOMER_INSIGHTS", "BATCH_PERFORMANCE", "CASHFLOW", "INVENTORY_INTELLIGENCE", "HR_COSTS"}
    if topic != "SUMMARY" or scope in phase10_scopes:
        return _phase10_explanation(scope=scope, window=window, topic=topic)

    flt = _filter_for_window(window)
    now = timezone.now()
    dashboard = build_admin_dashboard(actor_user=user)
    queue_summary = build_admin_queue_summary()
    hr_summary = get_hr_summary()
    stock_summary = build_stock_summary()
    deposit_liability = build_accounting_deposit_liability(flt=flt)

    overdue = int((dashboard.get("emi") or {}).get("overdue") or 0)
    unreconciled = _queue_count(queue_summary, "reconciliation_pending")
    deposits_held = _to_decimal(deposit_liability.get("held_total"))
    low_stock = sum(1 for row in stock_summary.get("results", []) if row.get("is_below_reorder"))
    reserved_stock = 0
    delivery_blocked = _queue_count(queue_summary, "delivery_blocked")
    pending_leave = int(hr_summary.get("pending_leave_requests") or 0)
    payroll_pending = int(hr_summary.get("payroll_pending") or 0)
    overdue_emi = overdue
    pending_requests = _queue_count(queue_summary, "subscription_requests_pending")
    open_leads = int((dashboard.get("crm") or {}).get("open_leads") or 0)
    partner_pending = _queue_count(queue_summary, "partner_payment_requests_pending")
    today_collection = _to_decimal((dashboard.get("financial") or {}).get("today_collection"))

    highlights: list[dict] = []
    risks: list[dict] = []
    follow_up: list[dict] = []

    # Deterministic rules for Phase 8F
    if overdue > 0:
        risks.append(
            {
                "label": "Overdue payments",
                "message": "There are overdue amounts that need collection follow-up.",
                "severity": "WARNING",
            }
        )
        follow_up.append({"label": "Open overdue EMI queue", "href": FOLLOW_UP_LINKS["OVERDUE_PAYMENTS"]})
    else:
        highlights.append({"label": "Overdue payments", "message": "No overdue EMI items in the selected window.", "severity": "INFO"})

    if unreconciled > 0:
        risks.append(
            {
                "label": "Reconciliation",
                "message": "Some payments need reconciliation review.",
                "severity": "WARNING",
            }
        )
        follow_up.append({"label": "Open reconciliation queue", "href": FOLLOW_UP_LINKS["RECONCILIATION_PENDING"]})

    if deposits_held > 0:
        highlights.append(
            {
                "label": "Deposits held",
                "message": "Rent/lease deposits are held as refundable liabilities.",
                "severity": "INFO",
            }
        )
        follow_up.append({"label": "Review deposits", "href": FOLLOW_UP_LINKS["DEPOSITS_HELD"]})

    if low_stock > 0:
        risks.append(
            {
                "label": "Low stock",
                "message": "Some products need stock attention.",
                "severity": "WARNING",
            }
        )
        follow_up.append({"label": "Open low stock view", "href": FOLLOW_UP_LINKS["LOW_STOCK"]})

    if reserved_stock > 0:
        highlights.append(
            {
                "label": "Reserved stock",
                "message": "Some stock is already reserved for contracts or deliveries.",
                "severity": "INFO",
            }
        )

    if delivery_blocked > 0:
        risks.append(
            {
                "label": "Blocked deliveries",
                "message": "Some deliveries are blocked and need operational review.",
                "severity": "WARNING",
            }
        )
        follow_up.append({"label": "Open blocked deliveries", "href": FOLLOW_UP_LINKS["DELIVERY_BLOCKED"]})

    if pending_leave > 0:
        risks.append({"label": "Leave approvals", "message": "Leave requests need approval.", "severity": "WARNING"})
        follow_up.append({"label": "Open leave requests", "href": FOLLOW_UP_LINKS["PENDING_LEAVE"]})

    if payroll_pending > 0:
        risks.append({"label": "Payroll", "message": "Payroll items need review.", "severity": "WARNING"})
        follow_up.append({"label": "Open payroll", "href": FOLLOW_UP_LINKS["PAYROLL_PENDING"]})

    if overdue_emi > 0:
        highlights.append({"label": "EMI follow-up", "message": "Advance EMI follow-up is needed.", "severity": "INFO"})

    if pending_requests > 0:
        risks.append(
            {
                "label": "Subscription requests",
                "message": "Subscription requests are waiting for admin review.",
                "severity": "WARNING",
            }
        )
        follow_up.append({"label": "Open subscription requests", "href": FOLLOW_UP_LINKS["SUBSCRIPTION_REQUESTS_PENDING"]})

    if open_leads > 0:
        highlights.append({"label": "Open leads", "message": "CRM follow-up opportunities are pending.", "severity": "INFO"})
        follow_up.append({"label": "Open leads", "href": FOLLOW_UP_LINKS["OPEN_LEADS"]})

    if partner_pending > 0:
        risks.append({"label": "Partner queue", "message": "Partner payment requests are pending review.", "severity": "WARNING"})
        follow_up.append({"label": "Open partner requests", "href": FOLLOW_UP_LINKS["PARTNER_PAYMENT_REQUESTS_PENDING"]})

    if not highlights:
        highlights.append({"label": "Collections", "message": "Collections posture is stable for the selected BI window.", "severity": "INFO"})

    summary = (
        f"BI explanation for {scope} in {window}. "
        f"Today collection is {today_collection}, overdue EMI count is {overdue}, "
        f"reconciliation pending is {unreconciled}, and low stock items are {low_stock}."
    )

    source_metrics = [
        {"key": "today_collection", "label": "Today Collection", "value": str(today_collection), "source": "/api/v1/admin/dashboard/"},
        {"key": "overdue_emi", "label": "Overdue EMI", "value": overdue, "source": "/api/v1/admin/dashboard/"},
        {"key": "reconciliation_pending", "label": "Reconciliation Pending", "value": unreconciled, "source": "/api/v1/admin/operations/queue-summary/"},
        {"key": "deposits_held", "label": "Deposits Held", "value": str(deposits_held), "source": "/api/v1/admin/accounting/deposit-liability/"},
        {"key": "low_stock", "label": "Low Stock Items", "value": low_stock, "source": "/api/v1/inventory/stock-summary/"},
        {"key": "reserved_stock", "label": "Reserved Stock", "value": reserved_stock, "source": "/api/v1/inventory/stock-summary/"},
        {"key": "delivery_blocked", "label": "Blocked Deliveries", "value": delivery_blocked, "source": "/api/v1/admin/operations/queue-summary/"},
        {"key": "pending_leave", "label": "Pending Leave Requests", "value": pending_leave, "source": "/api/v1/admin/hr/summary/"},
        {"key": "payroll_pending", "label": "Payroll Pending", "value": payroll_pending, "source": "/api/v1/admin/hr/summary/"},
        {"key": "pending_subscription_requests", "label": "Pending Subscription Requests", "value": pending_requests, "source": "/api/v1/admin/operations/queue-summary/"},
        {"key": "open_leads", "label": "Open Leads", "value": open_leads, "source": "/api/v1/admin/dashboard/"},
        {"key": "partner_payment_requests_pending", "label": "Partner Payment Requests Pending", "value": partner_pending, "source": "/api/v1/admin/operations/queue-summary/"},
    ]

    return {
        "summary": summary,
        "highlights": highlights,
        "risks": risks,
        "follow_up": follow_up,
        "source_metrics": source_metrics,
        "generated_at": now.isoformat(),
        "safety": {
            "read_only": True,
            "actions_executed": False,
        },
    }
