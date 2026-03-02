from django.urls import path
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from subscriptions.models import Batch, Subscription, LuckyDraw


class PublicStatsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        total_batches = Batch.objects.count()
        total_subscriptions = Subscription.objects.count()
        active_subscriptions = Subscription.objects.filter(
            status="ACTIVE"
        ).count()
        total_winners = Subscription.objects.filter(
            status="WON"
        ).count()

        return Response({
            "total_batches": total_batches,
            "total_subscriptions": total_subscriptions,
            "active_subscriptions": active_subscriptions,
            "total_winners": total_winners,
        })







from subscriptions.models import LuckyDraw, Subscription


class LatestWinnerView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        latest = (
            LuckyDraw.objects
            .filter(is_revealed=True)
            .select_related("batch", "winner_lucky_id")
            .order_by("-draw_date")
            .first()
        )

        if not latest:
            return Response({"winner": None})

        lucky = latest.winner_lucky_id

        subscription = lucky.subscription_set.select_related("customer").first()
        if not subscription:
            return Response({"winner": None})

        return Response({
            "winner": {
                "lucky_id": f"{lucky.lucky_number:02d}",
                "customer_name": subscription.customer.name,
                "batch": latest.batch.batch_code,   # ✅ corrected
                "month": latest.draw_month,
                "draw_date": latest.draw_date,
            }
        })

urlpatterns = [
    path("stats/", PublicStatsView.as_view(), name="public-stats"),
    path("latest-winner/", LatestWinnerView.as_view(), name="latest-winner"),  # 👈 THIS LINE
]