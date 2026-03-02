from django.utils.timezone import now
from django.db.models import Count, Q
from subscriptions.models import Subscription, EmiStatus, SubscriptionStatus


def evaluate_all_active_subscriptions():

    today = now().date()

    subs = (
        Subscription.objects
        .filter(status=SubscriptionStatus.ACTIVE)
        .annotate(
            overdue_count=Count(
                "emis",
                filter=Q(
                    emis__status=EmiStatus.PENDING,
                    emis__due_date__lt=today
                )
            )
        )
    )

    healthy = subs.filter(overdue_count=0).count()
    at_risk = subs.filter(overdue_count=1).count()
    high_risk = subs.filter(overdue_count__gte=2).count()

    defaulted = Subscription.objects.filter(
        status=SubscriptionStatus.DEFAULTED
    ).count()

    return {
        "healthy": healthy,
        "at_risk": at_risk,
        "high_risk": high_risk,
        "defaulted": defaulted,
    }