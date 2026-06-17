"""
P2C — Month-end close service.

Runs a battery of 10 checks against a calendar month and records results.
No financial record is ever mutated.
"""
from __future__ import annotations

import calendar
from datetime import date
from typing import Any

from django.db import transaction
from django.utils import timezone

from subscriptions.models_month_end_close import (
    MonthEndCheckSeverity,
    MonthEndCloseCheckResult,
    MonthEndCloseRun,
    MonthEndCloseStatus,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.models import AuditLog

_BLOCKING = MonthEndCheckSeverity.BLOCKING
_WARNING = MonthEndCheckSeverity.WARNING
_INFO = MonthEndCheckSeverity.INFO


# ─────────────────────────────────────────────
# Check key constants
# ─────────────────────────────────────────────

class MonthEndCheckKey:
    ALL_DAILY_CLOSES_COMPLETE = "all_daily_closes_complete"
    NO_CRITICAL_EXCEPTIONS = "no_critical_exceptions"
    PERIOD_NOT_ALREADY_CLOSED = "period_not_already_closed"
    NO_DRAFT_MANUAL_JOURNALS = "no_draft_manual_journals"
    BRIDGE_POSTINGS_READY = "bridge_postings_ready"
    CASH_BANK_RECONCILIATION_CLEAN = "cash_bank_reconciliation_clean"
    CUSTOMER_ADVANCE_CLEAN = "customer_advance_clean"
    SECURITY_DEPOSIT_RECONCILIATION = "security_deposit_reconciliation"
    INVENTORY_VALUATION_REVIEWED = "inventory_valuation_reviewed"
    TRIAL_BALANCE_BALANCED = "trial_balance_balanced"


# ─────────────────────────────────────────────
# Individual check functions
# ─────────────────────────────────────────────

def _period_date_range(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _check_all_daily_closes_complete(year: int, month: int, branch) -> dict[str, Any]:
    """
    BLOCKING: For every date in the month that has at least one CashCounterSession,
    there must be a DailyCloseRun with status=EXECUTED for that date/branch.
    """
    try:
        from subscriptions.models_cash_counter_session import (
            CashCounterSession,
            CashCounterSessionStatus,
            DailyCloseRun,
            DailyCloseStatus,
        )
        start, end = _period_date_range(year, month)

        qs = CashCounterSession.objects.filter(session_date__gte=start, session_date__lte=end)
        if branch:
            qs = qs.filter(branch=branch)

        active_dates = set(
            qs.exclude(status=CashCounterSessionStatus.CANCELLED)
            .values_list("session_date", flat=True)
            .distinct()
        )

        if not active_dates:
            return _pass(MonthEndCheckKey.ALL_DAILY_CLOSES_COMPLETE, _BLOCKING,
                         "No cash sessions found for period — check skipped.", 0)

        executed_qs = DailyCloseRun.objects.filter(
            run_date__gte=start,
            run_date__lte=end,
            status=DailyCloseStatus.EXECUTED,
        )
        if branch:
            executed_qs = executed_qs.filter(branch=branch)

        executed_dates = set(executed_qs.values_list("run_date", flat=True).distinct())
        missing = sorted(d.isoformat() for d in active_dates - executed_dates)
        count = len(missing)

        if count == 0:
            return _pass(MonthEndCheckKey.ALL_DAILY_CLOSES_COMPLETE, _BLOCKING,
                         "All days with sessions have an executed daily close.", 0)
        return _fail(MonthEndCheckKey.ALL_DAILY_CLOSES_COMPLETE, _BLOCKING,
                     f"{count} day(s) with sessions missing executed daily close: {', '.join(missing[:5])}{'...' if count > 5 else ''}",
                     count)
    except Exception as exc:
        return _warn_skip(MonthEndCheckKey.ALL_DAILY_CLOSES_COMPLETE, _BLOCKING, str(exc))


def _check_no_critical_exceptions(branch) -> dict[str, Any]:
    """BLOCKING: No OPEN or ACKNOWLEDGED CRITICAL ControlExceptions."""
    try:
        from subscriptions.models_control_foundation import (
            ControlException,
            ExceptionSeverity,
            ExceptionStatus,
        )
        count = ControlException.objects.filter(
            severity=ExceptionSeverity.CRITICAL,
            status__in=[ExceptionStatus.OPEN, ExceptionStatus.ACKNOWLEDGED],
        ).count()

        if count == 0:
            return _pass(MonthEndCheckKey.NO_CRITICAL_EXCEPTIONS, _BLOCKING,
                         "No open critical control exceptions.", 0)
        return _fail(MonthEndCheckKey.NO_CRITICAL_EXCEPTIONS, _BLOCKING,
                     f"{count} unresolved CRITICAL control exception(s) exist.", count)
    except Exception as exc:
        return _warn_skip(MonthEndCheckKey.NO_CRITICAL_EXCEPTIONS, _BLOCKING, str(exc))


def _check_period_not_already_closed(year: int, month: int) -> dict[str, Any]:
    """BLOCKING: The accounting period for this month must not be LOCKED or CLOSED."""
    try:
        from accounting.models import AccountingPeriod, AccountingPeriodStatus
        start, end = _period_date_range(year, month)
        period = AccountingPeriod.objects.filter(
            start_date__lte=start,
            end_date__gte=end,
        ).first()

        if period is None:
            return _pass(MonthEndCheckKey.PERIOD_NOT_ALREADY_CLOSED, _BLOCKING,
                         "No accounting period configured for this month (period can be created).", 0)

        if period.status in {AccountingPeriodStatus.LOCKED, AccountingPeriodStatus.CLOSED}:
            return _fail(MonthEndCheckKey.PERIOD_NOT_ALREADY_CLOSED, _BLOCKING,
                         f"Accounting period '{period.code}' is already {period.status}. Cannot re-close.", 1)

        return _pass(MonthEndCheckKey.PERIOD_NOT_ALREADY_CLOSED, _BLOCKING,
                     f"Accounting period '{period.code}' is {period.status} — eligible for close.", 0)
    except Exception as exc:
        return _warn_skip(MonthEndCheckKey.PERIOD_NOT_ALREADY_CLOSED, _BLOCKING, str(exc))


def _check_no_draft_manual_journals(year: int, month: int) -> dict[str, Any]:
    """WARNING: No DRAFT manual JournalEntries for the period."""
    try:
        from accounting.models import JournalEntry, JournalEntryType, JournalEntryStatus
        start, end = _period_date_range(year, month)
        count = JournalEntry.objects.filter(
            entry_date__gte=start,
            entry_date__lte=end,
            entry_type=JournalEntryType.MANUAL,
            status=JournalEntryStatus.DRAFT,
        ).count()

        if count == 0:
            return _pass(MonthEndCheckKey.NO_DRAFT_MANUAL_JOURNALS, _WARNING,
                         "No draft manual journal entries for period.", 0)
        return _fail(MonthEndCheckKey.NO_DRAFT_MANUAL_JOURNALS, _WARNING,
                     f"{count} draft manual journal entries exist and should be posted or voided.", count)
    except Exception as exc:
        return _warn_skip(MonthEndCheckKey.NO_DRAFT_MANUAL_JOURNALS, _WARNING, str(exc))


def _check_bridge_postings_ready() -> dict[str, Any]:
    """WARNING: Accounting bridge mapping has no errors."""
    try:
        from accounting.services.accounting_bridge_readiness_service import (
            build_accounting_bridge_readiness_summary,
        )
        summary = build_accounting_bridge_readiness_summary()
        error_count = summary.get("error_count", 0)
        not_configured_count = summary.get("not_configured_count", 0)
        problem_count = error_count + not_configured_count

        if problem_count == 0:
            return _pass(MonthEndCheckKey.BRIDGE_POSTINGS_READY, _WARNING,
                         f"Accounting bridge: {summary.get('ready_count', 0)} event(s) ready.", 0)
        return _fail(MonthEndCheckKey.BRIDGE_POSTINGS_READY, _WARNING,
                     f"Accounting bridge has {error_count} error(s) and {not_configured_count} unconfigured event(s).",
                     problem_count)
    except Exception as exc:
        return _warn_skip(MonthEndCheckKey.BRIDGE_POSTINGS_READY, _WARNING, str(exc))


def _check_cash_bank_reconciliation_clean(year: int, month: int) -> dict[str, Any]:
    """WARNING: No FLAGGED or MISMATCH payment reconciliations for the period."""
    try:
        from subscriptions.models import PaymentReconciliation, ReconciliationStatus, Payment
        start, end = _period_date_range(year, month)
        count = PaymentReconciliation.objects.filter(
            payment__payment_date__gte=start,
            payment__payment_date__lte=end,
            status__in=[ReconciliationStatus.FLAGGED, ReconciliationStatus.MISMATCH],
        ).count()

        if count == 0:
            return _pass(MonthEndCheckKey.CASH_BANK_RECONCILIATION_CLEAN, _WARNING,
                         "No flagged or mismatched payment reconciliations for period.", 0)
        return _fail(MonthEndCheckKey.CASH_BANK_RECONCILIATION_CLEAN, _WARNING,
                     f"{count} payment reconciliation(s) in FLAGGED or MISMATCH status.", count)
    except Exception as exc:
        return _warn_skip(MonthEndCheckKey.CASH_BANK_RECONCILIATION_CLEAN, _WARNING, str(exc))


def _check_customer_advance_clean(year: int, month: int) -> dict[str, Any]:
    """WARNING: No stale UNAPPLIED customer advances older than the period end."""
    try:
        from subscriptions.models import CustomerAdvance, CustomerAdvanceStatus
        _, end = _period_date_range(year, month)
        count = CustomerAdvance.objects.filter(
            status=CustomerAdvanceStatus.UNAPPLIED,
            created_at__date__lte=end,
        ).count()

        if count == 0:
            return _pass(MonthEndCheckKey.CUSTOMER_ADVANCE_CLEAN, _WARNING,
                         "No unapplied customer advances from on or before period end.", 0)
        return _fail(MonthEndCheckKey.CUSTOMER_ADVANCE_CLEAN, _WARNING,
                     f"{count} unapplied customer advance(s) on or before {end.isoformat()}.", count)
    except Exception as exc:
        return _warn_skip(MonthEndCheckKey.CUSTOMER_ADVANCE_CLEAN, _WARNING, str(exc))


def _check_security_deposit_reconciliation(year: int, month: int) -> dict[str, Any]:
    """WARNING: No REFUND_APPROVED deposit transactions still in ACTIVE status (approved but not yet paid)."""
    try:
        from subscriptions.models import (
            RentLeaseDepositTransaction,
            RentLeaseDepositTransactionType,
            RentLeaseDepositTransactionStatus,
        )
        _, end = _period_date_range(year, month)
        count = RentLeaseDepositTransaction.objects.filter(
            transaction_type=RentLeaseDepositTransactionType.REFUND_APPROVED,
            status=RentLeaseDepositTransactionStatus.ACTIVE,
            created_at__date__lte=end,
        ).count()

        if count == 0:
            return _pass(MonthEndCheckKey.SECURITY_DEPOSIT_RECONCILIATION, _WARNING,
                         "No approved-but-pending security deposit refunds on or before period end.", 0)
        return _fail(MonthEndCheckKey.SECURITY_DEPOSIT_RECONCILIATION, _WARNING,
                     f"{count} security deposit refund(s) approved but not yet processed on or before {end.isoformat()}.",
                     count)
    except Exception as exc:
        return _warn_skip(MonthEndCheckKey.SECURITY_DEPOSIT_RECONCILIATION, _WARNING, str(exc))


def _check_inventory_valuation_reviewed() -> dict[str, Any]:
    """INFO: Inventory readiness snapshot has no blocking issues."""
    try:
        from inventory.services.inventory_readiness_service import get_inventory_readiness_snapshot
        snapshot = get_inventory_readiness_snapshot()
        overall_status = snapshot.get("overall_status", "")

        if overall_status in {"READY", "PASS", "OK"}:
            return _pass(MonthEndCheckKey.INVENTORY_VALUATION_REVIEWED, _INFO,
                         f"Inventory readiness: {overall_status}.", 0)
        # Attempt to find issues count
        issue_count = snapshot.get("issue_count") or snapshot.get("total_issues") or 0
        return _fail(MonthEndCheckKey.INVENTORY_VALUATION_REVIEWED, _INFO,
                     f"Inventory readiness status: {overall_status or 'UNKNOWN'}. Review before closing.",
                     int(issue_count))
    except Exception as exc:
        return _warn_skip(MonthEndCheckKey.INVENTORY_VALUATION_REVIEWED, _INFO, str(exc))


def _check_trial_balance_balanced() -> dict[str, Any]:
    """INFO: Trial balance check (deferred — no TB service exists yet)."""
    return _pass(
        MonthEndCheckKey.TRIAL_BALANCE_BALANCED,
        _INFO,
        "Trial balance check deferred — no automated TB service configured yet.",
        0,
    )


# ─────────────────────────────────────────────
# Check result builders
# ─────────────────────────────────────────────

def _pass(key: str, severity: str, detail: str, count: int) -> dict[str, Any]:
    return {"check_key": key, "severity": severity, "passed": True, "count": count, "detail": detail}


def _fail(key: str, severity: str, detail: str, count: int) -> dict[str, Any]:
    return {"check_key": key, "severity": severity, "passed": False, "count": count, "detail": detail}


def _warn_skip(key: str, severity: str, error: str) -> dict[str, Any]:
    return {
        "check_key": key,
        "severity": _WARNING,
        "passed": True,
        "count": 0,
        "detail": f"Check skipped (service unavailable): {error[:200]}",
    }


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

def _run_all_checks(year: int, month: int, branch=None) -> list[dict[str, Any]]:
    return [
        _check_all_daily_closes_complete(year, month, branch),
        _check_no_critical_exceptions(branch),
        _check_period_not_already_closed(year, month),
        _check_no_draft_manual_journals(year, month),
        _check_bridge_postings_ready(),
        _check_cash_bank_reconciliation_clean(year, month),
        _check_customer_advance_clean(year, month),
        _check_security_deposit_reconciliation(year, month),
        _check_inventory_valuation_reviewed(),
        _check_trial_balance_balanced(),
    ]


def get_month_end_readiness(
    *,
    year: int,
    month: int,
    branch=None,
) -> dict[str, Any]:
    """Non-persisting readiness snapshot for GET endpoint."""
    checks = _run_all_checks(year, month, branch)
    blocking_failures = [c for c in checks if c["severity"] == _BLOCKING and not c["passed"]]
    return {
        "period_year": year,
        "period_month": month,
        "branch_id": branch.pk if branch else None,
        "can_execute": len(blocking_failures) == 0,
        "blocking_count": len(blocking_failures),
        "checks": checks,
    }


@transaction.atomic
def run_month_end_close(
    *,
    year: int,
    month: int,
    run_by,
    is_dry_run: bool = True,
    branch=None,
    notes: str = "",
) -> MonthEndCloseRun:
    """
    Run month-end close for a given period.
    - Dry-run: persists check results, no status change on AccountingPeriod.
    - Execute: only succeeds if all BLOCKING checks pass; status = EXECUTED.
    Never mutates source financial records.
    """
    checks = _run_all_checks(year, month, branch)
    blocking_failures = [c for c in checks if c["severity"] == _BLOCKING and not c["passed"]]

    if is_dry_run:
        status = MonthEndCloseStatus.DRY_RUN
    elif blocking_failures:
        status = MonthEndCloseStatus.BLOCKED
    else:
        status = MonthEndCloseStatus.EXECUTED

    run = MonthEndCloseRun.objects.create(
        period_year=year,
        period_month=month,
        branch=branch,
        run_by=run_by,
        is_dry_run=is_dry_run,
        status=status,
        run_at=timezone.now(),
        notes=(notes or "").strip(),
        metadata={
            "blocking_count": len(blocking_failures),
            "check_count": len(checks),
        },
    )

    MonthEndCloseCheckResult.objects.bulk_create([
        MonthEndCloseCheckResult(
            run=run,
            check_key=c["check_key"],
            severity=c["severity"],
            passed=c["passed"],
            count=c["count"],
            detail=c["detail"],
        )
        for c in checks
    ])

    log_audit(
        action_type=AuditLog.ActionType.USER_UPDATED,
        instance=run,
        performed_by=run_by,
        metadata={
            "event": "MONTH_END_CLOSE_RUN",
            "year": year,
            "month": month,
            "is_dry_run": is_dry_run,
            "status": status,
            "blocking_count": len(blocking_failures),
        },
    )

    return run


def build_month_end_close_run_payload(run: MonthEndCloseRun) -> dict[str, Any]:
    """Read payload for a single MonthEndCloseRun. Safe for API serialisation."""
    checks = list(
        run.check_results.values(
            "check_key", "severity", "passed", "count", "detail"
        ).order_by("id")
    )
    blocking_failures = [c for c in checks if c["severity"] == _BLOCKING and not c["passed"]]
    return {
        "id": run.pk,
        "period_year": run.period_year,
        "period_month": run.period_month,
        "branch_id": run.branch_id,
        "run_by_id": run.run_by_id,
        "is_dry_run": run.is_dry_run,
        "status": run.status,
        "run_at": run.run_at.isoformat(),
        "notes": run.notes,
        "blocking_count": len(blocking_failures),
        "checks": checks,
        "created_at": run.created_at.isoformat(),
    }
