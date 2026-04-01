from subscriptions.services.reconciliation_service import reconcile_subscription


def check_subscription_integrity(*, subscription):
    """Validate subscription-level financial invariants."""
    return reconcile_subscription(subscription)
