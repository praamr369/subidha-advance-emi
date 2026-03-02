# subscriptions/services/winner_service.py

from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.core.exceptions import ValidationError
from django.utils import timezone

from subscriptions.models import Subscription, Emi


class WinnerService:

    @staticmethod
    @transaction.atomic
    def execute_winner(subscription_id: int, winner_month: int):
        """
        Executes winner settlement using Option A logic:
        Winner pays up to winning month.
        All EMIs after winning month are waived.
        """

        # Lock subscription row
        subscription = (
            Subscription.objects
            .select_for_update()
            .get(id=subscription_id)
        )

        # ----- VALIDATIONS -----

        if subscription.status != "ACTIVE":
            raise ValidationError("Subscription is not active.")

        if subscription.winner_month is not None:
            raise ValidationError("Winner already executed for this subscription.")

        if winner_month < 1 or winner_month > subscription.tenure_months:
            raise ValidationError("Invalid winner month.")

        # Lock EMI rows
        emis = (
            Emi.objects
            .select_for_update()
            .filter(subscription=subscription)
        )

        # Ensure EMIs up to winner_month are not unpaid
        unpaid_before_winner = emis.filter(
            month_no__lte=winner_month,
            status="PENDING"
        ).exists()

        if unpaid_before_winner:
            raise ValidationError(
                "All EMIs up to winning month must be paid before declaring winner."
            )

        # ----- WAIVE FUTURE EMIs -----

        future_emis = emis.filter(
            month_no__gt=winner_month,
            status="PENDING"
        )

        waived_total = (
            future_emis.aggregate(total=Sum("amount"))["total"]
            or Decimal("0.00")
        )

        future_emis.update(status="WAIVED")

        # ----- UPDATE SUBSCRIPTION -----

        subscription.winner_month = winner_month
        subscription.waived_amount = waived_total
        subscription.status = "COMPLETED"
        subscription.completed_at = timezone.now()
        subscription.save()

        return {
            "subscription_id": subscription.id,
            "winner_month": winner_month,
            "waived_amount": waived_total,
        }