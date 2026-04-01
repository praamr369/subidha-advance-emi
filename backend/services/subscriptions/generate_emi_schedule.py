from decimal import Decimal

from subscriptions.models import Subscription
from subscriptions.services.emi_engine import generate_emi_schedule as _generate_emi_schedule


def generate_emi_schedule(*, subscription: Subscription, rounding_difference: Decimal = Decimal("0.00")):
    """Domain facade for deterministic EMI generation."""
    return _generate_emi_schedule(subscription, rounding_difference=rounding_difference)
