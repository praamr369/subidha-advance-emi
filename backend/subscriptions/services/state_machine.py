from django.core.exceptions import ValidationError
from subscriptions.models import SubscriptionStatus


ALLOWED_TRANSITIONS = {
    SubscriptionStatus.ACTIVE: {
        SubscriptionStatus.WON,
        SubscriptionStatus.COMPLETED,
        SubscriptionStatus.DEFAULTED,
    },
    SubscriptionStatus.WON: {
        SubscriptionStatus.COMPLETED,
    },
    SubscriptionStatus.COMPLETED: set(),
    SubscriptionStatus.DEFAULTED: set(),
}


def change_subscription_status(subscription, new_status):
    allowed = ALLOWED_TRANSITIONS.get(subscription.status, set())

    if new_status not in allowed:
        raise ValidationError(
            f"Invalid transition from {subscription.status} to {new_status}"
        )

    subscription.status = new_status
    subscription.save(update_fields=["status"])