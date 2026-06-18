"""
P4D — Accounting Period Close Cockpit Service.

Read-only diagnostic layer.  No financial record is ever mutated.
No AccountingBridgePosting, JournalEntry, JournalLine, Payment, EMI,
StockLedger, BillingInvoice, ReceiptDocument, DirectSale,
RentLeaseBillingDemand, RentLeaseDepositTransaction, CustomerAdvance,
Commission, Payout, Reconciliation, or MoneyMovement rows are created
or modified by any function in this module.
"""
from __future__ import annotations

import calendar
import datetime as _dt
from datetime import date
from typing import Any

STATUS_OK = "OK"
STATUS_INFO = "INFO"
STATUS_WARNING = "WARNING"
STATUS_CRITICAL = "CRITICAL"

SEVERITY_INFO = "INFO"
SEVERITY_WARNING = "WARNING"
SEVERITY_CRITICAL = "CRITICAL"

_SEVERITY_RANK = {STATUS_OK: 0, STATUS_INFO: 1, STATUS_WARNING: 2, STATUS_CRITICAL: 3}

# The existing explicit audited lock endpoint (AccountingPeriodViewSet action).
_EXISTING_LOCK_ENDPOINT_TEMPLATE = "/api/v1/accounting/periods/{id}/lock/"


def _worst(*statuses: str) -> str:
    return max(statuses, key=lambda s: _SEVERITY_RANK.get(s, 0))


def _resolve_period(
    year: int | None,
    month: int | None,
    as_of: date | None,
) -> tuple[date, int, int, date, date]:
    from django.utils import timezone

    resolved_as_of = as_of or timezone.localdate()
    resolved_year = year or resolved_as_of.year
    resolved_month = month or resolved_as_of.month
    last_day = calendar.monthrange(resolved_year, resolved_month)[1]
    start = date(resolved_year, resolved_month, 1)
    end = date(resolved_year, resolved_month, last_day)
    return resolved_as_of, resolved_year, resolved_month, start, end


# ─────────────────────────────────────────────────────────────────────────────
# Period lock posture
# ─────────────────────────────────────────────────────────────────────────────

def build_period_lock_posture(year: int, month: int) -> dict:
    """
    Return the lock/close posture for the AccountingPeriod covering year/month.

    References the existing audited lock endpoint but never calls it.
    The existing lock endpoint is POST /api/v1/accounting/periods/{id}/lock/
    (AccountingPeriodViewSet.lock_period action, with full audit trail).
    """
    from accounting.models import AccountingPeriod, AccountingPeriodStatus

    last_day = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, last_day)

    try:
        period = (
            AccountingPeriod.objects
            .select_related("financial_year", "locked_by")
            .filter(start_date__lte=end, end_date__gte=start)
            .order_by("start_date", "id")
            .first()
        )
    except Exception:  # noqa: BLE001
        return {
            "period_exists": False,
            "period_id": None,
            "period_code": None,
            "status": None,
            "is_locked": False,
            "is_closed": False,
            "lock_allowed": False,
            "lock_blockers": ["Could not query accounting period."],
            "manual_lock_required": True,
            "existing_lock_endpoint": _EXISTING_LOCK_ENDPOINT_TEMPLATE,
        }

    if period is None:
        return {
            "period_exists": False,
            "period_id": None,
            "period_code": None,
            "status": None,
            "is_locked": False,
            "is_closed": False,
            "lock_allowed": False,
            "lock_blockers": ["No accounting period exists for this month."],
            "manual_lock_required": True,
            "existing_lock_endpoint": _EXISTING_LOCK_ENDPOINT_TEMPLATE,
        }

    is_locked = bool(
        period.is_locked
        or period.status in {AccountingPeriodStatus.LOCKED, AccountingPeriodStatus.CLOSED}
    )
    is_closed = period.status == AccountingPeriodStatus.CLOSED
    lock_allowed = not is_locked

    lock_blockers: list[str] = []
    if is_closed:
        lock_blockers.append("Period is already closed — it cannot be locked again.")
    elif is_locked:
        lock_blockers.append(f"Period '{period.code}' is already locked (status={period.status}).")

    return {
        "period_exists": True,
        "period_id": period.id,
        "period_code": period.code,
        "status": period.status,
        "is_locked": is_locked,
        "is_closed": is_closed,
        "lock_allowed": lock_allowed,
        "lock_blockers": lock_blockers,
        "manual_lock_required": True,
        "existing_lock_endpoint": _EXISTING_LOCK_ENDPOINT_TEMPLATE.replace("{id}", str(period.id)),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Section loaders (each wrapped defensively)
# ─────────────────────────────────────────────────────────────────────────────

def _load_month_end(year: int, month: int) -> dict[str, Any]:
    try:
        from subscriptions.services.control_month_end_close_service import get_month_end_readiness

        readiness = get_month_end_readiness(year=year, month=month)
        blocking_failures = [
            c for c in readiness.get("checks", [])
            if c.get("severity") == "BLOCKING" and not c.get("passed", True)
        ]
        warning_failures = [
            c for c in readiness.get("checks", [])
            if c.get("severity") == "WARNING" and not c.get("passed", True)
        ]

        if blocking_failures:
            section_status = STATUS_CRITICAL
        elif warning_failures:
            section_status = STATUS_WARNING
        elif not readiness.get("checks"):
            section_status = STATUS_INFO
        else:
            section_status = STATUS_OK

        return {
            "status": section_status,
            "can_execute": readiness.get("can_execute", False),
            "blocking_count": readiness.get("blocking_count", 0),
            "blocking_checks": [
                {"key": c["check_key"], "detail": c["detail"]}
                for c in blocking_failures
            ],
            "check_count": len(readiness.get("checks", [])),
            "deferred": False,
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": STATUS_INFO, "deferred": True, "message": str(exc)}


def _load_financial_intelligence(
    year: int, month: int, as_of: date | None
) -> dict[str, Any]:
    try:
        from accounting.services.financial_intelligence_service import (
            build_financial_intelligence_snapshot,
        )

        snap = build_financial_intelligence_snapshot(
            as_of=as_of,
            period={"year": year, "month": month},
        )
        return {
            "status": snap.get("overall_status", STATUS_INFO),
            "overall_status": snap.get("overall_status", STATUS_INFO),
            "action_item_count": len(snap.get("action_items", [])),
            "deferred": False,
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": STATUS_INFO, "deferred": True, "message": str(exc)}


def _load_trial_balance(
    year: int, month: int, as_of: date | None
) -> dict[str, Any]:
    try:
        from accounting.services.trial_balance_check_service import build_trial_balance_check

        tb = build_trial_balance_check(
            as_of=as_of,
            period={"year": year, "month": month},
        )
        return {
            "status": tb.get("status", STATUS_INFO),
            "is_balanced": tb.get("is_balanced", False),
            "total_debit": tb.get("total_debit", "0.00"),
            "total_credit": tb.get("total_credit", "0.00"),
            "difference": tb.get("difference", "0.00"),
            "critical_check_count": tb.get("critical_check_count", 0),
            "draft_journal_count": next(
                (
                    c.get("count", 0)
                    for c in tb.get("checks", [])
                    if c.get("key") == "journal.draft_in_period"
                ),
                0,
            ),
            "deferred": False,
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": STATUS_INFO, "deferred": True, "message": str(exc)}


def _load_liability_reconciliation(
    year: int, month: int, as_of: date | None
) -> dict[str, Any]:
    try:
        from accounting.services.liability_reconciliation_service import (
            build_liability_reconciliation_snapshot,
        )

        snap = build_liability_reconciliation_snapshot(
            as_of=as_of,
            period={"year": year, "month": month},
        )
        return {
            "status": snap.get("overall_status", STATUS_INFO),
            "overall_status": snap.get("overall_status", STATUS_INFO),
            "action_item_count": len(snap.get("action_items", [])),
            "deferred": False,
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": STATUS_INFO, "deferred": True, "message": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# Blockers
# ─────────────────────────────────────────────────────────────────────────────

def build_close_blockers(
    year: int,
    month: int,
    as_of: date | None = None,
    *,
    _month_end: dict | None = None,
    _trial_balance: dict | None = None,
    _liability_recon: dict | None = None,
    _period_lock: dict | None = None,
) -> list[dict]:
    """
    Return the list of blocking conditions that prevent period close.

    Callers may pass pre-loaded section dicts to avoid redundant DB queries.
    Each blocker has: key, severity, title, description, source_area.
    """
    resolved_as_of, resolved_year, resolved_month, _start, _end = _resolve_period(
        year, month, as_of
    )

    me = _month_end if _month_end is not None else _load_month_end(resolved_year, resolved_month)
    tb = _trial_balance if _trial_balance is not None else _load_trial_balance(
        resolved_year, resolved_month, resolved_as_of
    )
    lr = _liability_recon if _liability_recon is not None else _load_liability_reconciliation(
        resolved_year, resolved_month, resolved_as_of
    )
    pl = _period_lock if _period_lock is not None else build_period_lock_posture(
        resolved_year, resolved_month
    )

    blockers: list[dict] = []

    # Trial balance imbalance
    if not tb.get("deferred") and not tb.get("is_balanced", True):
        blockers.append({
            "key": "trial_balance.imbalance",
            "severity": SEVERITY_CRITICAL,
            "title": "Trial Balance Not Balanced",
            "description": (
                f"Debit ({tb.get('total_debit')}) ≠ Credit ({tb.get('total_credit')}), "
                f"difference={tb.get('difference')}. Resolve all journal integrity issues before close."
            ),
            "source_area": "trial_balance",
        })

    if not tb.get("deferred") and tb.get("critical_check_count", 0) > 0 and tb.get("is_balanced", True):
        blockers.append({
            "key": "trial_balance.critical_checks",
            "severity": SEVERITY_CRITICAL,
            "title": "Trial Balance Critical Checks Failed",
            "description": (
                f"{tb['critical_check_count']} critical integrity check(s) failed on trial balance "
                "(e.g. posted journals with no lines, both-sides non-zero). Investigate before close."
            ),
            "source_area": "trial_balance",
        })

    # Liability reconciliation critical
    if not lr.get("deferred") and lr.get("overall_status") == STATUS_CRITICAL:
        blockers.append({
            "key": "liability_reconciliation.critical",
            "severity": SEVERITY_CRITICAL,
            "title": "Liability Reconciliation Critical Mismatch",
            "description": (
                "P4C liability reconciliation reports a CRITICAL mismatch on customer advances "
                "or security deposits. Reconcile before closing the period."
            ),
            "source_area": "liability_reconciliation",
        })

    # Month-end critical (blocking checks failed)
    if not me.get("deferred") and me.get("blocking_count", 0) > 0:
        failed_keys = ", ".join(
            c.get("key", c.get("check_key", "?"))
            for c in me.get("blocking_checks", [])[:5]
        )
        blockers.append({
            "key": "month_end.blocking_checks",
            "severity": SEVERITY_CRITICAL,
            "title": "Month-End Blocking Checks Failed",
            "description": (
                f"{me['blocking_count']} month-end blocking check(s) failed: {failed_keys}. "
                "Execute month-end close (P2C) and clear all blockers before locking the period."
            ),
            "source_area": "month_end",
        })

    # Period does not exist — cannot close what doesn't exist
    if not pl.get("period_exists"):
        blockers.append({
            "key": "period.missing",
            "severity": SEVERITY_CRITICAL,
            "title": "Accounting Period Not Configured",
            "description": (
                "No accounting period exists for this month. "
                "Generate monthly periods before attempting close."
            ),
            "source_area": "period_lock",
        })

    return blockers


# ─────────────────────────────────────────────────────────────────────────────
# Warnings
# ─────────────────────────────────────────────────────────────────────────────

def _build_warnings(
    me: dict,
    tb: dict,
    lr: dict,
    fi: dict,
    pl: dict,
) -> list[dict]:
    warnings: list[dict] = []

    # Draft journals
    draft_count = tb.get("draft_journal_count", 0)
    if not tb.get("deferred") and draft_count > 0:
        warnings.append({
            "key": "trial_balance.draft_journals",
            "severity": SEVERITY_WARNING,
            "title": "Draft Journals Exist in Period",
            "description": (
                f"{draft_count} draft journal(s) in this period are excluded from the trial balance. "
                "Post or void them before month-end close."
            ),
            "source_area": "trial_balance",
        })

    # Financial intelligence warnings
    if not fi.get("deferred") and fi.get("status") in {STATUS_WARNING, STATUS_CRITICAL}:
        warnings.append({
            "key": "financial_intelligence.issues",
            "severity": SEVERITY_WARNING,
            "title": "Financial Intelligence Issues Detected",
            "description": (
                f"P4A financial intelligence overall status is {fi.get('status')}. "
                f"Review action items ({fi.get('action_item_count', 0)} total) before close."
            ),
            "source_area": "financial_intelligence",
        })

    # Liability reconciliation warnings
    if not lr.get("deferred") and lr.get("overall_status") == STATUS_WARNING:
        warnings.append({
            "key": "liability_reconciliation.warnings",
            "severity": SEVERITY_WARNING,
            "title": "Liability Reconciliation Warnings",
            "description": (
                "P4C liability reconciliation has warnings on customer advances or security deposits. "
                "Review before closing."
            ),
            "source_area": "liability_reconciliation",
        })

    # Period already locked/closed
    if pl.get("is_closed"):
        warnings.append({
            "key": "period.already_closed",
            "severity": SEVERITY_WARNING,
            "title": "Period Already Closed",
            "description": f"Accounting period '{pl.get('period_code')}' is already CLOSED.",
            "source_area": "period_lock",
        })
    elif pl.get("is_locked"):
        warnings.append({
            "key": "period.already_locked",
            "severity": SEVERITY_WARNING,
            "title": "Period Already Locked",
            "description": f"Accounting period '{pl.get('period_code')}' is already LOCKED.",
            "source_area": "period_lock",
        })

    return warnings


# ─────────────────────────────────────────────────────────────────────────────
# Action items
# ─────────────────────────────────────────────────────────────────────────────

def build_close_action_items(
    year: int,
    month: int,
    as_of: date | None = None,
    *,
    _month_end: dict | None = None,
    _trial_balance: dict | None = None,
    _liability_recon: dict | None = None,
    _financial_intelligence: dict | None = None,
) -> list[dict]:
    """
    Return prioritised action items combining all P2C/P4A/P4B/P4C action items.

    Severity order: CRITICAL → WARNING → INFO.
    Each item has: key, severity, title, description, source_area, count, deferred.
    """
    resolved_as_of, resolved_year, resolved_month, _start, _end = _resolve_period(
        year, month, as_of
    )
    items: list[dict] = []

    # P4B trial balance action items
    try:
        from accounting.services.trial_balance_check_service import (
            build_trial_balance_action_items,
        )

        tb_items = build_trial_balance_action_items(
            as_of=resolved_as_of,
            period={"year": resolved_year, "month": resolved_month},
        )
        for item in tb_items:
            item.setdefault("source_area", "trial_balance")
            items.append(item)
    except Exception:  # noqa: BLE001
        items.append({
            "key": "trial_balance.unavailable",
            "severity": SEVERITY_INFO,
            "title": "Trial Balance Action Items Unavailable",
            "description": "Could not load P4B trial balance action items.",
            "source_area": "trial_balance",
            "count": 0,
            "deferred": True,
        })

    # P4C liability reconciliation action items
    try:
        from accounting.services.liability_reconciliation_service import (
            build_liability_reconciliation_action_items,
        )

        lr_items = build_liability_reconciliation_action_items(
            as_of=resolved_as_of,
            period={"year": resolved_year, "month": resolved_month},
        )
        for item in lr_items:
            item.setdefault("source_area", "liability_reconciliation")
            items.append(item)
    except Exception:  # noqa: BLE001
        items.append({
            "key": "liability_reconciliation.unavailable",
            "severity": SEVERITY_INFO,
            "title": "Liability Reconciliation Action Items Unavailable",
            "description": "Could not load P4C liability reconciliation action items.",
            "source_area": "liability_reconciliation",
            "count": 0,
            "deferred": True,
        })

    # P4A financial intelligence action items
    try:
        from accounting.services.financial_intelligence_service import build_financial_action_items

        fi_items = build_financial_action_items(
            as_of=resolved_as_of,
            period={"year": resolved_year, "month": resolved_month},
        )
        for item in fi_items:
            item.setdefault("source_area", "financial_intelligence")
            items.append(item)
    except Exception:  # noqa: BLE001
        items.append({
            "key": "financial_intelligence.unavailable",
            "severity": SEVERITY_INFO,
            "title": "Financial Intelligence Action Items Unavailable",
            "description": "Could not load P4A financial intelligence action items.",
            "source_area": "financial_intelligence",
            "count": 0,
            "deferred": True,
        })

    # Month-end check failures as action items
    me = _month_end if _month_end is not None else _load_month_end(resolved_year, resolved_month)
    for check in me.get("blocking_checks", []):
        items.append({
            "key": f"month_end.{check.get('key', 'check')}",
            "severity": SEVERITY_CRITICAL,
            "title": f"Month-End Blocker: {check.get('key', 'Unknown')}",
            "description": check.get("detail", "Month-end blocking check failed."),
            "source_area": "month_end",
            "count": 1,
            "deferred": False,
        })

    _rank = {SEVERITY_CRITICAL: 0, SEVERITY_WARNING: 1, SEVERITY_INFO: 2}
    items.sort(key=lambda a: (_rank.get(a.get("severity", SEVERITY_INFO), 9), a.get("key", "")))
    return items


# ─────────────────────────────────────────────────────────────────────────────
# Main cockpit builder
# ─────────────────────────────────────────────────────────────────────────────

def build_accounting_close_cockpit(
    year: int,
    month: int,
    as_of: date | None = None,
) -> dict:
    """
    Build a complete read-only accounting period close cockpit for year/month.

    Combines:
    - P2C month-end close readiness
    - P4A financial intelligence snapshot
    - P4B trial balance automation check
    - P4C customer advance / security deposit liability reconciliation
    - AccountingPeriod lock/close state

    No financial records are created or mutated.
    """
    resolved_as_of, resolved_year, resolved_month, _start, _end = _resolve_period(
        year, month, as_of
    )

    me = _load_month_end(resolved_year, resolved_month)
    fi = _load_financial_intelligence(resolved_year, resolved_month, resolved_as_of)
    tb = _load_trial_balance(resolved_year, resolved_month, resolved_as_of)
    lr = _load_liability_reconciliation(resolved_year, resolved_month, resolved_as_of)
    pl = build_period_lock_posture(resolved_year, resolved_month)

    blockers = build_close_blockers(
        resolved_year,
        resolved_month,
        resolved_as_of,
        _month_end=me,
        _trial_balance=tb,
        _liability_recon=lr,
        _period_lock=pl,
    )
    warnings = _build_warnings(me, tb, lr, fi, pl)
    action_items = build_close_action_items(
        resolved_year,
        resolved_month,
        resolved_as_of,
        _month_end=me,
        _trial_balance=tb,
        _liability_recon=lr,
        _financial_intelligence=fi,
    )

    has_critical = any(b["severity"] == SEVERITY_CRITICAL for b in blockers)
    can_close = not has_critical
    can_lock = (
        not has_critical
        and pl.get("period_exists", False)
        and pl.get("lock_allowed", False)
    )

    section_statuses = [
        me.get("status", STATUS_INFO),
        fi.get("status", STATUS_INFO),
        tb.get("status", STATUS_INFO),
        lr.get("status", STATUS_INFO),
    ]
    if has_critical:
        section_statuses.append(STATUS_CRITICAL)

    overall_status = STATUS_OK
    for s in section_statuses:
        overall_status = _worst(overall_status, s)

    period_state = {
        "year": resolved_year,
        "month": resolved_month,
        "period_start": _start.isoformat(),
        "period_end": _end.isoformat(),
        "period_code": pl.get("period_code"),
        "period_id": pl.get("period_id"),
        "status": pl.get("status"),
        "is_locked": pl.get("is_locked", False),
        "is_closed": pl.get("is_closed", False),
    }

    return {
        "period": {"year": resolved_year, "month": resolved_month},
        "as_of": resolved_as_of.isoformat(),
        "overall_status": overall_status,
        "can_close": can_close,
        "can_lock": can_lock,
        "period_state": period_state,
        "sections": {
            "month_end": me,
            "financial_intelligence": fi,
            "trial_balance": tb,
            "liability_reconciliation": lr,
            "period_lock": pl,
        },
        "blockers": blockers,
        "warnings": warnings,
        "action_items": action_items,
        "metadata": {
            "generated_at": _dt.datetime.utcnow().isoformat() + "Z",
            "read_only": True,
            "note": (
                "P4D Close Cockpit — read-only diagnostic. "
                "No financial records are created or mutated. "
                "Period lock requires explicit admin action via the existing lock endpoint."
            ),
        },
    }
