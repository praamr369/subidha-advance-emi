from __future__ import annotations

from django.db.models import Count

from subscriptions.models import Subscription, SubscriptionStatus


def get_subscription_counts() -> dict:
    return {
        "total": Subscription.objects.count(),
        "active": Subscription.objects.filter(status=SubscriptionStatus.ACTIVE).count(),
        "won": Subscription.objects.filter(status=SubscriptionStatus.WON).count(),
    }

