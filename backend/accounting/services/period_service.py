from __future__ import annotations

from datetime import date

from django.db import transaction
from django.utils import timezone

from accounting.models import AccountingPeriod, PostingLock
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit


def financial_year_bounds(reference_date: date) -> tuple[date, date]:
    if reference_date.month >= 4:
        start_year = reference_date.year
    else:
        start_year = reference_date.year - 1
    return date(start_year, 4, 1), date(start_year + 1, 3, 31)


def financial_year_code(reference_date: date) -> str:
    start_date, end_date = financial_year_bounds(reference_date)
    return f"FY{start_date.year}-{str(end_date.year)[-2:]}"


def ensure_accounting_period(reference_date: date) -> AccountingPeriod:
    existing = (
        AccountingPeriod.objects.filter(start_date__lte=reference_date, end_date__gte=reference_date)
        .order_by("start_date", "id")
        .first()
    )
    if existing is not None:
        return existing

    start_date, end_date = financial_year_bounds(reference_date)
    code = financial_year_code(reference_date)
    period, _ = AccountingPeriod.objects.get_or_create(
        code=code,
        defaults={
            "label": f"{start_date.year}-{str(end_date.year)[-2:]}",
            "start_date": start_date,
            "end_date": end_date,
        },
    )
    return period


def assert_accounting_period_open(*, reference_date: date, performed_by=None, instance=None, event: str | None = None) -> AccountingPeriod:
    period = ensure_accounting_period(reference_date)
    posting_lock = PostingLock.objects.filter(lock_date=reference_date).first()
    if posting_lock is not None:
        if instance is not None:
            log_audit(
                action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
                instance=instance,
                performed_by=performed_by,
                metadata={
                    "event": event or "ACCOUNTING_POSTING_LOCK_BLOCK",
                    "lock_id": posting_lock.id,
                    "lock_date": reference_date.isoformat(),
                },
            )
        raise ValueError(f"Accounting posting lock exists for {reference_date.isoformat()}.")

    if not period.is_locked:
        return period

    if instance is not None:
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=instance,
            performed_by=performed_by,
            metadata={
                "event": event or "ACCOUNTING_PERIOD_LOCKED_BLOCK",
                "period_id": period.id,
                "period_code": period.code,
                "reference_date": reference_date.isoformat(),
            },
        )
    raise ValueError(f"Accounting period {period.code} is locked.")


@transaction.atomic
def lock_accounting_period(*, period_id: int, performed_by, reason: str = "") -> tuple[AccountingPeriod, bool]:
    period = AccountingPeriod.objects.select_for_update().get(pk=period_id)
    if period.is_locked:
        return period, False

    period.is_locked = True
    period.locked_at = timezone.now()
    period.locked_by = performed_by
    period.lock_reason = (reason or "").strip()
    period.save(update_fields=["is_locked", "locked_at", "locked_by", "lock_reason", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=period,
        performed_by=performed_by,
        metadata={
            "event": "ACCOUNTING_PERIOD_LOCKED",
            "period_id": period.id,
            "period_code": period.code,
            "lock_reason": period.lock_reason,
        },
    )
    return period, True


@transaction.atomic
def unlock_accounting_period(*, period_id: int, performed_by, reason: str = "") -> tuple[AccountingPeriod, bool]:
    period = AccountingPeriod.objects.select_for_update().get(pk=period_id)
    if not period.is_locked:
        return period, False

    period.is_locked = False
    period.locked_at = None
    period.locked_by = None
    period.lock_reason = (reason or "").strip()
    period.save(update_fields=["is_locked", "locked_at", "locked_by", "lock_reason", "updated_at"])

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=period,
        performed_by=performed_by,
        metadata={
            "event": "ACCOUNTING_PERIOD_UNLOCKED",
            "period_id": period.id,
            "period_code": period.code,
            "unlock_reason": period.lock_reason,
        },
    )
    return period, True


@transaction.atomic
def create_posting_lock(*, lock_date: date, performed_by, reason: str = "") -> tuple[PostingLock, bool]:
    posting_lock, created = PostingLock.objects.get_or_create(
        lock_date=lock_date,
        defaults={
            "reason": (reason or "").strip(),
            "locked_by": performed_by,
            "locked_at": timezone.now(),
        },
    )
    if not created:
        return posting_lock, False

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=posting_lock,
        performed_by=performed_by,
        metadata={
            "event": "ACCOUNTING_POSTING_LOCK_CREATED",
            "lock_id": posting_lock.id,
            "lock_date": posting_lock.lock_date.isoformat(),
            "reason": posting_lock.reason,
        },
    )
    return posting_lock, True


@transaction.atomic
def remove_posting_lock(*, posting_lock_id: int, performed_by, reason: str = "") -> tuple[PostingLock, bool]:
    posting_lock = PostingLock.objects.select_for_update().get(pk=posting_lock_id)
    metadata = {
        "event": "ACCOUNTING_POSTING_LOCK_REMOVED",
        "lock_id": posting_lock.id,
        "lock_date": posting_lock.lock_date.isoformat(),
        "reason": (reason or "").strip(),
    }
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=posting_lock,
        performed_by=performed_by,
        metadata=metadata,
    )
    posting_lock.delete()
    return posting_lock, True
