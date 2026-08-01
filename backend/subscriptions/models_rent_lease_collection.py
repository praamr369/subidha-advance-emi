from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone

from subscriptions.models import (
    Customer,
    MONEY_ZERO,
    PaymentMethod,
    PlanType,
    RentLeaseBillingDemand,
    RentLeaseDemandType,
    Subscription,
    TimeStampedModel,
    q2,
)


def generate_rent_lease_collection_number() -> str:
    return f"RLC-{timezone.now():%Y%m%d%H%M%S%f}-{uuid4().hex[:8].upper()}"


class RentLeaseCollectionStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    VOIDED = "VOIDED", "Voided"
    REVERSED = "REVERSED", "Reversed"



from payments.models import RentLeaseCollection
