from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.services.admin_erp_service import build_admin_erp_summary
from subscriptions.services.admin_operations_queue_service import build_admin_queue_summary
from subscriptions.services.phase5_control_center_service import (
    build_accounting_deposit_liability,
    build_accounting_payment_method_split,
    build_accounting_revenue_breakdown,
    build_accounting_waiver_loss,
    build_collection_trend_report,
    build_overdue_aging_report,
    build_product_demand_analysis_report,
)
from subscriptions.services.phase5_filter_service import parse_admin_report_filters
from subscriptions.services.phase5_filter_service import SUPPORTED_FILTERS
from accounting.services.hr_workspace_service import get_hr_summary


class _AdminBase(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


def _chart_payload_from_payment_method_split(*, split: dict, date_from, date_to, ignored_filters) -> dict:
    rows = split.get("rows") or []
    labels = [row.get("method") or "UNKNOWN" for row in rows]
    series = [{"name": "net_amount", "data": [row.get("net_amount") for row in rows]}]
    empty_reason = "No payment method split rows." if not rows else None
    return {
        "labels": labels,
        "series": series,
        "totals": split.get("summary") or {},
        "meta": {
            "source": "Payment",
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "empty_reason": empty_reason,
            "ignored_filters": ignored_filters or [],
        },
    }


class AdminBiSummaryView(_AdminBase):
    """
    BI Control Center snapshot.
    Read-only, admin-only, and composed exclusively from existing authoritative services.
    """

    def get(self, request):
        flt = parse_admin_report_filters(request.query_params, applicable_filters=SUPPORTED_FILTERS)
        now = timezone.now()

        collection_trend = build_collection_trend_report(flt=flt)
        overdue_aging = build_overdue_aging_report(flt=flt)
        product_demand = build_product_demand_analysis_report(flt=flt)
        revenue_breakdown = build_accounting_revenue_breakdown(flt=flt)

        payment_method_split_raw = build_accounting_payment_method_split(flt=flt)
        payment_method_split = _chart_payload_from_payment_method_split(
            split=payment_method_split_raw,
            date_from=flt.date_from,
            date_to=flt.date_to,
            ignored_filters=flt.ignored_filters,
        )

        waiver_loss = build_accounting_waiver_loss(flt=flt)
        deposit_liability = build_accounting_deposit_liability(flt=flt)

        erp_summary = build_admin_erp_summary()
        hr_summary = get_hr_summary()
        ops_queue = build_admin_queue_summary()

        return Response(
            {
                "as_of": now.isoformat(),
                "sources": [
                    {"key": "erp_summary", "path": "/api/v1/admin/erp/summary/"},
                    {"key": "hr_summary", "path": "/api/v1/admin/hr/summary/"},
                    {"key": "operations_queue", "path": "/api/v1/admin/operations/queue-summary/"},
                    {"key": "phase5_reports", "path": "/api/v1/admin/reports/*"},
                    {"key": "accounting_control_center", "path": "/api/v1/admin/accounting/control-center/"},
                ],
                "finance": {
                    "collection_trend": collection_trend,
                    "due_vs_collected": overdue_aging,
                    "overdue_aging": overdue_aging,
                    "payment_method_split": payment_method_split,
                    "waiver_loss_exposure": waiver_loss,
                    "deposit_liability": deposit_liability,
                    "revenue_breakdown": revenue_breakdown,
                },
                "subscriptions": {
                    "product_demand": product_demand,
                    "erp_snapshot": {
                        "today_work": erp_summary.get("today_work", []),
                        "sales_pipeline": erp_summary.get("sales_pipeline", []),
                        "operations_pipeline": erp_summary.get("operations_pipeline", []),
                    },
                },
                "inventory": {
                    "product_demand": product_demand,
                },
                "operations": {
                    "queue_summary": ops_queue,
                },
                "hr": hr_summary,
            }
        )

