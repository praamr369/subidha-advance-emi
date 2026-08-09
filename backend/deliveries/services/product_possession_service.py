"""Product possession tracking service."""
from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    PlanType,
    PossessionStatus,
    ProductPossession,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit


@transaction.atomic
def create_possession_record(
    *,
    subscription: Subscription,
    expected_return_date=None,
    serial_number: str = "",
    handover_condition_notes: str = "",
    performed_by,
) -> ProductPossession:
    """Create a PENDING_HANDOVER possession record. Idempotent."""
    if subscription.plan_type not in (PlanType.RENT, PlanType.LEASE):
        raise ValidationError("Possession tracking is only for RENT and LEASE contracts.")

    existing = ProductPossession.objects.filter(subscription=subscription).first()
    if existing:
        return existing

    possession = ProductPossession.objects.create(
        subscription=subscription,
        product=subscription.product,
        customer=subscription.customer,
        status=PossessionStatus.PENDING_HANDOVER,
        expected_return_date=expected_return_date,
        serial_number=(serial_number or "").strip(),
        handover_condition_notes=(handover_condition_notes or "").strip(),
    )

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_POSSESSION_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"possession_id": possession.pk},
    )
    return possession


@transaction.atomic
def record_handover(
    *,
    possession: ProductPossession,
    handed_over_by,
    handover_date=None,
    handover_condition_notes: str = "",
) -> ProductPossession:
    if possession.status != PossessionStatus.PENDING_HANDOVER:
        raise ValidationError(
            f"Cannot record handover; current status is '{possession.status}'."
        )

    possession.status = PossessionStatus.WITH_CUSTOMER
    possession.handover_date = handover_date or timezone.localdate()
    possession.handed_over_by = handed_over_by
    if handover_condition_notes:
        possession.handover_condition_notes = handover_condition_notes.strip()
    possession.save(update_fields=[
        "status", "handover_date", "handed_over_by", "handover_condition_notes", "updated_at",
    ])

    subscription = possession.subscription
    if subscription.status not in (
        SubscriptionStatus.HANDED_OVER, SubscriptionStatus.COMPLETED, SubscriptionStatus.CLOSED
    ):
        from subscriptions.services.state_machine import change_subscription_status
        try:
            change_subscription_status(subscription, SubscriptionStatus.HANDED_OVER)
        except ValidationError:
            pass

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_POSSESSION_UPDATED,
        instance=subscription,
        performed_by=handed_over_by,
        metadata={"status": "WITH_CUSTOMER", "handover_date": str(possession.handover_date)},
    )
    return possession


@transaction.atomic
def initiate_return(
    *,
    possession: ProductPossession,
    performed_by,
    actual_return_date=None,
    return_condition_notes: str = "",
) -> ProductPossession:
    if possession.status not in (PossessionStatus.WITH_CUSTOMER, PossessionStatus.RETURN_DUE):
        raise ValidationError(
            f"Cannot initiate return; current status is '{possession.status}'."
        )

    possession.status = PossessionStatus.UNDER_INSPECTION
    possession.actual_return_date = actual_return_date or timezone.localdate()
    possession.returned_to = performed_by
    if return_condition_notes:
        possession.return_condition_notes = return_condition_notes.strip()
    possession.save(update_fields=[
        "status", "actual_return_date", "returned_to", "return_condition_notes", "updated_at",
    ])

    subscription = possession.subscription
    if subscription.status not in (SubscriptionStatus.RETURNED, SubscriptionStatus.CLOSED):
        from subscriptions.services.state_machine import change_subscription_status
        try:
            change_subscription_status(subscription, SubscriptionStatus.RETURNED)
        except ValidationError:
            pass

    log_audit(
        action_type=AuditLog.ActionType.CONTRACT_POSSESSION_UPDATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={"status": "UNDER_INSPECTION", "return_date": str(possession.actual_return_date)},
    )
    return possession
