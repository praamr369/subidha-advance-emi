from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from subscriptions.models import Customer, CustomerAdvance, MONEY_ZERO, PaymentMethod, TimeStampedModel


class CustomerAdvanceRefundStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    VOIDED = "VOIDED", "Voided"
    REVERSED = "REVERSED", "Reversed"



from payments.models import CustomerAdvanceRefund
