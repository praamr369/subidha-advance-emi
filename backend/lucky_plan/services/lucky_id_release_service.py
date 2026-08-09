from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    BatchStatus,
    LuckyIdStatus,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit

PRE_LOCK_BATCH_STATUSES = {BatchStatus.DRAFT, BatchStatus.OPEN}
FROZEN_BATCH_STATUSES = {
    BatchStatus.READY_TO_LOCK,
    BatchStatus.LOCKED,
    BatchStatus.DRAW_COMMITTED,
    BatchStatus.DRAW_COMPLETED,
    BatchStatus.CANCELLED,
    BatchStatus.FULL,
    BatchStatus.DRAW_IN_PROGRESS,
    BatchStatus.COMPLETED,
    BatchStatus.CLOSED,
}


def is_lucky_id_assignable(*, lucky_id, subscription: Subscription | None = None) -> bool:
    if lucky_id is None:
        return False
    if lucky_id.status != LuckyIdStatus.AVAILABLE:
        return False
    batch = getattr(lucky_id, "batch", None)
    if batch is None or batch.status not in PRE_LOCK_BATCH_STATUSES:
        return False
    if subscription is not None:
        return subscription.status == SubscriptionStatus.ACTIVE
    return True


@transaction.atomic
def release_lucky_id_for_cancelled_subscription(*, subscription: Subscription, actor, reason: str) -> dict:
    if not subscription.pk:
        raise ValidationError({"subscription": "Subscription must be saved before release workflow."})

    locked_subscription = (
        Subscription.objects.select_for_update(of=("self",))
        .select_related("batch", "lucky_id", "customer")
        .get(pk=subscription.pk)
    )
    lucky = locked_subscription.lucky_id
    batch = locked_subscription.batch

    if locked_subscription.plan_type != "EMI" or lucky is None or batch is None:
        return {"released": False, "blocked": True, "reason": "NOT_EMI_OR_NO_LUCKY"}

    lucky = type(lucky).objects.select_for_update(of=("self",)).select_related("batch").get(pk=lucky.pk)
    batch_status = (batch.status or "").strip().upper()
    old_subscription_id = locked_subscription.id
    old_customer_id = locked_subscription.customer_id

    if batch_status in PRE_LOCK_BATCH_STATUSES:
        locked_subscription.lucky_id = None
        locked_subscription.save(update_fields=["lucky_id"])
        lucky.status = LuckyIdStatus.AVAILABLE
        lucky.save(update_fields=["status"])

        log_audit(
            action_type=AuditLog.ActionType.CONTRACT_CANCELLED,
            instance=locked_subscription,
            performed_by=actor,
            metadata={
                "event": "LUCKY_ID_RELEASED_FROM_CANCELLED_SUBSCRIPTION",
                "batch_id": batch.id,
                "batch_code": batch.batch_code,
                "lucky_id": lucky.id,
                "lucky_number": lucky.lucky_number,
                "old_subscription_id": old_subscription_id,
                "old_customer_id": old_customer_id,
                "reason": reason,
                "released_at": timezone.now().isoformat(),
                "actor_id": getattr(actor, "id", None),
            },
        )
        return {"released": True, "blocked": False, "batch_status": batch_status}

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_CANCELLED,
        instance=locked_subscription,
        performed_by=actor,
        metadata={
            "event": "LUCKY_ID_RELEASE_BLOCKED_BATCH_FROZEN",
            "batch_id": batch.id,
            "batch_code": batch.batch_code,
            "lucky_id": lucky.id,
            "lucky_number": lucky.lucky_number,
            "old_subscription_id": old_subscription_id,
            "old_customer_id": old_customer_id,
            "reason": reason,
            "released_at": timezone.now().isoformat(),
            "actor_id": getattr(actor, "id", None),
            "batch_status": batch_status,
        },
    )
    return {"released": False, "blocked": True, "batch_status": batch_status}
