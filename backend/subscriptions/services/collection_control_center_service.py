from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Sum
from django.utils import timezone

from accounting.models import FinanceAccount
from accounting.services.finance_account_readiness import finance_account_readiness
from billing.models import DirectSale
from branch_control.services.branch_service import scope_queryset_to_user_branches
from core.services.operational_visibility import invoice_active_q
from subscriptions.models import Emi, EmiStatus, Payment, RentLeaseBillingDemand, RentLeaseDemandStatus

MONEY_ZERO = Decimal("0.00")


def _money(value) -> str:
    try:
        return f"{Decimal(str(value or MONEY_ZERO)):.2f}"
    except Exception:
        return "0.00"


def _sum(queryset, field: str) -> Decimal:
    return queryset.aggregate(total=Sum(field))["total"] or MONEY_ZERO


def _branch_scope(queryset, *, user, field_name: str):
    return scope_queryset_to_user_branches(queryset, user=user, field_name=field_name)


def _finance_accounts(*, user, cashier_safe: bool) -> tuple[list[dict[str, Any]], dict[str, int]]:
    queryset = FinanceAccount.objects.select_related("chart_account", "branch").filter(is_active=True)
    if cashier_safe:
        queryset = _branch_scope(queryset, user=user, field_name="branch_id")

    counts = {
        "active_count": 0,
        "ready_count": 0,
        "blocked_count": 0,
        "cash_ready_count": 0,
        "bank_ready_count": 0,
        "upi_ready_count": 0,
    }
    rows: list[dict[str, Any]] = []

    for account in queryset.order_by("kind", "name", "id"):
        readiness = finance_account_readiness(account)
        chart = account.chart_account
        counts["active_count"] += 1
        if readiness.collection_ready:
            counts["ready_count"] += 1
            if account.kind == "CASH":
                counts["cash_ready_count"] += 1
            elif account.kind == "BANK":
                counts["bank_ready_count"] += 1
            elif account.kind == "UPI":
                counts["upi_ready_count"] += 1
        else:
            counts["blocked_count"] += 1

        rows.append(
            {
                "id": account.id,
                "name": account.name,
                "kind": account.kind,
                "branch_id": account.branch_id,
                "branch_name": getattr(account.branch, "name", None) if account.branch_id else None,
                "mapped_chart_account": {
                    "id": chart.id,
                    "code": chart.code,
                    "name": chart.name,
                    "account_type": chart.account_type,
                    "is_active": chart.is_active,
                    "allow_manual_posting": chart.allow_manual_posting,
                },
                "collection_ready": readiness.collection_ready,
                "collection_blocker_reason": readiness.collection_blocker_reason,
                "recommended_action": readiness.recommended_action,
            }
        )

    return rows, counts


def _recent_payments(*, user, cashier_safe: bool) -> list[dict[str, Any]]:
    queryset = Payment.objects.select_related("customer", "subscription", "emi", "finance_account")
    if cashier_safe:
        queryset = _branch_scope(queryset, user=user, field_name="branch_id")

    return [
        {
            "id": payment.id,
            "payment_date": payment.payment_date,
            "amount": _money(payment.amount),
            "method": payment.method,
            "reference_no": payment.reference_no,
            "customer_name": getattr(payment.customer, "name", None),
            "subscription_id": payment.subscription_id,
            "subscription_number": getattr(payment.subscription, "subscription_number", None),
            "emi_id": payment.emi_id,
            "emi_month_no": getattr(payment.emi, "month_no", None) if payment.emi_id else None,
            "finance_account_name": getattr(payment.finance_account, "name", None) if payment.finance_account_id else None,
        }
        for payment in queryset.order_by("-payment_date", "-id")[:10]
    ]


def build_collection_control_center_payload(*, user, role: str) -> dict[str, Any]:
    cashier_safe = (role or "").lower() == "cashier"
    today = timezone.localdate()

    emis = Emi.objects.select_related("subscription", "subscription__customer").filter(status=EmiStatus.PENDING)
    if cashier_safe:
        emis = _branch_scope(emis, user=user, field_name="subscription__branch_id")

    direct_sales = (
        DirectSale.objects.filter(status="INVOICED", balance_total__gt=MONEY_ZERO)
        .filter(invoice_active_q(prefix="billing_invoices__"))
        .filter(billing_invoices__status="POSTED")
        .distinct()
    )
    if cashier_safe:
        direct_sales = _branch_scope(direct_sales, user=user, field_name="branch_id")

    rent_lease = RentLeaseBillingDemand.objects.select_related("subscription").filter(
        status__in=[
            RentLeaseDemandStatus.PENDING,
            RentLeaseDemandStatus.PARTIAL,
            RentLeaseDemandStatus.OVERDUE,
        ]
    )
    if cashier_safe:
        rent_lease = _branch_scope(rent_lease, user=user, field_name="subscription__branch_id")

    accounts, account_counts = _finance_accounts(user=user, cashier_safe=cashier_safe)
    rent_lease_due = max(_sum(rent_lease, "amount") - _sum(rent_lease, "collected_amount"), MONEY_ZERO)

    routes = (
        {
            "collection_center": "/cashier/collections/control-center",
            "advance_emi_collect": "/cashier/collect",
            "direct_sale_collect": "/cashier/collect?workflow=direct-sale",
            "payment_history": "/cashier/payments",
            "accounting_setup": None,
        }
        if cashier_safe
        else {
            "collection_center": "/admin/collections/control-center",
            "advance_emi_collect": "/admin/finance/collect?workflow=advance-emi",
            "direct_sale_collect": "/admin/finance/collect?workflow=direct-sale",
            "unified_search": "/admin/finance/collect?workflow=unified",
            "payment_history": "/admin/payments",
            "accounting_setup": "/admin/accounting/setup",
            "reconciliation": "/admin/finance/reconciliation",
        }
    )

    return {
        "role": "cashier" if cashier_safe else "admin",
        "read_only": True,
        "summary": {
            "due_today_count": emis.filter(due_date=today).count(),
            "overdue_count": emis.filter(due_date__lt=today).count(),
            "pending_emi_count": emis.count(),
            "pending_emi_amount": _money(_sum(emis, "amount")),
            "direct_sale_outstanding_count": direct_sales.count(),
            "direct_sale_outstanding_amount": _money(_sum(direct_sales, "balance_total")),
            "rent_lease_due_count": rent_lease.count(),
            "rent_lease_due_amount": _money(rent_lease_due),
            "blocked_finance_account_count": account_counts["blocked_count"],
            "ready_finance_account_count": account_counts["ready_count"],
            "pending_receipt_count": None,
            "unreconciled_collection_count": None,
        },
        "finance_account_readiness": {"counts": account_counts, "accounts": accounts},
        "collection_lanes": [
            {"key": "advance_emi", "label": "Advance EMI collection", "enabled": True, "route": routes["advance_emi_collect"]},
            {"key": "direct_sale", "label": "Direct-sale collection", "enabled": True, "route": routes["direct_sale_collect"]},
            {"key": "rent_lease", "label": "Rent/lease collection", "enabled": False, "route": None},
            {"key": "customer_advance", "label": "Customer advance", "enabled": True, "route": routes["advance_emi_collect"]},
        ],
        "route_hints": routes,
        "recent_collections": _recent_payments(user=user, cashier_safe=cashier_safe),
    }
