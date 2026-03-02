# subscriptions/services/emi_service.py

from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError

from subscriptions.services.emi_engine import generate_emi_schedule
from subscriptions.models import Emi


@transaction.atomic
def create_schedule_for_subscription(subscription, rounding_difference=Decimal("0.00")):
    """
    High-level schedule creation wrapper.
    Keeps engine isolated from business logic.
    """
    return generate_emi_schedule(
        subscription,
        rounding_difference=rounding_difference
    )


@transaction.atomic
def waive_future_emis(subscription, winner_month: int):
    """
    Marks EMIs after winner_month as WAIVED.
    Used for Lucky Draw winner logic.
    """

    if winner_month <= 0:
        raise ValidationError("Invalid winner month.")

    future_emis = subscription.emis.filter(
        month_no__gt=winner_month,
        status="PENDING"
    )

    for emi in future_emis:
        emi.status = "WAIVED"
        emi.save(update_fields=["status"])

    return future_emis


@transaction.atomic
def get_subscription_outstanding(subscription):
    """
    Calculates total unpaid outstanding amount.
    """

    return (
        subscription.emis
        .filter(status="PENDING")
        .aggregate(total=Sum("amount"))["total"] or Decimal("0.00") 
    )