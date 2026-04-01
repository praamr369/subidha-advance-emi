from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    BatchStatus,
    LuckyId,
    LuckyIdStatus,
    PlanType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.services.batch_service import transition_batch_status
from subscriptions.services.emi_engine import generate_emi_schedule
from subscriptions.services.emi_reconciliation import reconcile_subscription_emis


@transaction.atomic
def create_emi_subscription(
    *,
    customer,
    product,
    batch,
    lucky_number: int,
    tenure_months: int,
    partner=None,
    start_date=None,
    performed_by=None,
):
    """Create an EMI subscription using deterministic installment generation."""

    if start_date is None:
        start_date = timezone.now().date()

    if tenure_months <= 0:
        raise ValidationError("Tenure must be greater than zero.")

    if batch.status != BatchStatus.OPEN:
        raise ValidationError("Batch is not open for subscription.")

    lucky = (
        LuckyId.objects.select_for_update()
        .select_related("batch")
        .get(batch=batch, lucky_number=lucky_number)
    )

    if lucky.status != LuckyIdStatus.AVAILABLE:
        raise ValidationError("Lucky ID already assigned.")

    total_amount = Decimal(product.base_price).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    monthly_amount = (total_amount / tenure_months).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    total_from_base = monthly_amount * tenure_months
    rounding_difference = total_amount - total_from_base

    subscription = Subscription.objects.create(
        customer=customer,
        product=product,
        partner=partner,
        batch=batch,
        lucky_id=lucky,
        plan_type=PlanType.EMI,
        tenure_months=tenure_months,
        start_date=start_date,
        total_amount=total_amount,
        monthly_amount=monthly_amount,
        status=SubscriptionStatus.ACTIVE,
    )

    lucky.status = LuckyIdStatus.ASSIGNED
    lucky.save(update_fields=["status"])

    assigned_count = batch.lucky_ids.filter(status=LuckyIdStatus.ASSIGNED).count()
    if assigned_count >= batch.total_slots:
        transition_batch_status(batch, BatchStatus.FULL)

    generate_emi_schedule(subscription, rounding_difference=rounding_difference)
    reconcile_subscription_emis(subscription)

    log_audit(
        action_type=AuditLog.ActionType.SUB_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "customer_id": customer.id,
            "batch_id": batch.id,
            "lucky_id": lucky.lucky_number,
            "total_amount": str(total_amount),
            "monthly_amount": str(monthly_amount),
            "tenure_months": tenure_months,
        },
    )

    # Important P0 hardening:
    # A sold-out batch must remain FULL and drawable.
    # Do not move to CLOSED just because all Lucky IDs are assigned.
    if not LuckyId.objects.filter(batch=batch, status=LuckyIdStatus.AVAILABLE).exists():
        if batch.status != BatchStatus.FULL:
            transition_batch_status(batch, BatchStatus.FULL)

    return subscription