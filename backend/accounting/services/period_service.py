from __future__ import annotations

from calendar import month_name, monthrange
from datetime import date

from django.db import transaction
from django.utils import timezone

from accounting.models import AccountingPeriod, AccountingPeriodStatus, FinancialYear, PostingLock
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


def get_active_financial_year() -> FinancialYear | None:
    return FinancialYear.objects.filter(is_active=True).order_by("-start_date", "-id").first()


@transaction.atomic
def activate_financial_year(financial_year_id: int, performed_by) -> FinancialYear:
    financial_year = FinancialYear.objects.select_for_update().get(pk=financial_year_id)
    FinancialYear.objects.select_for_update().filter(is_active=True).exclude(pk=financial_year.pk).update(
        is_active=False,
        activated_at=None,
        activated_by=None,
    )
    financial_year.is_active = True
    financial_year.activated_at = timezone.now()
    financial_year.activated_by = performed_by
    financial_year.save(update_fields=["is_active", "activated_at", "activated_by", "updated_at"])
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=financial_year,
        performed_by=performed_by,
        metadata={
            "event": "ACCOUNTING_FINANCIAL_YEAR_ACTIVATED",
            "financial_year_id": financial_year.id,
            "financial_year_code": financial_year.code,
        },
    )
    return financial_year


def _next_month_start(value: date) -> date:
    if value.month == 12:
        return date(value.year + 1, 1, 1)
    return date(value.year, value.month + 1, 1)


@transaction.atomic
def generate_monthly_periods(financial_year_id: int, performed_by) -> dict:
    financial_year = FinancialYear.objects.select_for_update().get(pk=financial_year_id)
    periods: list[AccountingPeriod] = []
    created_count = 0
    current = financial_year.start_date

    while current <= financial_year.end_date:
        month_end = date(current.year, current.month, monthrange(current.year, current.month)[1])
        period_end = min(month_end, financial_year.end_date)
        code = f"{financial_year.code}-{current.year}{current.month:02d}"
        name = f"{month_name[current.month]} {current.year}"
        period, created = AccountingPeriod.objects.get_or_create(
            start_date=current,
            end_date=period_end,
            defaults={
                "financial_year": financial_year,
                "code": code,
                "name": name,
                "label": name,
                "status": AccountingPeriodStatus.OPEN,
            },
        )
        if not created and period.financial_year_id is None:
            period.financial_year = financial_year
            if not period.name:
                period.name = period.label or name
            period.save(update_fields=["financial_year", "name", "label", "status", "is_locked", "updated_at"])
        created_count += 1 if created else 0
        periods.append(period)
        current = _next_month_start(current)

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=financial_year,
        performed_by=performed_by,
        metadata={
            "event": "ACCOUNTING_PERIODS_GENERATED",
            "financial_year_id": financial_year.id,
            "financial_year_code": financial_year.code,
            "period_count": len(periods),
            "created_count": created_count,
        },
    )
    return {"financial_year": financial_year, "periods": periods, "created_count": created_count}


@transaction.atomic
def generate_current_period(*, reference_date: date | None = None, performed_by=None) -> dict:
    reference_date = reference_date or timezone.localdate()
    financial_year = get_active_financial_year()
    if financial_year is None:
        raise ValueError("No active financial year is configured.")
    if reference_date < financial_year.start_date or reference_date > financial_year.end_date:
        raise ValueError(f"Posting date {reference_date.isoformat()} is outside active financial year {financial_year.code}.")
    existing = AccountingPeriod.objects.filter(
        financial_year=financial_year,
        start_date__lte=reference_date,
        end_date__gte=reference_date,
    ).order_by("start_date", "id").first()
    if existing is not None:
        return {"created": False, "financial_year": financial_year, "period": existing, "detail": "Current accounting period already exists."}
    month_start = date(reference_date.year, reference_date.month, 1)
    month_end = date(reference_date.year, reference_date.month, monthrange(reference_date.year, reference_date.month)[1])
    period_start = max(month_start, financial_year.start_date)
    period_end = min(month_end, financial_year.end_date)
    overlap = AccountingPeriod.objects.filter(start_date__lte=period_end, end_date__gte=period_start).first()
    if overlap is not None:
        raise ValueError(f"Cannot create current period because {overlap.code} overlaps the target range.")
    code = f"{financial_year.code}-{period_start.year}{period_start.month:02d}"
    name = f"{month_name[period_start.month]} {period_start.year}"
    period = AccountingPeriod.objects.create(
        financial_year=financial_year,
        code=code,
        name=name,
        label=name,
        start_date=period_start,
        end_date=period_end,
        status=AccountingPeriodStatus.OPEN,
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=period,
        performed_by=performed_by,
        metadata={
            "event": "ACCOUNTING_CURRENT_PERIOD_GENERATED",
            "financial_year_id": financial_year.id,
            "financial_year_code": financial_year.code,
            "period_id": period.id,
            "period_code": period.code,
            "reference_date": reference_date.isoformat(),
        },
    )
    return {"created": True, "financial_year": financial_year, "period": period, "detail": "Current accounting period generated."}


def resolve_accounting_period(posting_date: date) -> AccountingPeriod:
    financial_year = get_active_financial_year()
    if financial_year is None:
        raise ValueError("No active financial year is configured for accounting posting.")
    if posting_date < financial_year.start_date or posting_date > financial_year.end_date:
        raise ValueError(
            f"Posting date {posting_date.isoformat()} is outside active financial year {financial_year.code}."
        )
    period = (
        AccountingPeriod.objects.select_related("financial_year", "locked_by")
        .filter(
            financial_year=financial_year,
            start_date__lte=posting_date,
            end_date__gte=posting_date,
        )
        .order_by("start_date", "id")
        .first()
    )
    if period is None:
        raise ValueError(f"No accounting period is configured for posting date {posting_date.isoformat()}.")
    return period


def validate_posting_date(posting_date: date) -> AccountingPeriod:
    period = resolve_accounting_period(posting_date)
    if period.status == AccountingPeriodStatus.CLOSED:
        raise ValueError(f"Accounting period {period.code} is closed.")
    if period.status == AccountingPeriodStatus.LOCKED or period.is_locked:
        raise ValueError(f"Accounting period {period.code} is locked.")
    return period


def build_accounting_period_readiness(reference_date: date | None = None) -> dict:
    reference_date = reference_date or timezone.localdate()
    active_financial_year = get_active_financial_year()
    current_period = None
    errors: list[str] = []
    warnings: list[str] = []
    blocker_items: list[dict] = []

    if active_financial_year is None:
        errors.append("No active financial year is configured.")
        blocker_items.append({"code": "NO_ACTIVE_FINANCIAL_YEAR", "label": "No active financial year", "recommended_action": "Open accounting periods and activate the correct financial year.", "action_href": "/admin/accounting/periods", "is_actionable": True})
    elif reference_date < active_financial_year.start_date or reference_date > active_financial_year.end_date:
        message = f"Today is outside active financial year {active_financial_year.code}."
        errors.append(message)
        blocker_items.append({"code": "DATE_OUTSIDE_ACTIVE_FINANCIAL_YEAR", "label": message, "recommended_action": "Activate or create the financial year covering the posting date.", "action_href": "/admin/accounting/periods", "is_actionable": True})
    else:
        current_period = (
            AccountingPeriod.objects.select_related("financial_year", "locked_by")
            .filter(
                financial_year=active_financial_year,
                start_date__lte=reference_date,
                end_date__gte=reference_date,
            )
            .order_by("start_date", "id")
            .first()
        )
        if current_period is None:
            message = "No accounting period covers today's posting date."
            errors.append(message)
            blocker_items.append({"code": "NO_CURRENT_ACCOUNTING_PERIOD", "label": message, "recommended_action": "Generate missing periods or create the current period explicitly.", "action_href": "/admin/accounting/periods", "api_action": "/api/v1/accounting/periods/generate-current/", "is_actionable": True})
        elif current_period.status == AccountingPeriodStatus.CLOSED:
            message = f"Current accounting period {current_period.code} is closed."
            errors.append(message)
            blocker_items.append({"code": "CURRENT_PERIOD_CLOSED", "label": message, "recommended_action": "Select an open period or review period governance.", "action_href": "/admin/accounting/periods", "is_actionable": False})
        elif current_period.status == AccountingPeriodStatus.LOCKED or current_period.is_locked:
            message = f"Current accounting period {current_period.code} is locked."
            errors.append(message)
            blocker_items.append({"code": "CURRENT_PERIOD_LOCKED", "label": message, "recommended_action": "Posting is blocked while the accounting period is locked.", "action_href": "/admin/accounting/periods", "is_actionable": False})

        period_count = AccountingPeriod.objects.filter(financial_year=active_financial_year).count()
        if period_count == 0:
            message = f"No accounting periods have been generated for {active_financial_year.code}."
            errors.append(message)
            blocker_items.append({"code": "NO_ACCOUNTING_PERIODS", "label": message, "recommended_action": "Generate monthly periods for the active financial year.", "action_href": "/admin/accounting/periods", "is_actionable": True})
        elif period_count < 12:
            warnings.append(f"{active_financial_year.code} has only {period_count} configured period(s).")

    posting_lock = PostingLock.objects.filter(lock_date=reference_date).first()
    if posting_lock is not None:
        message = f"Posting lock exists for {reference_date.isoformat()}."
        errors.append(message)
        blocker_items.append({"code": "POSTING_LOCK_EXISTS", "label": message, "recommended_action": "Remove the posting lock only through controlled accounting governance.", "action_href": "/admin/accounting/periods", "is_actionable": False})

    return {
        "reference_date": reference_date,
        "active_financial_year": active_financial_year,
        "current_period": current_period,
        "is_ready": not errors,
        "errors": errors,
        "warnings": warnings,
        "blocker_items": blocker_items,
        "recommended_actions": blocker_items,
        "posting_lock": posting_lock,
    }


@transaction.atomic
def set_accounting_period_status(
    *,
    period_id: int,
    status: str,
    performed_by,
    reason: str = "",
) -> tuple[AccountingPeriod, bool]:
    normalized_status = (status or "").strip().upper()
    if normalized_status not in AccountingPeriodStatus.values:
        raise ValueError("Invalid accounting period status.")

    period = AccountingPeriod.objects.select_for_update().get(pk=period_id)
    updated = period.status != normalized_status
    period.status = normalized_status
    period.lock_reason = (reason or "").strip()
    if normalized_status == AccountingPeriodStatus.OPEN:
        period.is_locked = False
        period.locked_at = None
        period.locked_by = None
    else:
        period.is_locked = True
        if period.locked_at is None:
            period.locked_at = timezone.now()
        period.locked_by = performed_by
    period.save(
        update_fields=[
            "status",
            "is_locked",
            "locked_at",
            "locked_by",
            "lock_reason",
            "updated_at",
        ]
    )

    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=period,
        performed_by=performed_by,
        metadata={
            "event": "ACCOUNTING_PERIOD_STATUS_CHANGED",
            "period_id": period.id,
            "period_code": period.code,
            "status": period.status,
            "reason": period.lock_reason,
        },
    )
    return period, updated


def assert_accounting_period_open(*, reference_date: date, performed_by=None, instance=None, event: str | None = None) -> AccountingPeriod:
    period = validate_posting_date(reference_date)
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
    return period


@transaction.atomic
def lock_accounting_period(*, period_id: int, performed_by, reason: str = "") -> tuple[AccountingPeriod, bool]:
    return set_accounting_period_status(
        period_id=period_id,
        status=AccountingPeriodStatus.LOCKED,
        performed_by=performed_by,
        reason=reason,
    )


@transaction.atomic
def unlock_accounting_period(*, period_id: int, performed_by, reason: str = "") -> tuple[AccountingPeriod, bool]:
    return set_accounting_period_status(
        period_id=period_id,
        status=AccountingPeriodStatus.OPEN,
        performed_by=performed_by,
        reason=reason,
    )


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
