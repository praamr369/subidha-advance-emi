from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from subscriptions.services.audit_service import log_audit
from subscriptions.models import (
    AuditLog,
    EmiStatus,
    FinancialLedger,
    SubscriptionStatus,
)


@transaction.atomic
def waive_emis_for_winning_subscription(*, subscription, performed_by):
    if subscription.status == SubscriptionStatus.WON:
        raise ValidationError("Subscription already marked as winner.")

    paid_count = subscription.emis.filter(status=EmiStatus.PAID).count()
    winner_month = paid_count + 1

    pending_emis = subscription.emis.filter(status=EmiStatus.PENDING)
    total_waived = Decimal("0.00")

    for emi in pending_emis:
        emi_waive_amount = emi.balance_amount()
        total_waived += emi_waive_amount

        emi.status = EmiStatus.WAIVED
        emi.save(update_fields=["status"])

        FinancialLedger.objects.create(
            payment=None,
            emi=emi,
            amount=emi_waive_amount,
            entry_type="WAIVER",
        )

    log_audit(
        action_type=AuditLog.ActionType.EMI_WAIVED,
        instance=emi,
        metadata={
             "subscription_id": subscription.id,
            "month_no": emi.month_no,
            "amount": str(emi.amount),
        },
    )

    subscription.status = SubscriptionStatus.WON
    subscription.winner_month = winner_month
    subscription.waived_amount = total_waived
    subscription.save(update_fields=["status", "winner_month", "waived_amount"])

    if subscription.lucky_id:
        subscription.lucky_id.status = "WON"
        subscription.lucky_id.save(update_fields=["status"])

    try:
        from billing.services.billing_sync_service import sync_waiver_into_billing

        sync_waiver_into_billing(
            subscription_id=subscription.id,
            performed_by=performed_by,
        )
    except Exception:  # pragma: no cover - best-effort mirror sync
        pass

    
