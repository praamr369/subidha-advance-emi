from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from dateutil.relativedelta import relativedelta

from subscriptions.models import Emi, EmiStatus, PlanType


@transaction.atomic
def generate_emi_schedule(subscription, rounding_difference=Decimal("0.00")):

    if subscription.plan_type != PlanType.EMI:
        raise ValidationError("EMI schedule allowed only for EMI plans.")

    if subscription.tenure_months <= 0:
        raise ValidationError("Invalid tenure.")

    # Idempotency Guard
    if subscription.emis.exists():
        return subscription.emis.all()

    tenure = subscription.tenure_months
    monthly_amount = subscription.monthly_amount
    start_date = subscription.start_date

    emis = []

    for month in range(1, tenure + 1):

        due_date = start_date + relativedelta(months=month - 1)
        amount = monthly_amount

        if month == tenure:
            amount += rounding_difference

        emi = Emi.objects.create(
            subscription=subscription,
            month_no=month,
            due_date=due_date,
            amount=amount,
            status=EmiStatus.PENDING,
        )

        emis.append(emi)

    total_generated = sum(e.amount for e in emis)

    if total_generated != subscription.total_amount:
        raise ValidationError(
            "Generated EMI total mismatch."
        )

    return emis