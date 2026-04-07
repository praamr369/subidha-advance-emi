from __future__ import annotations

from subscriptions.models import Subscription, SubscriptionStatus
from subscriptions.services.winner_state_service import winner_history_q


def get_subscription_counts() -> dict:
    return {
        "total": Subscription.objects.count(),
        "active": Subscription.objects.filter(status=SubscriptionStatus.ACTIVE).count(),
        "won": Subscription.objects.filter(winner_history_q()).distinct().count(),
    }
