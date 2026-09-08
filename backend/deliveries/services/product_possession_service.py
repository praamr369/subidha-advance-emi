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


def _add_months(anchor, months: int):
    """Same day-of-month arithmetic the rent schedule uses, clamped to 28."""
    year = anchor.year + (anchor.month - 1 + months) // 12
    month = (anchor.month - 1 + months) % 12 + 1
    day = min(anchor.day, 28)
    return anchor.replace(year=year, month=month, day=day)


def derive_expected_return_date(subscription: Subscription):
    """Contract end = start date + tenure. Pure arithmetic, no judgement.

    Leaving this blank made every rent contract look like it had no end date,
    so nothing could tell an operator a return was due.
    """
    start = getattr(subscription, "start_date", None)
    tenure = int(getattr(subscription, "tenure_months", 0) or 0)
    if start is None or tenure <= 0:
        return None
    return _add_months(start, tenure)


def resolve_serial_number(subscription: Subscription) -> str:
    """Serial of the rental asset linked to this contract, when there is one."""
    from subscriptions.models import RentalAsset

    asset = (
        RentalAsset.objects.filter(current_subscription=subscription)
        .exclude(serial_no="")
        .order_by("id")
        .first()
    )
    return asset.serial_no if asset else ""


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

    # Derive rather than leave blank: the caller rarely passes these, and both
    # are computable from the contract itself.
    resolved_return_date = expected_return_date or derive_expected_return_date(subscription)
    resolved_serial = (serial_number or "").strip() or resolve_serial_number(subscription)

    possession = ProductPossession.objects.create(
        subscription=subscription,
        product=subscription.product,
        customer=subscription.customer,
        status=PossessionStatus.PENDING_HANDOVER,
        expected_return_date=resolved_return_date,
        serial_number=resolved_serial,
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

    updated = [
        "status", "handover_date", "handed_over_by", "handover_condition_notes", "updated_at",
    ]

    # Backfill derived fields at handover time. The rental asset is usually
    # linked between contract creation and handover, so the serial only becomes
    # knowable now; the expected return date may also have moved if the contract
    # start was rebased.
    if not possession.serial_number:
        serial = resolve_serial_number(possession.subscription)
        if serial:
            possession.serial_number = serial
            updated.append("serial_number")
    if not possession.expected_return_date:
        derived = derive_expected_return_date(possession.subscription)
        if derived:
            possession.expected_return_date = derived
            updated.append("expected_return_date")

    possession.save(update_fields=updated)

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
