from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from accounting.models import AccountingPeriod, AccountingPeriodStatus, DocumentSequence, FinancialYear, JournalEntry, JournalEntryLine, MoneyMovement
from accounting.services.accounting_bridge_reconciliation_read_service import BridgeReconciliationFilters, build_accounting_bridge_reconciliation
from billing.models import BillingInvoice, ReceiptDocument
from reconciliation.models import ReconciliationItem
from settlements.models import SettlementAllocation
from subscriptions.models import AuditLog
from subscriptions.services.audit_service import log_audit

RECONCILIATION_EXCEPTION_STATUSES = {
    "MISSING_LEDGER",
    "MISSING_SOURCE",
    "AMOUNT_MISMATCH",
    "QUANTITY_MISMATCH",
    "STATUS_MISMATCH",
    "DUPLICATE_POSTING",
    "WRONG_ACCOUNT",
    "NEEDS_REVIEW",
}
REQUIRED_NUMBERING_TYPES = {"JOURNAL_ENTRY"}
SUPPORTED_NUMBERING_TYPES = {"DIRECT_SALE", "TAX_INVOICE", "DIRECT_SALE_RECEIPT", "EMI_RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE"}


@dataclass(frozen=True)
class YearEndCloseCommand:
    financial_year: str | int | None
    confirmation_text: str
    acknowledge_warnings: bool = False


def _money(value: Any) -> str:
    return f"{Decimal(str(value or '0.00')).quantize(Decimal('0.01')):.2f}"


def _financial_year(identifier: str | int | None):
    cleaned = str(identifier or "").strip()
    if cleaned:
        query = Q(code__iexact=cleaned)
        if cleaned.isdigit():
            query |= Q(pk=int(cleaned))
        return FinancialYear.objects.filter(query).order_by("-start_date", "-id").first()
    return FinancialYear.objects.filter(is_active=True).order_by("-start_date", "-id").first()


def _close_log_exists(financial_year: FinancialYear) -> bool:
    return AuditLog.objects.filter(
        model_name="FinancialYear",
        object_id=financial_year.pk,
        metadata__event="ACCOUNTING_FINANCIAL_YEAR_CLOSED",
    ).exists()


def _month_count(financial_year: FinancialYear) -> int:
    current = financial_year.start_date
    count = 0
    while current <= financial_year.end_date:
        count += 1
        current = current.replace(year=current.year + 1, month=1, day=1) if current.month == 12 else current.replace(month=current.month + 1, day=1)
    return count


def _gap_overlap_count(financial_year: FinancialYear, periods: list[AccountingPeriod]) -> int:
    if not periods:
        return 1
    count = 0
    expected_start = financial_year.start_date
    for period in sorted(periods, key=lambda item: (item.start_date, item.end_date, item.id)):
        if period.start_date != expected_start:
            count += 1
        if period.end_date >= expected_start:
            expected_start = period.end_date + timedelta(days=1)
    if expected_start <= financial_year.end_date:
        count += 1
    return count


def _has_numbering(financial_year: FinancialYear, document_type: str) -> bool:
    return DocumentSequence.objects.filter(
        Q(financial_year_ref=financial_year) | Q(financial_year=financial_year.code),
        document_type=document_type,
        is_active=True,
    ).exists()


def _period_row(period: AccountingPeriod) -> dict[str, Any]:
    journal_qs = JournalEntry.objects.filter(accounting_period=period, status="POSTED")
    line_totals = JournalEntryLine.objects.filter(journal_entry__in=journal_qs).aggregate(debit=Sum("debit_amount"), credit=Sum("credit_amount"))
    invoice_qs = BillingInvoice.objects.filter(invoice_date__gte=period.start_date, invoice_date__lte=period.end_date)
    receipt_qs = ReceiptDocument.objects.filter(receipt_date__gte=period.start_date, receipt_date__lte=period.end_date)
    return {
        "id": period.id,
        "code": period.code,
        "name": period.name or period.label,
        "start_date": period.start_date.isoformat(),
        "end_date": period.end_date.isoformat(),
        "status": period.status,
        "journal_count": journal_qs.count(),
        "journal_debit_total": _money(line_totals["debit"]),
        "journal_credit_total": _money(line_totals["credit"]),
        "invoice_count": invoice_qs.count(),
        "invoice_total": _money(invoice_qs.aggregate(total=Sum("grand_total"))["total"]),
        "receipt_count": receipt_qs.count(),
        "receipt_total": _money(receipt_qs.aggregate(total=Sum("amount"))["total"]),
    }


def _unreconciled_money_movement_count(financial_year: FinancialYear) -> int:
    movement_ids = list(MoneyMovement.objects.filter(status="POSTED", movement_date__gte=financial_year.start_date, movement_date__lte=financial_year.end_date).values_list("id", flat=True))
    if not movement_ids:
        return 0
    linked_ids = set(SettlementAllocation.objects.filter(money_movement_id__in=movement_ids).values_list("money_movement_id", flat=True).distinct())
    return len([movement_id for movement_id in movement_ids if movement_id not in linked_ids])


def _bridge_counts(financial_year: FinancialYear) -> tuple[int, int]:
    payload = build_accounting_bridge_reconciliation(BridgeReconciliationFilters(financial_year=str(financial_year.id)))
    summary = payload.get("summary") or {}
    return int(summary.get("unposted_bridge_item_count") or 0), int(summary.get("blocked_bridge_item_count") or 0)


def build_year_end_close_readiness(financial_year: str | int | None = None) -> dict[str, Any]:
    fy = _financial_year(financial_year)
    if fy is None:
        return {
            "financial_year": None,
            "periods": [],
            "period_summary": {},
            "open_period_count": 0,
            "locked_period_count": 0,
            "closed_period_count": 0,
            "missing_period_count": 1,
            "gap_or_overlap_count": 0,
            "unposted_bridge_item_count": 0,
            "blocked_bridge_item_count": 0,
            "unreconciled_item_count": 0,
            "exception_count": 0,
            "missing_numbering_profile_count": 0,
            "blocking_items": [{"code": "NO_FINANCIAL_YEAR", "message": "No financial year is configured or selected."}],
            "warning_items": [],
            "ready_to_close": False,
            "requires_acknowledgement": False,
            "allowed_actions": ["CONFIGURE_FINANCIAL_YEAR"],
            "confirmation_text_required": None,
            "historical_document_numbers_preserved": True,
        }

    periods = list(AccountingPeriod.objects.filter(financial_year=fy).order_by("start_date", "id"))
    open_count = sum(1 for period in periods if period.status == AccountingPeriodStatus.OPEN)
    locked_count = sum(1 for period in periods if period.status == AccountingPeriodStatus.LOCKED)
    closed_count = sum(1 for period in periods if period.status == AccountingPeriodStatus.CLOSED)
    missing_period_count = max(0, _month_count(fy) - len(periods))
    gap_count = _gap_overlap_count(fy, periods)
    blocking_items: list[dict[str, Any]] = []
    warning_items: list[dict[str, Any]] = []
    if missing_period_count:
        blocking_items.append({"code": "MISSING_PERIODS", "message": f"{missing_period_count} accounting period(s) are missing for {fy.code}."})
    if gap_count:
        blocking_items.append({"code": "PERIOD_GAPS_OR_OVERLAPS", "message": "Accounting period dates have gaps or overlaps."})
    if open_count:
        blocking_items.append({"code": "OPEN_PERIODS", "message": f"{open_count} accounting period(s) remain OPEN."})

    try:
        unposted_bridge_count, blocked_bridge_count = _bridge_counts(fy)
    except Exception:
        unposted_bridge_count, blocked_bridge_count = 0, 1
        warning_items.append({"code": "BRIDGE_READINESS_UNAVAILABLE", "message": "Bridge readiness could not be fully evaluated."})
    if unposted_bridge_count:
        blocking_items.append({"code": "UNPOSTED_BRIDGE_ITEMS", "message": f"{unposted_bridge_count} unposted bridge item(s) remain for {fy.code}."})
    if blocked_bridge_count:
        warning_items.append({"code": "BLOCKED_BRIDGE_ITEMS", "message": f"{blocked_bridge_count} blocked bridge item(s) require acknowledgement."})

    unreconciled_count = _unreconciled_money_movement_count(fy)
    exception_count = ReconciliationItem.objects.filter(status__in=RECONCILIATION_EXCEPTION_STATUSES, created_at__date__gte=fy.start_date, created_at__date__lte=fy.end_date).count()
    if unreconciled_count:
        warning_items.append({"code": "UNRECONCILED_MONEY_MOVEMENTS", "message": f"{unreconciled_count} unreconciled money movement(s) exist."})
    if exception_count:
        warning_items.append({"code": "RECONCILIATION_EXCEPTIONS", "message": f"{exception_count} unresolved reconciliation exception(s) exist."})

    missing_required = [item for item in REQUIRED_NUMBERING_TYPES if not _has_numbering(fy, item)]
    missing_supported = [item for item in SUPPORTED_NUMBERING_TYPES if not _has_numbering(fy, item)]
    for item in missing_required:
        blocking_items.append({"code": "MISSING_NUMBERING_PROFILE", "message": f"Missing required {item} numbering profile for {fy.code}."})
    for item in missing_supported:
        warning_items.append({"code": "MISSING_SUPPORTED_NUMBERING_PROFILE", "message": f"Missing supported {item} numbering profile for {fy.code}."})

    status = "CLOSED" if _close_log_exists(fy) or (periods and closed_count == len(periods) and not fy.is_active) else ("ACTIVE" if fy.is_active else "INACTIVE")
    ready = bool(periods) and not blocking_items
    requires_ack = ready and bool(warning_items)
    return {
        "financial_year": {"id": fy.id, "code": fy.code, "name": fy.name, "start_date": fy.start_date.isoformat(), "end_date": fy.end_date.isoformat(), "status": status, "is_active": fy.is_active, "closed": status == "CLOSED"},
        "periods": [_period_row(period) for period in periods],
        "period_summary": {"total_periods": len(periods), "expected_periods": _month_count(fy)},
        "open_period_count": open_count,
        "locked_period_count": locked_count,
        "closed_period_count": closed_count,
        "missing_period_count": missing_period_count,
        "gap_or_overlap_count": gap_count,
        "unposted_bridge_item_count": unposted_bridge_count,
        "blocked_bridge_item_count": blocked_bridge_count,
        "unreconciled_item_count": unreconciled_count,
        "exception_count": exception_count,
        "missing_numbering_profile_count": len(missing_required) + len(missing_supported),
        "blocking_items": blocking_items,
        "warning_items": warning_items,
        "ready_to_close": ready,
        "requires_acknowledgement": requires_ack,
        "allowed_actions": ["CLOSE_YEAR_WITH_ACKNOWLEDGEMENT" if requires_ack else "CLOSE_YEAR"] if ready else ["RESOLVE_BLOCKERS"],
        "confirmation_text_required": f"CLOSE {fy.code}",
        "historical_document_numbers_preserved": True,
    }


@transaction.atomic
def execute_year_end_close(command: YearEndCloseCommand, *, performed_by) -> dict[str, Any]:
    fy = _financial_year(command.financial_year)
    if fy is None:
        raise ValueError("No financial year is configured or selected.")
    expected = f"CLOSE {fy.code}"
    if (command.confirmation_text or "").strip() != expected:
        raise ValueError(f"Confirmation text must exactly match: {expected}")
    FinancialYear.objects.select_for_update().filter(pk=fy.pk).exists()
    AccountingPeriod.objects.select_for_update().filter(financial_year=fy).exists()
    readiness = build_year_end_close_readiness(fy.id)
    if readiness.get("financial_year", {}).get("closed"):
        return {"updated": False, "already_closed": True, "readiness": readiness}
    if readiness["blocking_items"]:
        raise ValueError("Year-end close is blocked. Resolve blocking items before closing the financial year.")
    if readiness["warning_items"] and not command.acknowledge_warnings:
        raise ValueError("Year-end close has warnings. Re-run with acknowledgement after admin review.")
    now = timezone.now()
    updated_periods = AccountingPeriod.objects.filter(financial_year=fy).exclude(status=AccountingPeriodStatus.CLOSED).update(status=AccountingPeriodStatus.CLOSED, is_locked=True, locked_at=now, locked_by=performed_by, lock_reason=f"Year-end close for {fy.code}")
    fy_updated = False
    if fy.is_active:
        fy.is_active = False
        fy.save(update_fields=["is_active", "updated_at"])
        fy_updated = True
    if updated_periods or fy_updated:
        log_audit(
            action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
            instance=fy,
            performed_by=performed_by,
            metadata={"event": "ACCOUNTING_FINANCIAL_YEAR_CLOSED", "financial_year_id": fy.id, "financial_year_code": fy.code, "closed_at": now.isoformat(), "closed_period_count": updated_periods, "warnings_acknowledged": bool(command.acknowledge_warnings), "historical_document_numbers_preserved": True, "auto_posted_bridge_items": False, "allocated_document_numbers": False},
        )
    return {"updated": bool(updated_periods or fy_updated), "already_closed": False, "closed_period_count": updated_periods, "readiness": build_year_end_close_readiness(fy.id)}
