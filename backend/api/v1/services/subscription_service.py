from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from accounting.services.non_gst_document_service import build_non_gst_snapshot
from subscriptions.models import Batch, LuckyId, LuckyIdStatus, PlanType, Subscription
from subscriptions.services.emi_engine import generate_emi_schedule

from api.v1.selectors.subscription_selector import (
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

    # NOTE: A customer may hold multiple Lucky IDs within the same batch.
    # Uniqueness is enforced at the Lucky ID level (one EMI subscription per
    # Lucky ID, Lucky ID unique per batch) by DB constraints, not per customer.

    total_amount = product.base_price
    tenure = tenure_months
    if tenure <= 0:
        raise serializers.ValidationError("Tenure must be greater than zero")
    if tenure != batch.duration_months:
        raise serializers.ValidationError("Tenure must match selected batch duration")
    monthly = (total_amount / tenure).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rounding = total_amount - (monthly * tenure)

    with transaction.atomic():
        locked_batch = Batch.objects.select_for_update().get(pk=batch.pk)
        locked_lucky = (
            LuckyId.objects.select_for_update()
            .select_related("batch")
            .get(pk=lucky.pk)
        )
        if not is_batch_open(locked_batch):
            raise serializers.ValidationError("Selected batch is not open")
        if locked_lucky.batch_id != locked_batch.id:
            raise serializers.ValidationError("Lucky ID does not belong to selected batch")
        if not is_lucky_id_available(locked_lucky):
            raise serializers.ValidationError("Lucky ID is not available")

        sub = Subscription.objects.create(
            customer=customer,
            product=product,
            partner=partner,
            batch=locked_batch,
            lucky_id=locked_lucky,
            plan_type=PlanType.EMI,
            tenure_months=tenure,
            start_date=start_date,
            total_amount=total_amount,
            monthly_amount=monthly,
            status="ACTIVE",
            tax_profile_snapshot=build_non_gst_snapshot(
                document_type="ADVANCE_EMI_CONTRACT",
                document_date=start_date,
                party_type="CUSTOMER",
                party_id=customer.id,
                product_id=product.id,
            ),
        )

        locked_lucky.status = LuckyIdStatus.ASSIGNED
        locked_lucky.save(update_fields=["status"])

        try:
            generate_emi_schedule(sub, rounding_difference=rounding)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(str(exc))

    return sub
