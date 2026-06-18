"""
P4B — Trial Balance Automation Check Service.

Read-only diagnostic layer.  No financial record is ever mutated.
No AccountingBridgePosting, JournalEntry, JournalLine, Payment, EMI,
StockLedger, BillingInvoice, ReceiptDocument, DirectSale, Commission,
Payout, Reconciliation, or MoneyMovement rows are created or modified
by any function in this module.
"""
from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal
from typing import Any


MONEY_ZERO = Decimal("0.00")

STATUS_OK = "OK"
STATUS_INFO = "INFO"
STATUS_WARNING = "WARNING"
STATUS_CRITICAL = "CRITICAL"

SEVERITY_INFO = "INFO"
SEVERITY_WARNING = "WARNING"
SEVERITY_CRITICAL = "CRITICAL"

_SEVERITY_RANK = {STATUS_OK: 0, STATUS_INFO: 1, STATUS_WARNING: 2, STATUS_CRITICAL: 3}

# ASSET and EXPENSE accounts normally carry a debit balance.
# LIABILITY, EQUITY, and INCOME accounts normally carry a credit balance.
_NORMAL_BALANCE: dict[str, str] = {
    "ASSET": "DR",
    "EXPENSE": "DR",
    "LIABILITY": "CR",
    "EQUITY": "CR",
    "INCOME": "CR",
}


def _worst(*statuses: str) -> str:
    return max(statuses, key=lambda s: _SEVERITY_RANK.get(s, 0))


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY_ZERO)


def _money_str(value: Any) -> str:
    return f"{_money(value)}"


def _resolve_period(
    as_of: date | None,
    period: dict | None,
) -> tuple[date, int, int, date, date]:
    """Return (as_of, year, month, period_start, period_end)."""
    from django.utils import timezone

    if as_of is None:
        as_of = timezone.localdate()

    year = int((period or {}).get("year") or as_of.year)
    month = int((period or {}).get("month") or as_of.month)
    last_day = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, last_day)
    return as_of, year, month, start, end


def _posted_lines(start: date, end: date):
    """Return JournalEntryLine queryset restricted to POSTED entries in [start, end]."""
    from accounting.models import JournalEntryLine, JournalEntryStatus

    return (
        JournalEntryLine.objects.select_related("journal_entry", "chart_account")
        .filter(
            journal_entry__status=JournalEntryStatus.POSTED,
            journal_entry__entry_date__gte=start,
            journal_entry__entry_date__lte=end,
        )
        .order_by("journal_entry__entry_date", "journal_entry_id", "id")
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def build_trial_balance_rows(
    as_of: date | None = None,
    period: dict | None = None,
) -> list[dict]:
    """
    Build per-account trial balance rows for the resolved period.

    Opening balances are not automated yet; those columns are returned as 0
    with a deferred/INFO marker on each row.  Period debit/credit totals are
    computed from POSTED JournalEntryLine records only.  VOID and DRAFT
    entries are excluded from totals.
    """
    _as_of, year, month, start, end = _resolve_period(as_of, period)

    rows_by_account: dict[int, dict] = {}
    total_debit = MONEY_ZERO
    total_credit = MONEY_ZERO

    for line in _posted_lines(start, end):
        acct = line.chart_account
        if acct.id not in rows_by_account:
            rows_by_account[acct.id] = {
                "account_id": acct.id,
                "account_code": acct.code,
                "account_name": acct.name,
                "account_type": acct.account_type,
                "is_active": acct.is_active,
                "normal_balance": _NORMAL_BALANCE.get(acct.account_type),
                # Opening balance automation is deferred (P4B-OB-001).
                "opening_debit": _money_str(MONEY_ZERO),
                "opening_credit": _money_str(MONEY_ZERO),
                "_period_debit": MONEY_ZERO,
                "_period_credit": MONEY_ZERO,
            }

        row = rows_by_account[acct.id]
        row["_period_debit"] += _money(line.debit_amount)
        row["_period_credit"] += _money(line.credit_amount)
        total_debit += _money(line.debit_amount)
        total_credit += _money(line.credit_amount)

    result: list[dict] = []
    for row in rows_by_account.values():
        pd = row.pop("_period_debit")
        pc = row.pop("_period_credit")
        cd = pd  # closing = opening(0) + period; opening deferred
        cc = pc

        normal = row["normal_balance"]
        if normal == "DR":
            net = cd - cc
        elif normal == "CR":
            net = cc - cd
        else:
            net = cd - cc

        # Flag accounts with an unusual balance direction.
        if normal == "DR" and net < MONEY_ZERO:
            row_status = STATUS_WARNING
        elif normal == "CR" and net < MONEY_ZERO:
            row_status = STATUS_WARNING
        elif not row["is_active"] and (pd > MONEY_ZERO or pc > MONEY_ZERO):
            row_status = STATUS_WARNING
        else:
            row_status = STATUS_OK

        row.update(
            period_debit=_money_str(pd),
            period_credit=_money_str(pc),
            closing_debit=_money_str(cd),
            closing_credit=_money_str(cc),
            net_balance=_money_str(net),
            status=row_status,
            metadata={
                "opening_balance_deferred": True,
                "opening_balance_message": "Opening balance automation not available yet (P4B-OB-001).",
            },
        )
        result.append(row)

    result.sort(key=lambda r: (r["account_code"], r["account_id"]))
    return result


def validate_trial_balance(
    as_of: date | None = None,
    period: dict | None = None,
) -> list[dict]:
    """
    Run data-quality checks and return a list of check result dicts.

    Each check has:
        key, label, status (OK/INFO/WARNING/CRITICAL), count, message
    """
    from accounting.models import (
        AccountingPeriod,
        AccountingPeriodStatus,
        JournalEntry,
        JournalEntryLine,
        JournalEntryStatus,
    )
    from django.db.models import Count, Q

    _as_of, year, month, start, end = _resolve_period(as_of, period)
    checks: list[dict] = []

    # ── 1. Balance check ──────────────────────────────────────────────────────
    from django.db.models import Sum

    agg = (
        JournalEntryLine.objects.filter(
            journal_entry__status=JournalEntryStatus.POSTED,
            journal_entry__entry_date__gte=start,
            journal_entry__entry_date__lte=end,
        ).aggregate(
            total_debit=Sum("debit_amount"),
            total_credit=Sum("credit_amount"),
        )
    )
    total_debit = _money(agg["total_debit"])
    total_credit = _money(agg["total_credit"])
    difference = total_debit - total_credit
    is_balanced = difference == MONEY_ZERO

    checks.append({
        "key": "balance.debit_equals_credit",
        "label": "Debit equals Credit",
        "status": STATUS_OK if is_balanced else STATUS_CRITICAL,
        "count": 0,
        "message": (
            "Total debits equal total credits."
            if is_balanced
            else f"Imbalance detected: debit={_money_str(total_debit)}, credit={_money_str(total_credit)}, difference={_money_str(difference)}."
        ),
        "metadata": {
            "total_debit": _money_str(total_debit),
            "total_credit": _money_str(total_credit),
            "difference": _money_str(difference),
        },
    })

    # ── 2. Draft journals in period ───────────────────────────────────────────
    draft_count = JournalEntry.objects.filter(
        status=JournalEntryStatus.DRAFT,
        entry_date__gte=start,
        entry_date__lte=end,
    ).count()
    checks.append({
        "key": "journal.draft_in_period",
        "label": "Unposted/Draft Journals in Period",
        "status": STATUS_WARNING if draft_count > 0 else STATUS_OK,
        "count": draft_count,
        "message": (
            f"{draft_count} draft journal(s) exist in this period and are excluded from totals."
            if draft_count > 0
            else "No draft journals in period."
        ),
        "metadata": {},
    })

    # ── 3. Voided journals in period (informational) ───────────────────────────
    void_count = JournalEntry.objects.filter(
        status=JournalEntryStatus.VOID,
        entry_date__gte=start,
        entry_date__lte=end,
    ).count()
    checks.append({
        "key": "journal.voided_in_period",
        "label": "Voided Journals in Period",
        "status": STATUS_INFO if void_count > 0 else STATUS_OK,
        "count": void_count,
        "message": (
            f"{void_count} voided journal(s) exist in this period and are correctly excluded from totals."
            if void_count > 0
            else "No voided journals in period."
        ),
        "metadata": {},
    })

    # ── 4. Posted journals with no lines ──────────────────────────────────────
    posted_no_lines = (
        JournalEntry.objects.filter(
            status=JournalEntryStatus.POSTED,
            entry_date__gte=start,
            entry_date__lte=end,
        )
        .annotate(line_count=Count("lines"))
        .filter(line_count=0)
        .count()
    )
    checks.append({
        "key": "journal.posted_no_lines",
        "label": "Posted Journals With No Lines",
        "status": STATUS_CRITICAL if posted_no_lines > 0 else STATUS_OK,
        "count": posted_no_lines,
        "message": (
            f"{posted_no_lines} posted journal(s) have no journal lines — these represent a data integrity risk."
            if posted_no_lines > 0
            else "All posted journals have lines."
        ),
        "metadata": {},
    })

    # ── 5. Lines with both debit and credit non-zero ───────────────────────────
    # The DB constraint (accounting_line_exactly_one_side_positive) should prevent
    # this, but we check at the application layer for any bypass.
    both_nonzero = JournalEntryLine.objects.filter(
        journal_entry__status=JournalEntryStatus.POSTED,
        journal_entry__entry_date__gte=start,
        journal_entry__entry_date__lte=end,
        debit_amount__gt=MONEY_ZERO,
        credit_amount__gt=MONEY_ZERO,
    ).count()
    checks.append({
        "key": "line.both_sides_nonzero",
        "label": "Lines with Both Debit and Credit Non-Zero",
        "status": STATUS_CRITICAL if both_nonzero > 0 else STATUS_OK,
        "count": both_nonzero,
        "message": (
            f"{both_nonzero} journal line(s) have both debit and credit non-zero — violates double-entry constraint."
            if both_nonzero > 0
            else "No lines with both sides non-zero."
        ),
        "metadata": {},
    })

    # ── 6. Lines with neither debit nor credit non-zero ───────────────────────
    neither_nonzero = JournalEntryLine.objects.filter(
        journal_entry__status=JournalEntryStatus.POSTED,
        journal_entry__entry_date__gte=start,
        journal_entry__entry_date__lte=end,
        debit_amount=MONEY_ZERO,
        credit_amount=MONEY_ZERO,
    ).count()
    checks.append({
        "key": "line.neither_side_nonzero",
        "label": "Lines with Neither Debit nor Credit Non-Zero",
        "status": STATUS_CRITICAL if neither_nonzero > 0 else STATUS_OK,
        "count": neither_nonzero,
        "message": (
            f"{neither_nonzero} journal line(s) have zero debit and zero credit — zero-value lines add no accounting effect."
            if neither_nonzero > 0
            else "No zero-value lines."
        ),
        "metadata": {},
    })

    # ── 7. Lines linked to inactive accounts ──────────────────────────────────
    inactive_acct_lines = JournalEntryLine.objects.filter(
        journal_entry__status=JournalEntryStatus.POSTED,
        journal_entry__entry_date__gte=start,
        journal_entry__entry_date__lte=end,
        chart_account__is_active=False,
    ).count()
    checks.append({
        "key": "line.inactive_account",
        "label": "Lines Linked to Inactive Accounts",
        "status": STATUS_WARNING if inactive_acct_lines > 0 else STATUS_OK,
        "count": inactive_acct_lines,
        "message": (
            f"{inactive_acct_lines} journal line(s) are linked to inactive (disabled) accounts."
            if inactive_acct_lines > 0
            else "All lines reference active accounts."
        ),
        "metadata": {},
    })

    # ── 8. Period lock/close status ───────────────────────────────────────────
    period_qs = AccountingPeriod.objects.filter(
        start_date__lte=end,
        end_date__gte=start,
    ).order_by("start_date")
    period_obj = period_qs.first()

    if period_obj is None:
        period_status_check = {
            "key": "period.no_period_defined",
            "label": "No Accounting Period Defined",
            "status": STATUS_INFO,
            "count": 0,
            "message": "No accounting period is defined covering this date range.",
            "metadata": {},
        }
    elif period_obj.status == AccountingPeriodStatus.CLOSED:
        period_status_check = {
            "key": "period.closed",
            "label": "Accounting Period Closed",
            "status": STATUS_WARNING,
            "count": 0,
            "message": f"Accounting period '{period_obj.code}' is CLOSED. Posting is not allowed.",
            "metadata": {"period_code": period_obj.code, "period_status": period_obj.status},
        }
    elif period_obj.status == AccountingPeriodStatus.LOCKED:
        period_status_check = {
            "key": "period.locked",
            "label": "Accounting Period Locked",
            "status": STATUS_INFO,
            "count": 0,
            "message": f"Accounting period '{period_obj.code}' is LOCKED. Trial balance is final for this period.",
            "metadata": {"period_code": period_obj.code, "period_status": period_obj.status},
        }
    else:
        period_status_check = {
            "key": "period.open",
            "label": "Accounting Period Open",
            "status": STATUS_OK,
            "count": 0,
            "message": f"Accounting period '{period_obj.code}' is OPEN. Postings may still occur.",
            "metadata": {"period_code": period_obj.code, "period_status": period_obj.status},
        }
    checks.append(period_status_check)

    # ── 9. Opening balance automation (deferred) ───────────────────────────────
    checks.append({
        "key": "opening_balance.deferred",
        "label": "Opening Balance Automation",
        "status": STATUS_INFO,
        "count": 0,
        "message": "Opening balance automation is not yet available (P4B-OB-001). Opening columns show 0.",
        "metadata": {"deferred": True},
    })

    return checks


def build_trial_balance_action_items(
    as_of: date | None = None,
    period: dict | None = None,
) -> list[dict]:
    """
    Return prioritised action items derived from the trial balance check.

    Severity order: CRITICAL → WARNING → INFO.
    """
    _as_of, year, month, start, end = _resolve_period(as_of, period)
    checks = validate_trial_balance(as_of=_as_of, period={"year": year, "month": month})
    items: list[dict] = []

    _check_map = {c["key"]: c for c in checks}

    # Imbalance
    bal = _check_map.get("balance.debit_equals_credit", {})
    if bal.get("status") == STATUS_CRITICAL:
        meta = bal.get("metadata", {})
        items.append({
            "key": "trial_balance.imbalance",
            "severity": SEVERITY_CRITICAL,
            "title": "Trial Balance Imbalance",
            "description": (
                f"Debit/credit totals do not match: "
                f"debit={meta.get('total_debit')}, credit={meta.get('total_credit')}, "
                f"difference={meta.get('difference')}. Investigate posted journals before month-end close."
            ),
            "source_area": "trial_balance",
            "count": 1,
            "deferred": False,
        })

    # Posted journals with no lines
    no_lines = _check_map.get("journal.posted_no_lines", {})
    if no_lines.get("count", 0) > 0:
        items.append({
            "key": "trial_balance.posted_no_lines",
            "severity": SEVERITY_CRITICAL,
            "title": "Posted Journals With No Lines",
            "description": (
                f"{no_lines['count']} posted journal(s) have no lines. "
                "These journals contribute nothing to the trial balance and indicate a data integrity gap."
            ),
            "source_area": "trial_balance",
            "count": no_lines["count"],
            "deferred": False,
        })

    # Both-sides non-zero
    both = _check_map.get("line.both_sides_nonzero", {})
    if both.get("count", 0) > 0:
        items.append({
            "key": "trial_balance.both_sides_nonzero",
            "severity": SEVERITY_CRITICAL,
            "title": "Journal Lines With Both Sides Non-Zero",
            "description": (
                f"{both['count']} line(s) have both debit and credit non-zero, violating double-entry constraints."
            ),
            "source_area": "trial_balance",
            "count": both["count"],
            "deferred": False,
        })

    # Zero-value lines
    zero = _check_map.get("line.neither_side_nonzero", {})
    if zero.get("count", 0) > 0:
        items.append({
            "key": "trial_balance.zero_value_lines",
            "severity": SEVERITY_CRITICAL,
            "title": "Zero-Value Journal Lines",
            "description": f"{zero['count']} line(s) have zero debit and zero credit.",
            "source_area": "trial_balance",
            "count": zero["count"],
            "deferred": False,
        })

    # Draft journals
    draft = _check_map.get("journal.draft_in_period", {})
    if draft.get("count", 0) > 0:
        items.append({
            "key": "trial_balance.draft_journals",
            "severity": SEVERITY_WARNING,
            "title": "Unposted Draft Journals in Period",
            "description": (
                f"{draft['count']} draft journal(s) in this period are excluded from the trial balance. "
                "Post or void them before month-end close."
            ),
            "source_area": "trial_balance",
            "count": draft["count"],
            "deferred": False,
        })

    # Inactive account lines
    inactive = _check_map.get("line.inactive_account", {})
    if inactive.get("count", 0) > 0:
        items.append({
            "key": "trial_balance.inactive_account_lines",
            "severity": SEVERITY_WARNING,
            "title": "Lines Linked to Inactive Accounts",
            "description": (
                f"{inactive['count']} journal line(s) reference inactive accounts. "
                "Review the chart of accounts and journal mapping."
            ),
            "source_area": "trial_balance",
            "count": inactive["count"],
            "deferred": False,
        })

    # Opening balance deferred
    items.append({
        "key": "trial_balance.opening_balance_deferred",
        "severity": SEVERITY_INFO,
        "title": "Opening Balance Automation Not Available",
        "description": "Opening balance columns show 0. Full opening balance computation is deferred to P4B-OB-001.",
        "source_area": "trial_balance",
        "count": 0,
        "deferred": True,
    })

    _rank = {SEVERITY_CRITICAL: 0, SEVERITY_WARNING: 1, SEVERITY_INFO: 2}
    items.sort(key=lambda a: _rank.get(a["severity"], 9))
    return items


def build_trial_balance_check(
    as_of: date | None = None,
    period: dict | None = None,
) -> dict:
    """
    Return the full trial balance automation check payload.

    This is the main P4B entry point.  No financial records are mutated.
    VOID and DRAFT entries are excluded from totals.  Opening balances are
    deferred and returned as 0 with an INFO marker.
    """
    from django.db.models import Sum
    from accounting.models import JournalEntryLine, JournalEntryStatus

    _as_of, year, month, start, end = _resolve_period(as_of, period)

    rows = build_trial_balance_rows(as_of=_as_of, period={"year": year, "month": month})
    checks = validate_trial_balance(as_of=_as_of, period={"year": year, "month": month})
    action_items = build_trial_balance_action_items(as_of=_as_of, period={"year": year, "month": month})

    # Re-compute totals from rows (already restricted to POSTED lines).
    agg = (
        JournalEntryLine.objects.filter(
            journal_entry__status=JournalEntryStatus.POSTED,
            journal_entry__entry_date__gte=start,
            journal_entry__entry_date__lte=end,
        ).aggregate(
            total_debit=Sum("debit_amount"),
            total_credit=Sum("credit_amount"),
        )
    )
    total_debit = _money(agg["total_debit"])
    total_credit = _money(agg["total_credit"])
    difference = total_debit - total_credit
    is_balanced = difference == MONEY_ZERO

    # Overall status = worst of all check statuses.
    check_statuses = [c["status"] for c in checks]
    overall_status = STATUS_OK
    for s in check_statuses:
        overall_status = _worst(overall_status, s)

    critical_count = sum(1 for c in checks if c["status"] == STATUS_CRITICAL)

    return {
        "as_of": _as_of.isoformat(),
        "period": {"year": year, "month": month},
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "total_debit": _money_str(total_debit),
        "total_credit": _money_str(total_credit),
        "difference": _money_str(difference),
        "is_balanced": is_balanced,
        "status": overall_status,
        "critical_check_count": critical_count,
        "rows": rows,
        "checks": checks,
        "action_items": action_items,
    }
