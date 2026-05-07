from decimal import Decimal

from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from api.v1.serializers.dashboard_surfaces import DashboardWindowQuerySerializer
from core.services.operational_visibility import (
    subscription_collectible_q,
    subscription_dashboard_visible_q,
)
from subscriptions.services.admin_reporting_analytics_service import (
    build_admin_reporting_analytics_summary,
)
from subscriptions.services.dashboard_canonical_financial_summary_service import (
    resolve_dashboard_window,
)
from subscriptions.models import (
    Batch,
    Commission,
    Emi,
    EmiStatus,
    Payment,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.subscription_financial_service import (
    build_reconciliation_attention_payload,
)
from subscriptions.services.winner_state_service import winner_history_q


class AdminRevenueAggregateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        today = timezone.now().date()
        totals = Payment.objects.aggregate(
            total_revenue=Coalesce(Sum("amount"), Value(Decimal("0.00"))),
        )

        by_method = (
            Payment.objects.values("method")
            .annotate(count=Count("id"), amount=Coalesce(Sum("amount"), Value(Decimal("0.00"))))
            .order_by("method")
        )

        return Response(
            {
                "total_revenue": str(totals["total_revenue"]),
                "today_collection": str(
                    Payment.objects.filter(payment_date=today).aggregate(
                        total=Coalesce(Sum("amount"), Value(Decimal("0.00")))
                    )["total"]
                ),
                "by_method": [
                    {
                        "method": row["method"],
                        "count": row["count"],
                        "amount": str(row["amount"]),
                    }
                    for row in by_method
                ],
            }
        )


class AdminEmiAggregateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        today = timezone.now().date()
        pending = Emi.objects.filter(status=EmiStatus.PENDING).filter(
            subscription_collectible_q("subscription__")
        )
        overdue = pending.filter(due_date__lt=today)

        return Response(
            {
                "pending_count": pending.count(),
                "pending_amount": str(
                    pending.aggregate(
                        total=Coalesce(Sum("amount"), Value(Decimal("0.00")))
                    )["total"]
                ),
                "overdue_count": overdue.count(),
                "overdue_amount": str(
                    overdue.aggregate(
                        total=Coalesce(Sum("amount"), Value(Decimal("0.00")))
                    )["total"]
                ),
            }
        )


class AdminBatchPerformanceAggregateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        batches = (
            Batch.objects
            .annotate(
                subscription_count=Count("subscriptions", distinct=True),
                won_count=Count(
                    "subscriptions",
                    filter=winner_history_q("subscriptions"),
                    distinct=True,
                ),
                draw_count=Count("lucky_draws", distinct=True),
            )
            .order_by("id")
            .values("id", "batch_code", "subscription_count", "won_count", "draw_count")
        )

        items = []
        for batch in batches:
            subscription_count = batch["subscription_count"]
            won_count = batch["won_count"]
            win_rate = (won_count / subscription_count * 100) if subscription_count else 0
            items.append(
                {
                    "batch_id": batch["id"],
                    "batch_code": batch["batch_code"],
                    "subscription_count": subscription_count,
                    "won_count": won_count,
                    "draw_count": batch["draw_count"],
                    "win_rate": round(win_rate, 2),
                }
            )

        return Response({"results": items, "count": len(items)})


class AdminReconciliationAttentionAggregateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        subscriptions = Subscription.objects.filter(subscription_dashboard_visible_q())
        return Response(build_reconciliation_attention_payload(subscriptions))


class AdminPartnerAggregateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        rows = []
        for partner_id in Subscription.objects.exclude(
            partner__isnull=True
        ).filter(subscription_dashboard_visible_q()).values_list("partner_id", flat=True).distinct():
            sub_qs = Subscription.objects.filter(partner_id=partner_id).filter(
                subscription_dashboard_visible_q()
            )
            pay_qs = Payment.objects.filter(subscription__partner_id=partner_id)
            commission_qs = Commission.objects.filter(partner_id=partner_id)

            rows.append(
                {
                    "partner_id": partner_id,
                    "subscription_count": sub_qs.count(),
                    "active_subscription_count": sub_qs.filter(
                        status=SubscriptionStatus.ACTIVE
                    ).count(),
                    "total_collected": str(
                        pay_qs.aggregate(
                            total=Coalesce(Sum("amount"), Value(Decimal("0.00")))
                        )["total"]
                    ),
                    "commission_total": str(
                        commission_qs.aggregate(
                            total=Coalesce(Sum("commission_amount"), Value(Decimal("0.00")))
                        )["total"]
                    ),
                    "commission_paid": str(
                        commission_qs.filter(status="PAID").aggregate(
                            total=Coalesce(Sum("commission_amount"), Value(Decimal("0.00")))
                        )["total"]
                    ),
                }
            )

        return Response({"results": rows, "count": len(rows)})


class AdminRevenueSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        totals = Payment.objects.aggregate(
            total_payments=Count("id"),
            total_amount=Coalesce(Sum("amount"), Value(Decimal("0.00"))),
        )
        by_method = (
            Payment.objects.values("method")
            .annotate(total=Coalesce(Sum("amount"), Value(Decimal("0.00"))))
            .order_by("method")
        )

        method_totals = {row["method"].lower(): str(row["total"]) for row in by_method}
        return Response(
            {
                "total_payments": totals["total_payments"],
                "total_amount": str(totals["total_amount"]),
                "by_method": {
                    "cash": method_totals.get("cash", "0.00"),
                    "upi": method_totals.get("upi", "0.00"),
                    "bank": method_totals.get("bank", "0.00"),
                },
            }
        )


class AdminEmiSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        today = timezone.now().date()
        summary = Emi.objects.filter(
            subscription_collectible_q("subscription__")
        ).aggregate(
            total_emis=Count("id"),
            pending_count=Count("id", filter=Q(status=EmiStatus.PENDING)),
            pending_amount=Coalesce(
                Sum("amount", filter=Q(status=EmiStatus.PENDING)),
                Value(Decimal("0.00")),
            ),
            overdue_count=Count(
                "id",
                filter=Q(status=EmiStatus.PENDING, due_date__lt=today),
            ),
            overdue_amount=Coalesce(
                Sum("amount", filter=Q(status=EmiStatus.PENDING, due_date__lt=today)),
                Value(Decimal("0.00")),
            ),
        )
        return Response(
            {
                "total_emis": summary["total_emis"],
                "pending_count": summary["pending_count"],
                "pending_amount": str(summary["pending_amount"]),
                "overdue_count": summary["overdue_count"],
                "overdue_amount": str(summary["overdue_amount"]),
            }
        )


class AdminBatchPerformanceSummaryView(AdminBatchPerformanceAggregateView):
    """Alias endpoint with the Phase-7B response contract."""


class AdminAnalyticsSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        serializer = DashboardWindowQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        window_params = resolve_dashboard_window(**serializer.validated_data)

        return Response(
            build_admin_reporting_analytics_summary(
                actor_user=request.user,
                window_params=window_params,
            )
        )
