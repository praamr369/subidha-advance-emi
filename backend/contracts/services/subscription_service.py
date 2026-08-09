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
from lucky_plan.services.batch_service import transition_batch_status
from subscriptions.services.business_event_service import append_business_event
from payments.services.emi_engine import generate_emi_schedule
from payments.services.emi_reconciliation import reconcile_subscription_emis
from subscriptions.models import BusinessEventType


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

    # Assign immutable ADV-EMI contract number
    from contracts.services.contract_number_service import assign_subscription_number
    assign_subscription_number(subscription)
    from contracts.services.contract_reference_service import (
        ensure_contract_reference_for_subscription,
    )
    ensure_contract_reference_for_subscription(subscription)

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
    append_business_event(
        event_type=BusinessEventType.CONTRACT_CREATED,
        source_module="subscriptions.services.subscription_service.create_emi_subscription",
        actor_user=performed_by,
        customer=customer,
        subscription=subscription,
        batch=batch,
        lucky_id=lucky,
        payload={
            "subscription_id": subscription.id,
            "tenure_months": tenure_months,
            "monthly_amount": str(monthly_amount),
            "total_amount": str(total_amount),
        },
    )
    append_business_event(
        event_type=BusinessEventType.EMI_CREATED,
        source_module="subscriptions.services.subscription_service.create_emi_subscription",
        actor_user=performed_by,
        customer=customer,
        subscription=subscription,
        batch=batch,
        lucky_id=lucky,
        payload={
            "subscription_id": subscription.id,
            "emi_count": subscription.emis.count(),
        },
    )

    # Important P0 hardening:
    # A sold-out batch must remain FULL and drawable.
    # Do not move to CLOSED just because all Lucky IDs are assigned.
    if not LuckyId.objects.filter(batch=batch, status=LuckyIdStatus.AVAILABLE).exists():
        if batch.status != BatchStatus.FULL:
            transition_batch_status(batch, BatchStatus.FULL)

    return subscription


@transaction.atomic
def create_rent_subscription(
    *,
    customer,
    product,
    monthly_rent_amount: Decimal,
    tenure_months: int = 12,
    partner=None,
    start_date=None,
    performed_by=None,
):
    """Create a RENT subscription."""

    if start_date is None:
        start_date = timezone.now().date()

    if tenure_months <= 0:
        raise ValidationError("Tenure must be greater than zero.")

    monthly_rent = Decimal(monthly_rent_amount).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    total_amount = (monthly_rent * tenure_months).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    subscription = Subscription.objects.create(
        customer=customer,
        product=product,
        partner=partner,
        plan_type=PlanType.RENT,
        tenure_months=tenure_months,
        start_date=start_date,
        total_amount=total_amount,
        monthly_amount=monthly_rent,
        status=SubscriptionStatus.ACTIVE,
    )

    from contracts.services.contract_number_service import assign_subscription_number
    assign_subscription_number(subscription)
    from contracts.services.contract_reference_service import (
        ensure_contract_reference_for_subscription,
    )
    ensure_contract_reference_for_subscription(subscription)

    log_audit(
        action_type=AuditLog.ActionType.SUB_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "customer_id": customer.id,
            "plan_type": "RENT",
            "total_amount": str(total_amount),
            "monthly_amount": str(monthly_rent),
            "tenure_months": tenure_months,
        },
    )
    append_business_event(
        event_type=BusinessEventType.CONTRACT_CREATED,
        source_module="subscriptions.services.subscription_service.create_rent_subscription",
        actor_user=performed_by,
        customer=customer,
        subscription=subscription,
        payload={
            "subscription_id": subscription.id,
            "plan_type": "RENT",
            "tenure_months": tenure_months,
            "monthly_amount": str(monthly_rent),
            "total_amount": str(total_amount),
        },
    )

    return subscription


@transaction.atomic
def create_lease_subscription(
    *,
    customer,
    product,
    monthly_lease_amount: Decimal,
    tenure_months: int = 24,
    partner=None,
    start_date=None,
    performed_by=None,
):
    """Create a LEASE subscription."""

    if start_date is None:
        start_date = timezone.now().date()

    if tenure_months <= 0:
        raise ValidationError("Tenure must be greater than zero.")

    monthly_lease = Decimal(monthly_lease_amount).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    total_amount = (monthly_lease * tenure_months).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    subscription = Subscription.objects.create(
        customer=customer,
        product=product,
        partner=partner,
        plan_type=PlanType.LEASE,
        tenure_months=tenure_months,
        start_date=start_date,
        total_amount=total_amount,
        monthly_amount=monthly_lease,
        status=SubscriptionStatus.ACTIVE,
    )

    from contracts.services.contract_number_service import assign_subscription_number
    assign_subscription_number(subscription)
    from contracts.services.contract_reference_service import (
        ensure_contract_reference_for_subscription,
    )
    ensure_contract_reference_for_subscription(subscription)

    log_audit(
        action_type=AuditLog.ActionType.SUB_CREATED,
        instance=subscription,
        performed_by=performed_by,
        metadata={
            "customer_id": customer.id,
            "plan_type": "LEASE",
            "total_amount": str(total_amount),
            "monthly_amount": str(monthly_lease),
            "tenure_months": tenure_months,
        },
    )
    append_business_event(
        event_type=BusinessEventType.CONTRACT_CREATED,
        source_module="subscriptions.services.subscription_service.create_lease_subscription",
        actor_user=performed_by,
        customer=customer,
        subscription=subscription,
        payload={
            "subscription_id": subscription.id,
            "plan_type": "LEASE",
            "tenure_months": tenure_months,
            "monthly_amount": str(monthly_lease),
            "total_amount": str(total_amount),
        },
    )

    return subscription
