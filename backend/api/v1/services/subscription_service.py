from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from subscriptions.models import LuckyIdStatus, PlanType, Subscription
from subscriptions.services.emi_engine import generate_emi_schedule

from api.v1.selectors.subscription_selector import (
    customer_has_emi_in_batch,
    get_batch_by_id,
    get_customer_by_id,
    get_lucky_id_with_batch,
    get_product_by_id,
    is_batch_open,
    is_lucky_id_available,
)


def create_partner_emi_subscription(
    *,
    partner,
    customer_id: int,
    product_id: int,
    batch_id: int,
    lucky_id: int,
    tenure_months: int,
    start_date,
) -> Subscription:
    """
    Create an EMI subscription purchased by a partner on behalf of a customer.

    This encapsulates validation and side‑effects (lucky ID reservation, EMI schedule).
    """
    customer = get_customer_by_id(customer_id)
    product = get_product_by_id(product_id)
    batch = get_batch_by_id(batch_id)
    lucky = get_lucky_id_with_batch(lucky_id)

    if not customer or not product or not batch or not lucky:
        raise serializers.ValidationError("Invalid customer/product/batch/lucky_id")

    if not is_batch_open(batch):
        raise serializers.ValidationError("Selected batch is not open")

    if lucky.batch_id != batch.id:
        raise serializers.ValidationError("Lucky ID does not belong to selected batch")

    if not is_lucky_id_available(lucky):
        raise serializers.ValidationError("Lucky ID is not available")

    if customer_has_emi_in_batch(customer=customer, batch=batch):
        raise serializers.ValidationError(
            "Customer already has EMI subscription in this batch"
        )

    total_amount = product.base_price
    tenure = tenure_months
    monthly = (total_amount / tenure).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rounding = total_amount - (monthly * tenure)

    with transaction.atomic():
        sub = Subscription.objects.create(
            customer=customer,
            product=product,
            partner=partner,
            batch=batch,
            lucky_id=lucky,
            plan_type=PlanType.EMI,
            tenure_months=tenure,
            start_date=start_date,
            total_amount=total_amount,
            monthly_amount=monthly,
            status="ACTIVE",
        )

        lucky.status = LuckyIdStatus.ASSIGNED
        lucky.save(update_fields=["status"])

        try:
            generate_emi_schedule(sub, rounding_difference=rounding)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(str(exc))

    return sub

