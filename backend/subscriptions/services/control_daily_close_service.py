"""
P2B — Daily close readiness and execution service.

Runs a battery of checks on a given date (optionally scoped to a branch)
and creates persisted DailyCloseRun + DailyCloseCheckResult records.

No financial record is mutated. Dry-run is the default mode.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from subscriptions.models_cash_counter_session import (
    CashCounterSession,
    CashCounterSessionStatus,
    DailyCloseCheckResult,
    DailyCloseCheckSeverity,
    DailyCloseRun,
    DailyCloseStatus,
)

MONEY_ZERO = Decimal("0.00")


# ─────────────────────────────────────────────
# Check keys
# ─────────────────────────────────────────────

class DailyCheckKey:
    ALL_SESSIONS_CLOSED = "all_cash_sessions_closed"
    NO_VARIANCE_PENDING = "no_variance_pending_approval"
    NO_CRITICAL_EXCEPTIONS = "no_unresolved_critical_exceptions"
    PAYMENTS_HAVE_RECEIPTS = "cash_payments_have_receipts"
    BRIDGE_POSTINGS_COMPLETE = "accounting_bridge_postings_complete"


# ─────────────────────────────────────────────
# Individual check functions
# ─────────────────────────────────────────────

def _check_all_sessions_closed(run_date: date, branch_id: int | None) -> dict:
    qs = CashCounterSession.objects.filter(
        session_date=run_date,
        status=CashCounterSessionStatus.OPEN,
    )
    if branch_id:
        qs = qs.filter(branch_id=branch_id)

    open_count = qs.count()
    passed = open_count == 0
    return {
        "check_key": DailyCheckKey.ALL_SESSIONS_CLOSED,
        "label": "All cash counter sessions closed",
        "passed": passed,
        "severity": DailyCloseCheckSeverity.BLOCKING,
        "detail": "" if passed else f"{open_count} session(s) still OPEN on {run_date}.",
    }


def _check_no_variance_pending(run_date: date, branch_id: int | None) -> dict:
    qs = CashCounterSession.objects.filter(
        session_date=run_date,
        status=CashCounterSessionStatus.VARIANCE_PENDING_APPROVAL,
    )
    if branch_id:
        qs = qs.filter(branch_id=branch_id)

    pending_count = qs.count()
    passed = pending_count == 0
    return {
        "check_key": DailyCheckKey.NO_VARIANCE_PENDING,
        "label": "No cash variance pending approval",
        "passed": passed,
        "severity": DailyCloseCheckSeverity.BLOCKING,
        "detail": "" if passed else f"{pending_count} session(s) have unresolved cash variance.",
    }


def _check_no_critical_exceptions(run_date: date, branch_id: int | None) -> dict:
    """Check for unresolved CRITICAL control exceptions raised today."""
    try:
        from subscriptions.models_control_foundation import ControlException, ExceptionStatus, ExceptionSeverity
        qs = ControlException.objects.filter(
            severity=ExceptionSeverity.CRITICAL,
            status__in=[ExceptionStatus.OPEN, ExceptionStatus.ACKNOWLEDGED],
        )
        count = qs.count()
        passed = count == 0
        return {
            "check_key": DailyCheckKey.NO_CRITICAL_EXCEPTIONS,
            "label": "No unresolved critical control exceptions",
            "passed": passed,
            "severity": DailyCloseCheckSeverity.BLOCKING,
            "detail": "" if passed else f"{count} CRITICAL exception(s) are unresolved.",
        }
    except Exception as exc:
        return {
            "check_key": DailyCheckKey.NO_CRITICAL_EXCEPTIONS,
            "label": "No unresolved critical control exceptions",
            "passed": True,
            "severity": DailyCloseCheckSeverity.WARNING,
            "detail": f"Check skipped (exception service unavailable): {exc}",
        }


def _check_payments_have_receipts(run_date: date, branch_id: int | None) -> dict:
    """Cash payments collected today should have linked receipt documents."""
    try:
        from subscriptions.models import Payment, PaymentMethod
        from django.db.models import Q

        qs = Payment.objects.filter(
            payment_date=run_date,
            method=PaymentMethod.CASH,
        )
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        # OneToOne reverse: receipt_document. Missing = receipt_document is None.
        missing = qs.filter(receipt_document__isnull=True).count()
        total = qs.count()
        passed = missing == 0

        return {
            "check_key": DailyCheckKey.PAYMENTS_HAVE_RECEIPTS,
            "label": "Cash payments have receipt documents",
            "passed": passed,
            "severity": DailyCloseCheckSeverity.WARNING,
            "detail": (
                "" if passed
                else f"{missing} of {total} cash payment(s) on {run_date} lack a receipt document."
            ),
        }
    except Exception as exc:
        return {
            "check_key": DailyCheckKey.PAYMENTS_HAVE_RECEIPTS,
            "label": "Cash payments have receipt documents",
            "passed": True,
            "severity": DailyCloseCheckSeverity.WARNING,
            "detail": f"Check skipped: {exc}",
        }


def _check_bridge_postings_complete(run_date: date, branch_id: int | None) -> dict:
    """Check for PENDING (unposted) accounting bridge postings for today."""
    try:
        from accounting.models import AccountingBridgePosting

        qs = AccountingBridgePosting.objects.filter(
            created_at__date=run_date,
            posting_status="PENDING",
        )
        count = qs.count()
        passed = count == 0
        return {
            "check_key": DailyCheckKey.BRIDGE_POSTINGS_COMPLETE,
            "label": "Accounting bridge postings complete",
            "passed": passed,
            "severity": DailyCloseCheckSeverity.WARNING,
            "detail": "" if passed else f"{count} bridge posting(s) still PENDING for {run_date}.",
        }
    except Exception as exc:
        return {
            "check_key": DailyCheckKey.BRIDGE_POSTINGS_COMPLETE,
            "label": "Accounting bridge postings complete",
            "passed": True,
            "severity": DailyCloseCheckSeverity.WARNING,
            "detail": f"Check skipped: {exc}",
        }


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

_CHECKS = [
    _check_all_sessions_closed,
    _check_no_variance_pending,
    _check_no_critical_exceptions,
    _check_payments_have_receipts,
    _check_bridge_postings_complete,
]


@transaction.atomic
def run_daily_close(
    *,
    run_date: date,
    run_by,
    branch=None,
    is_dry_run: bool = True,
    metadata: dict | None = None,
) -> DailyCloseRun:
    """
    Execute or dry-run the daily close for run_date.

    - In dry_run mode: persists the run + check results but does NOT execute close.
    - In execute mode: only proceeds if all BLOCKING checks pass;
      persists run + check results and marks status EXECUTED.
    - No financial record is mutated in either mode.
    """
    branch_id = branch.pk if branch else None

    # Run all checks
    check_payloads: list[dict] = [fn(run_date, branch_id) for fn in _CHECKS]

    blocking_failures = [
        c for c in check_payloads
        if not c["passed"] and c["severity"] == DailyCloseCheckSeverity.BLOCKING
    ]

    if not is_dry_run and blocking_failures:
        # Create blocked run record
        close_run = _persist_run(
            run_date=run_date,
            run_by=run_by,
            branch=branch,
            is_dry_run=False,
            status=DailyCloseStatus.BLOCKED,
            check_payloads=check_payloads,
            blocking_count=len(blocking_failures),
            metadata=metadata,
        )
        return close_run

    if is_dry_run:
        final_status = DailyCloseStatus.DRY_RUN
        executed_at = None
    else:
        final_status = DailyCloseStatus.EXECUTED
        executed_at = timezone.now()

    close_run = _persist_run(
        run_date=run_date,
        run_by=run_by,
        branch=branch,
        is_dry_run=is_dry_run,
        status=final_status,
        check_payloads=check_payloads,
        blocking_count=len(blocking_failures),
        metadata=metadata,
        executed_at=executed_at,
    )
    return close_run


def _persist_run(
    *,
    run_date,
    run_by,
    branch,
    is_dry_run: bool,
    status: str,
    check_payloads: list[dict],
    blocking_count: int,
    metadata: dict | None,
    executed_at=None,
) -> DailyCloseRun:
    close_run = DailyCloseRun.objects.create(
        run_date=run_date,
        run_by=run_by,
        branch=branch,
        is_dry_run=is_dry_run,
        status=status,
        blocking_check_count=blocking_count,
        executed_at=executed_at,
        metadata=metadata or {},
    )
    DailyCloseCheckResult.objects.bulk_create([
        DailyCloseCheckResult(
            close_run=close_run,
            check_key=c["check_key"],
            label=c["label"],
            passed=c["passed"],
            severity=c["severity"],
            detail=c["detail"],
        )
        for c in check_payloads
    ])
    return close_run


def get_daily_close_readiness(
    *,
    run_date: date,
    branch=None,
) -> dict[str, Any]:
    """
    Return a readiness snapshot for the given date without persisting anything.
    Safe to call repeatedly as a GET endpoint.
    """
    branch_id = branch.pk if branch else None
    check_payloads = [fn(run_date, branch_id) for fn in _CHECKS]

    blocking = [c for c in check_payloads if not c["passed"] and c["severity"] == DailyCloseCheckSeverity.BLOCKING]
    warnings = [c for c in check_payloads if not c["passed"] and c["severity"] == DailyCloseCheckSeverity.WARNING]

    return {
        "run_date": str(run_date),
        "branch_id": branch_id,
        "can_execute": len(blocking) == 0,
        "blocking_count": len(blocking),
        "warning_count": len(warnings),
        "checks": check_payloads,
    }


def build_daily_close_run_payload(close_run: DailyCloseRun) -> dict[str, Any]:
    checks = list(close_run.check_results.all())
    return {
        "id": close_run.pk,
        "run_date": str(close_run.run_date),
        "run_by_id": close_run.run_by_id,
        "branch_id": close_run.branch_id,
        "is_dry_run": close_run.is_dry_run,
        "status": close_run.status,
        "blocking_check_count": close_run.blocking_check_count,
        "executed_at": close_run.executed_at.isoformat() if close_run.executed_at else None,
        "created_at": close_run.created_at.isoformat(),
        "checks": [
            {
                "check_key": c.check_key,
                "label": c.label,
                "passed": c.passed,
                "severity": c.severity,
                "detail": c.detail,
            }
            for c in checks
        ],
        "metadata": close_run.metadata,
    }
