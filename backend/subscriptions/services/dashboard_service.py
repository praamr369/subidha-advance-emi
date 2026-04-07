from django.db.models import Sum, Count
from django.utils import timezone
from decimal import Decimal

from subscriptions.models import (
    Subscription,
    SubscriptionStatus,
    Emi,
    EmiStatus,
    Payment,
    Commission,
    LuckyDraw,
)
from subscriptions.services.winner_state_service import winner_history_q


def executive_dashboard_summary():

    total_revenue = (
        Payment.objects.aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )

    active_subscriptions = Subscription.objects.filter(
        status=SubscriptionStatus.ACTIVE
    ).count()

    won_subscriptions = Subscription.objects.filter(winner_history_q()).distinct().count()

    completed_subscriptions = Subscription.objects.filter(
        status=SubscriptionStatus.COMPLETED
    ).count()

    pending_emis = Emi.objects.filter(
        status=EmiStatus.PENDING
    ).count()

    overdue_emis = Emi.objects.filter(
        status=EmiStatus.PENDING,
        due_date__lt=timezone.now().date()
    ).count()

    total_commission_pending = (
        Commission.objects.filter(status="PENDING")
        .aggregate(total=Sum("commission_amount"))["total"]
        or Decimal("0.00")
    )

    last_draw = LuckyDraw.objects.filter(
        is_revealed=True
    ).order_by("-draw_date").first()

    return {
        "total_revenue_collected": total_revenue,
        "active_subscriptions": active_subscriptions,
        "won_subscriptions": won_subscriptions,
        "completed_subscriptions": completed_subscriptions,
        "pending_emis": pending_emis,
        "overdue_emis": overdue_emis,
        "pending_commission_liability": total_commission_pending,
        "last_draw_date": last_draw.draw_date if last_draw else None,
    }
