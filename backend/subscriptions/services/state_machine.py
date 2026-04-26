from django.core.exceptions import ValidationError
from subscriptions.models import SubscriptionStatus

SS = SubscriptionStatus

# Full Phase 3 lifecycle transitions.
# Terminal states have empty sets (no further transitions allowed).
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    SS.DRAFT: {SS.REQUESTED, SS.PENDING_APPROVAL, SS.APPROVED, SS.CANCELLED},
    SS.REQUESTED: {SS.PENDING_APPROVAL, SS.CANCELLED},
    SS.PENDING_APPROVAL: {SS.APPROVED, SS.CANCELLED},
    SS.APPROVED: {SS.ACTIVE, SS.PAYMENT_PENDING, SS.CANCELLED},
    SS.ACTIVE: {
        SS.WON,
        SS.COMPLETED,
        SS.DEFAULTED,
        SS.PAYMENT_PENDING,
        SS.DELIVERY_PENDING,
        SS.HANDED_OVER,
        SS.RETURN_PENDING,
        SS.CANCELLED,
    },
    SS.WON: {SS.COMPLETED, SS.DELIVERY_PENDING},
    SS.PAYMENT_PENDING: {SS.ACTIVE, SS.CANCELLED},
    SS.DELIVERY_PENDING: {SS.DELIVERED if hasattr(SS, "DELIVERED") else SS.HANDED_OVER, SS.HANDED_OVER, SS.CANCELLED},
    SS.HANDED_OVER: {SS.RETURN_PENDING, SS.COMPLETED, SS.CLOSED},
    SS.RETURN_PENDING: {SS.RETURNED, SS.CANCELLED},
    SS.RETURNED: {SS.CLOSED},
    SS.COMPLETED: {SS.CLOSED},
    SS.DEFAULTED: {SS.CANCELLED},
    SS.CANCELLED: set(),
    SS.CLOSED: set(),
}


def change_subscription_status(subscription, new_status: str) -> None:
    """Validate and apply a status transition.

    Preserves backward compatibility: legacy ACTIVE → WON/COMPLETED/DEFAULTED
    still works via the table above.
    """
    current = subscription.status
    allowed = ALLOWED_TRANSITIONS.get(current, set())

    if new_status not in allowed:
        raise ValidationError(
            f"Invalid transition from '{current}' to '{new_status}'. "
            f"Allowed: {sorted(allowed) or 'none (terminal state)'}."
        )

    subscription.status = new_status
    subscription.save(update_fields=["status"])
