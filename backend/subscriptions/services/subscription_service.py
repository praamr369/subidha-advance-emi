from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError


from subscriptions.models import (
    AuditLog,
    BatchStatus,
    Subscription,
    LuckyId,
    LuckyIdStatus,
    PlanType,
)
from subscriptions.services.emi_engine import generate_emi_schedule
from subscriptions.services.emi_reconciliation import reconcile_subscription_emis
from subscriptions.models import BatchStatus


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
):

    if start_date is None:
        start_date = timezone.now().date()

    if tenure_months <= 0:
        raise ValidationError("Tenure must be greater than zero.")

    # 🔒 Lock LuckyId
    lucky = (
        LuckyId.objects
        .select_for_update()
        .get(batch=batch, lucky_number=lucky_number)
    )

    if lucky.status != LuckyIdStatus.AVAILABLE:
        raise ValidationError("Lucky ID already assigned.")

    

    if batch.status != BatchStatus.OPEN:
        raise ValidationError("Batch is not open for subscription.")

    total_amount = product.base_price

    base_monthly = (
        total_amount / tenure_months
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    total_from_base = base_monthly * tenure_months
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
        monthly_amount=base_monthly,
        status=Subscription.Status.ACTIVE,
    )

    # Assign Lucky ID
    lucky.status = LuckyIdStatus.ASSIGNED
    lucky.save(update_fields=["status"])
    assigned_count = batch.lucky_ids.filter(
        status=LuckyIdStatus.ASSIGNED
    ).count()

    if assigned_count == batch.total_slots:
        transition_batch_status(batch, BatchStatus.FULL)

    # Generate EMIs
    generate_emi_schedule(
        subscription,
        rounding_difference=rounding_difference
    )
    log_audit(
        action_type=AuditLog.ActionType.SUB_CREATED,
        instance=subscription,
        performed_by=created_by_user_if_available,
        metadata={
            "customer_id": customer.id,
            "batch_id": batch.id,
            "lucky_id": lucky.lucky_number,
            "total_amount": str(total_amount),
            "monthly_amount": str(monthly_amount),
        },

    )

    # Financial integrity validation
    reconcile_subscription_emis(subscription)

    # Auto-close batch if full
    if not LuckyId.objects.filter(
        batch=batch,
        status=LuckyIdStatus.AVAILABLE
    ).exists():

        batch.is_closed = True
        batch.status = "CLOSED"
        batch.save(update_fields=["is_closed", "status"])

    return subscription