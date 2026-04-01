from decimal import Decimal

from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.permissions import IsAdmin
from subscriptions.models import (
    Batch,
    Commission,
    Emi,
    EmiStatus,
    Payment,
    Subscription,
    SubscriptionStatus,
)


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
        pending = Emi.objects.filter(status=EmiStatus.PENDING)
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
                    filter=Q(subscriptions__status=SubscriptionStatus.WON),
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
        subscriptions = (
            Subscription.objects
            .select_related("customer")
            .prefetch_related("emis", "payments")
        )
        checked = 0
        flagged = []

        for item in subscriptions.iterator(chunk_size=200):
            checked += 1
            paid = item.payments.aggregate(
                total=Coalesce(Sum("amount"), Value(Decimal("0.00")))
            )["total"]
            waived = item.emis.filter(status=EmiStatus.WAIVED).aggregate(
                total=Coalesce(Sum("amount"), Value(Decimal("0.00")))
            )["total"]
            pending_outstanding = item.emis.filter(status=EmiStatus.PENDING).aggregate(
                total=Coalesce(Sum("amount"), Value(Decimal("0.00")))
            )["total"]

            computed = item.total_amount - paid - waived
            delta = abs(computed - pending_outstanding)

            if delta > Decimal("0.01"):
                flagged.append(
                    {
                        "subscription_id": item.id,
                        "customer_name": item.customer.name,
                        "total_amount": str(item.total_amount),
                        "paid_amount": str(paid),
                        "waived_amount": str(waived),
                        "pending_outstanding": str(pending_outstanding),
                        "computed_outstanding": str(computed),
                        "delta": str(delta),
                    }
                )

        return Response(
            {
                "checked_count": checked,
                "flagged_count": len(flagged),
                "results": flagged,
            }
        )


class AdminPartnerAggregateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        rows = []
        for partner_id in Subscription.objects.exclude(
            partner__isnull=True
        ).values_list("partner_id", flat=True).distinct():
            sub_qs = Subscription.objects.filter(partner_id=partner_id)
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
        summary = Emi.objects.aggregate(
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