from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from subscriptions.models import AuditLog, CustomerAdvance, CustomerAdvanceStatus
from subscriptions.services.audit_service import log_audit

DORMANCY_DAYS = 1095  # 3 years — Limitation Act 1963 s.3
MIN_CONTACT_ATTEMPTS = 2


def _money(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def identify_dormant_advances(*, days: int = DORMANCY_DAYS) -> list[dict]:
    from payments.models import AdvanceForfeiture

    cutoff = date.today() - timedelta(days=days)
    already_forfeited_ids = set(
        AdvanceForfeiture.objects.values_list("advance_id", flat=True)
    )
    candidates = (
        CustomerAdvance.objects
        .filter(
            Q(status=CustomerAdvanceStatus.UNAPPLIED) | Q(status=CustomerAdvanceStatus.PARTIALLY_APPLIED),
            unapplied_amount__gt=Decimal("0.00"),
            payment_date__lte=cutoff,
        )
        .select_related("customer")
        .exclude(id__in=already_forfeited_ids)
        .order_by("payment_date")
    )
    return [
        {
            "advance_id": ca.id,
            "customer_id": ca.customer_id,
            "customer_name": getattr(ca.customer, "name", None),
            "amount": str(ca.amount),
            "unapplied_amount": str(ca.unapplied_amount),
            "payment_date": str(ca.payment_date),
            "dormant_days": (date.today() - ca.payment_date).days,
        }
        for ca in candidates[:200]
    ]


def record_contact_attempt(
    *, advance_id: int, method: str, outcome: str, actor,
) -> dict:
    from payments.models import AdvanceForfeiture, AdvanceForfeitureStatus

    advance = CustomerAdvance.objects.select_related("customer").get(pk=advance_id)
    forfeiture, created = AdvanceForfeiture.objects.get_or_create(
        advance=advance,
        defaults={
            "dormant_since": advance.payment_date,
            "forfeited_amount": _money(advance.unapplied_amount),
        },
    )
    if forfeiture.status == AdvanceForfeitureStatus.FORFEITED:
        raise ValueError("Cannot record contact attempt on an already forfeited advance.")

    attempts = forfeiture.contact_attempts or []
    attempts.append({
        "date": str(date.today()),
        "method": method.strip(),
        "outcome": outcome.strip(),
        "recorded_by": actor.get_full_name() or actor.username,
    })
    forfeiture.contact_attempts = attempts
    forfeiture.status = AdvanceForfeitureStatus.CONTACT_ATTEMPTED
    forfeiture.save(update_fields=["contact_attempts", "status", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=forfeiture,
        performed_by=actor,
        metadata={
            "event": "ADVANCE_FORFEITURE_CONTACT_ATTEMPT",
            "advance_id": advance_id,
            "method": method,
            "outcome": outcome,
            "attempt_number": len(attempts),
        },
    )
    return {"forfeiture_id": forfeiture.id, "attempts": len(attempts)}


@transaction.atomic
def forfeit_advance(*, advance_id: int, actor) -> dict:
    from payments.models import AdvanceForfeiture, AdvanceForfeitureStatus

    advance = CustomerAdvance.objects.select_for_update().get(pk=advance_id)
    try:
        forfeiture = AdvanceForfeiture.objects.select_for_update().get(advance=advance)
    except AdvanceForfeiture.DoesNotExist:
        raise ValueError("Record contact attempts before forfeiting. Minimum 2 documented attempts required.")

    attempts = forfeiture.contact_attempts or []
    if len(attempts) < MIN_CONTACT_ATTEMPTS:
        raise ValueError(f"Minimum {MIN_CONTACT_ATTEMPTS} documented contact attempts required before forfeiture. Current: {len(attempts)}.")

    if forfeiture.status == AdvanceForfeitureStatus.FORFEITED:
        raise ValueError("Advance is already forfeited.")

    dormant_days = (date.today() - advance.payment_date).days
    if dormant_days < DORMANCY_DAYS:
        raise ValueError(f"Advance must be dormant for at least {DORMANCY_DAYS} days ({DORMANCY_DAYS // 365} years). Current: {dormant_days} days.")

    forfeited_amount = _money(advance.unapplied_amount)
    advance.unapplied_amount = Decimal("0.00")
    advance.status = CustomerAdvanceStatus.FULLY_APPLIED
    advance.save(update_fields=["unapplied_amount", "status"])

    forfeiture.status = AdvanceForfeitureStatus.FORFEITED
    forfeiture.forfeited_amount = forfeited_amount
    forfeiture.forfeiture_date = date.today()
    forfeiture.forfeited_by = actor
    forfeiture.save(update_fields=[
        "status", "forfeited_amount", "forfeiture_date", "forfeited_by", "updated_at",
    ])

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=forfeiture,
        performed_by=actor,
        metadata={
            "event": "ADVANCE_FORFEITED",
            "advance_id": advance_id,
            "forfeited_amount": str(forfeited_amount),
            "legal_basis": forfeiture.legal_basis,
            "income_recognition": forfeiture.income_recognition_note,
            "dormant_days": dormant_days,
            "contact_attempts": len(attempts),
        },
    )
    return {
        "forfeiture_id": forfeiture.id,
        "forfeited_amount": str(forfeited_amount),
        "status": forfeiture.status,
    }


@transaction.atomic
def reverse_forfeiture(*, forfeiture_id: int, reason: str, actor) -> dict:
    from payments.models import AdvanceForfeiture, AdvanceForfeitureStatus

    forfeiture = AdvanceForfeiture.objects.select_for_update().get(pk=forfeiture_id)
    if forfeiture.status != AdvanceForfeitureStatus.FORFEITED:
        raise ValueError("Only forfeited advances can be reversed.")

    advance = CustomerAdvance.objects.select_for_update().get(pk=forfeiture.advance_id)
    advance.unapplied_amount = _money(advance.unapplied_amount) + forfeiture.forfeited_amount
    advance.status = CustomerAdvanceStatus.UNAPPLIED if advance.unapplied_amount == advance.amount else CustomerAdvanceStatus.PARTIALLY_APPLIED
    advance.save(update_fields=["unapplied_amount", "status"])

    forfeiture.status = AdvanceForfeitureStatus.REVERSED
    forfeiture.reversed_at = timezone.now()
    forfeiture.reversal_reason = reason.strip()
    forfeiture.reversed_by = actor
    forfeiture.save(update_fields=["status", "reversed_at", "reversal_reason", "reversed_by", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=forfeiture,
        performed_by=actor,
        metadata={
            "event": "ADVANCE_FORFEITURE_REVERSED",
            "forfeiture_id": forfeiture_id,
            "reversed_amount": str(forfeiture.forfeited_amount),
            "reason": reason,
        },
    )
    return {"forfeiture_id": forfeiture.id, "status": forfeiture.status}
