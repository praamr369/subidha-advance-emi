from django.core.cache import cache
from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from subscriptions.models import (
    Batch,
    Subscription,
    SubscriptionStatus,
    Payment,
    LuckyDraw,
)
from subscriptions.services.winner_state_service import winner_history_q

CACHE_KEY = "public_stats"
CACHE_TIMEOUT = 60


@api_view(["GET"])
@permission_classes([AllowAny])
def public_stats(request):

    cached = cache.get(CACHE_KEY)
    if cached:
        return Response(cached)

    total_batches = Batch.objects.count()
    total_subscriptions = Subscription.objects.count()

    total_winners = Subscription.objects.filter(winner_history_q()).distinct().count()

    active_subscriptions = Subscription.objects.filter(
        status=SubscriptionStatus.ACTIVE
    ).count()

    total_revenue = Payment.objects.aggregate(
        total=Sum("amount")
    )["total"] or 0

    last_draw = LuckyDraw.objects.filter(
        is_revealed=True
    ).order_by("-draw_date").first()

    next_draw = LuckyDraw.objects.filter(
        is_revealed=False,
        draw_date__gte=timezone.now()
    ).order_by("draw_date").first()

    data = {
        "total_batches": total_batches,
        "total_subscriptions": total_subscriptions,
        "total_winners": total_winners,
        "active_subscriptions": active_subscriptions,
        "total_revenue_collected": total_revenue,
        "last_draw_date": last_draw.draw_date if last_draw else None,
        "next_draw_date": next_draw.draw_date if next_draw else None,
    }

    cache.set(CACHE_KEY, data, CACHE_TIMEOUT)

    return Response(data)
