from django.core.exceptions import ValidationError
from django.db import transaction

from subscriptions.models import Subscription, SubscriptionStatus
from subscriptions.services.winner_state_service import apply_winner_state


class WinnerService:
    @staticmethod
    @transaction.atomic
    def execute_winner(subscription_id: int, winner_month: int, performed_by=None):
        """
        Legacy admin winner execution path.

        Kept backward-compatible, but now routes through the canonical
        winner-state service so status, Lucky ID, waiver rows, and audit
        stay aligned with draw-based winner processing.
        """

        subscription = (
            Subscription.objects.select_for_update()
            .get(id=subscription_id)
        )

        if subscription.status != SubscriptionStatus.ACTIVE:
            raise ValidationError("Subscription is not active.")

        if subscription.winner_month is not None:
            raise ValidationError("Winner already executed for this subscription.")

        result = apply_winner_state(
            subscription=subscription,
            winner_month=winner_month,
            performed_by=performed_by,
            source="manual_execute_winner",
            emit_waiver_audit=True,
            require_paid_until_winner_month=True,
        )

        return {
            "subscription_id": result["subscription"].id,
            "winner_month": result["winner_month"],
            "waived_amount": result["waived_amount"],
            "waived_emi_count": result["waived_emi_count"],
            "lucky_id_status": getattr(result["lucky_id"], "status", None),
            "subscription_status": result["subscription"].status,
        }
