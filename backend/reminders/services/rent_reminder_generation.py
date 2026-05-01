from __future__ import annotations

from datetime import date
from decimal import Decimal

from reminders.models import ReminderChannel, ReminderStatus, ReminderType
from reminders.services.reminder_service import create_payment_reminder
from subscriptions.models import (
    RentLeaseBillingDemand,
    RentLeaseDemandStatus,
    RentLeaseDemandType,
)


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _existing_rent_reminder(demand: RentLeaseBillingDemand) -> bool:
    return demand.subscription.payment_reminders.filter(
        reminder_type=ReminderType.RENT_DUE,
        due_date=demand.due_date,
        notes__icontains=f"rent_demand:{demand.id}",
    ).exists()


def generate_rent_due_reminders(*, as_of: date, performed_by=None) -> dict:
    """
    Internal reminders for outstanding rent/lease monthly demands due on or before ``as_of``.
    """
    created = 0
    skipped = 0
    qs = (
        RentLeaseBillingDemand.objects.select_related("subscription", "subscription__customer")
        .filter(
            demand_type__in=[RentLeaseDemandType.RENT_MONTHLY, RentLeaseDemandType.LEASE_MONTHLY],
            status__in=[
                RentLeaseDemandStatus.PENDING,
                RentLeaseDemandStatus.PARTIAL,
                RentLeaseDemandStatus.OVERDUE,
            ],
            due_date__lte=as_of,
        )
        .order_by("due_date", "id")
    )
    for demand in qs:
        if demand.outstanding_amount() <= Decimal("0.00"):
            skipped += 1
            continue
        if _existing_rent_reminder(demand):
            skipped += 1
            continue
        create_payment_reminder(
            performed_by=performed_by,
            channel=ReminderChannel.INTERNAL,
            reminder_type=ReminderType.RENT_DUE,
            target_customer=demand.subscription.customer,
            target_subscription=demand.subscription,
            due_date=demand.due_date,
            amount_due=_money(demand.outstanding_amount()),
            status=ReminderStatus.PENDING,
            notes=f"rent_demand:{demand.id} period {demand.billing_period_start}–{demand.billing_period_end}",
            template_key=ReminderType.RENT_DUE,
        )
        created += 1
    return {"as_of": as_of.isoformat(), "created_count": created, "skipped_count": skipped}
