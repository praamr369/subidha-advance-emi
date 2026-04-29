from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from accounting.services.hr_workspace_service import get_hr_summary
from api.v1.services.admin_dashboard_service import build_admin_dashboard
from inventory.services.stock_service import build_stock_summary
from subscriptions.services.admin_operations_queue_service import build_admin_queue_summary
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


def explain_bi_summary(user, scope: str = "ADMIN_BI", window: str = "THIS_MONTH") -> dict:
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

