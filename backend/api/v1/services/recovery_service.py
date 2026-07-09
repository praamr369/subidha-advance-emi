"""Recovery case and settlement management services."""
from datetime import datetime
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth.models import User

from subscriptions.models import RecoveryCase, Emi, EmiStatus


def request_settlement(recovery_case: RecoveryCase, requested_by: User, settlement_notes: str) -> RecoveryCase:
    """Request settlement for a recovery case."""
    recovery_case.settlement_requested_by = requested_by
    recovery_case.settlement_requested_at = timezone.now()
    recovery_case.settlement_notes = settlement_notes
    recovery_case.save(update_fields=[
        'settlement_requested_by',
        'settlement_requested_at',
        'settlement_notes',
    ])
    return recovery_case


def approve_settlement(
    recovery_case: RecoveryCase,
    approved_by: User,
    settlement_type: str,
    settled_amount: Decimal,
    approval_notes: str
) -> RecoveryCase:
    """Approve and execute settlement."""
    recovery_case.settlement_approved_by = approved_by
    recovery_case.settlement_approved_at = timezone.now()
    recovery_case.settlement_type = settlement_type
    recovery_case.settled_amount = settled_amount
    recovery_case.settlement_approval_notes = approval_notes
    recovery_case.settled_at = timezone.now()
    recovery_case.save(update_fields=[
        'settlement_approved_by',
        'settlement_approved_at',
        'settlement_type',
        'settled_amount',
        'settlement_approval_notes',
        'settled_at',
    ])
    return recovery_case


def mark_overdue_emis_settled(recovery_case: RecoveryCase):
    """Mark all overdue EMIs as settled after settlement approval."""
    pending_emis = Emi.objects.filter(
        subscription=recovery_case.subscription,
        status=EmiStatus.PENDING,
        due_date__lt=recovery_case.first_overdue_date or timezone.localdate()
    )
    pending_emis.update(status=EmiStatus.WAIVED)


def calculate_overdue_summary(recovery_case: RecoveryCase) -> dict:
    """Calculate overdue amount and EMI count."""
    overdue_emis = Emi.objects.filter(
        subscription=recovery_case.subscription,
        status=EmiStatus.PENDING,
        due_date__lt=timezone.localdate()
    )

    total_amount = sum(emi.amount for emi in overdue_emis)
    emi_count = overdue_emis.count()

    return {
        'overdue_emis': emi_count,
        'overdue_amount': Decimal(str(total_amount)),
        'first_overdue_date': overdue_emis.order_by('due_date').first().due_date if overdue_emis.exists() else None,
    }
