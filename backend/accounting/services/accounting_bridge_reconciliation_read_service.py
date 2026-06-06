from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db.models import Q
from django.utils import timezone

from accounting.models import (
    AccountingBridgePosting,
    AccountingPeriod,
    AccountingPeriodStatus,
    FinancialYear,
    JournalEntry,
    MoneyMovement,
)
from accounting.services.returns_damage_credit_bridge_readiness_service import (
    build_accounting_bridge_readiness_with_returns_damage_credit,
)
from billing.models import BillingInvoice, ReceiptDocument
from reconciliation.models import ReconciliationItem
from settlements.models import SettlementAllocation

POSTING_APPROVAL_BLOCKED_PURPOSES = {
    "COMMISSION_SETTLEMENT",
    "COMMISSION_PAYOUT_BATCH",
    "INVENTORY_POSTING",
}

EXCEPTION_STATUSES = {
    "MISSING_LEDGER",
    "MISSING_SOURCE",
    "AMOUNT_MISMATCH",
    "QUANTITY_MISMATCH",
    "STATUS_MISMATCH",
    "DUPLICATE_POSTING",
    "WRONG_ACCOUNT",
    "NEEDS_REVIEW",
}


@dataclass(frozen=True)
class BridgeReconciliationFilters:
    module: str | None = None
    event_key: str | None = None
    date_from: Any = None
    date_to: Any = None
    status: str | None = None
    customer: str | None = None
    vendor: str | None = None
    partner: str | None = None
    financial_year: str | None = None
    accounting_period: str | None = None
    source_type: str | None = None
    source_model: str | None = None
    account: str | None = None


def _normalize(value: Any) -> str:
    return str(value or "").strip()


def _norm_key(value: Any) -> str:
    return _normalize(value).lower().replace(" ", "_").replace("-", "_")


def _int_or_none(value: Any) -> int | None:
    text = _normalize(value)
    if not text.isdigit():
        return None
    return int(text)


def _posting_event_key(posting: AccountingBridgePosting) -> str:
    purpose = _normalize(getattr(posting, "purpose", ""))
    if not purpose:
        return _norm_key(getattr(posting, "source_type", "")) or "posted_bridge"
    return _norm_key(purpose)


def _posting_module(posting: AccountingBridgePosting) -> str:
    source_model = _normalize(getattr(posting, "source_model", ""))
    if source_model in {"Payment", "Subscription", "Commission", "CommissionPayoutBatch"}:
        return "subscriptions"
    if source_model in {"ReceiptDocument", "BillingInvoice", "BillingCreditNote", "BillingDebitNote", "DirectSale"}:
        return "billing"
    if source_model in {"PurchaseBill", "StockLedger", "GoodsReceipt"}:
        return "inventory"
    if source_model in {"ProductionJob", "ManufacturingBom"}:
        return "manufacturing"
    if source_model in {"SalarySheet", "SalaryPayment", "EmployeeExpenseClaim", "EmployeeExpenseClaimPayment", "VendorSettlement", "MoneyMovement"}:
        return "accounting"
    return _normalize(getattr(posting, "source_type", "")) or "accounting"


def _financial_year_payload(financial_year: FinancialYear | None) -> dict[str, Any] | None:
    if financial_year is None:
        return None
    return {
        "id": financial_year.id,
        "code": financial_year.code,
        "name": financial_year.name,
        "start_date": financial_year.start_date.isoformat(),
        "end_date": financial_year.end_date.isoformat(),
        "is_active": financial_year.is_active,
    }


def _period_payload(period: AccountingPeriod | None) -> dict[str, Any] | None:
    if period is None:
        return None
    return {
        "id": period.id,
        "code": period.code,
        "name": period.name or period.label,
        "start_date": period.start_date.isoformat(),
        "end_date": period.end_date.isoformat(),
        "status": period.status,
        "is_locked": period.is_locked,
        "financial_year": period.financial_year_id,
        "financial_year_code": getattr(period.financial_year, "code", None),
    }


def _resolve_financial_year(filters: BridgeReconciliationFilters) -> tuple[FinancialYear | None, list[str]]:
    blockers: list[str] = []
    requested = _normalize(filters.financial_year)
    queryset = FinancialYear.objects.all().order_by("-start_date", "-id")
    if requested:
        numeric_id = _int_or_none(requested)
        lookup = Q(code__iexact=requested)
        if numeric_id is not None:
            lookup |= Q(pk=numeric_id)
        financial_year = queryset.filter(lookup).first()
        if financial_year is None:
            blockers.append("Selected financial year is missing.")
        return financial_year, blockers
    financial_year = queryset.filter(is_active=True).first()
    if financial_year is None:
        blockers.append("No active financial year is configured.")
    return financial_year, blockers


def _resolve_period(filters: BridgeReconciliationFilters, financial_year: FinancialYear | None) -> tuple[AccountingPeriod | None, list[str]]:
    blockers: list[str] = []
    queryset = AccountingPeriod.objects.select_related("financial_year").all().order_by("start_date", "id")
    if financial_year is not None:
        queryset = queryset.filter(financial_year=financial_year)
    if not queryset.exists():
        blockers.append("No accounting periods are configured for the selected financial year." if financial_year else "No accounting periods are configured.")
        return None, blockers

    requested = _normalize(filters.accounting_period)
    if requested:
        numeric_id = _int_or_none(requested)
        lookup = Q(code__iexact=requested)
        if numeric_id is not None:
            lookup |= Q(pk=numeric_id)
        period = queryset.filter(lookup).first()
        if period is None:
            blockers.append("Selected accounting period is missing.")
        return period, blockers

    today = timezone.localdate()
    period = queryset.filter(start_date__lte=today, end_date__gte=today).first()
    if period is None:
        period = queryset.filter(status=AccountingPeriodStatus.OPEN).first() or queryset.first()
    return period, blockers


def _range_from_selection(
    *,
    filters: BridgeReconciliationFilters,
    financial_year: FinancialYear | None,
    period: AccountingPeriod | None,
) -> tuple[Any, Any]:
    start = filters.date_from
    end = filters.date_to
    if period is not None:
        start = start or period.start_date
        end = end or period.end_date
    elif financial_year is not None:
        start = start or financial_year.start_date
        end = end or financial_year.end_date
    return start, end


def _available_periods(financial_year: FinancialYear | None) -> list[dict[str, Any]]:
    queryset = AccountingPeriod.objects.select_related("financial_year").order_by("start_date", "id")
    if financial_year is not None:
        queryset = queryset.filter(financial_year=financial_year)
    return [_period_payload(period) or {} for period in queryset]


def _has_settlement_link(source_model: str, source_id: str, source_reference: str) -> bool:
    query = Q(source_id=source_id)
    if source_model == "Payment" and source_id:
        query |= Q(payment_id=source_id)
    if source_model == "ReceiptDocument" and source_id:
        query |= Q(receipt_id=source_id)
    if source_model == "MoneyMovement" and source_id:
        query |= Q(money_movement_id=source_id)
    if source_reference:
        query |= Q(source_id=source_reference)
    return SettlementAllocation.objects.filter(query).exists()


def _reconciliation_items(source_model: str, source_id: str, source_reference: str):
    query = Q(source_type=source_model, source_id=source_id)
    if source_reference:
        query |= Q(source_label__icontains=source_reference) | Q(metadata__icontains=source_reference)
    return ReconciliationItem.objects.filter(query).order_by("-created_at", "-id")[:5]


def _status_from_readiness(event: dict[str, Any]) -> str:
    status = _normalize(event.get("status")).upper()
    if status == "READY":
        return "READY_UNPOSTED"
    if status in {"WARNING", "ERROR", "NOT_CONFIGURED"}:
        return "BLOCKED_BY_MAPPING"
    return status or "INFO"


def _row_passes_filters(row: dict[str, Any], filters: BridgeReconciliationFilters) -> bool:
    if filters.module and row.get("module") != filters.module:
        return False
    if filters.event_key and row.get("event_key") != filters.event_key:
        return False
    if filters.status and row.get("status") != filters.status:
        return False
    if filters.source_model and row.get("source_model") != filters.source_model:
        return False
    if filters.source_type and row.get("source_type") != filters.source_type:
        return False
    return True


def _readiness_rows(
    readiness_payload: dict[str, Any],
    filters: BridgeReconciliationFilters,
    *,
    financial_year: FinancialYear | None,
    period: AccountingPeriod | None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for event in readiness_payload.get("events") or []:
        status = _status_from_readiness(event)
        if event.get("event_key") in {"commission_payout", "commission_approval", "payout_batch_payment", "purchase_inventory_receive"} and status == "READY_UNPOSTED":
            status = "BLOCKED_BY_POSTING_APPROVAL"
        row = {
            "row_type": "readiness_event",
            "event_key": event.get("event_key"),
            "label": event.get("label"),
            "module": event.get("source_module"),
            "event_group": event.get("event_group"),
            "source_model": event.get("source_model"),
            "source_type": event.get("source_model"),
            "source_id": None,
            "source_reference": None,
            "status": status,
            "mapping_status": event.get("status"),
            "posting_mode": event.get("posting_mode"),
            "can_post": False,
            "financial_year": _financial_year_payload(financial_year),
            "accounting_period": _period_payload(period),
            "period_status": getattr(period, "status", None),
            "journal_entry": None,
            "settlement_linked": False,
            "reconciliation_linked": False,
            "reconciliation_items": [],
            "exception_reasons": event.get("blocking_reasons") or [],
            "operator_action": event.get("operator_action"),
        }
        if _row_passes_filters(row, filters):
            rows.append(row)
    return rows


def _apply_posted_filters(queryset, filters: BridgeReconciliationFilters, financial_year: FinancialYear | None, period: AccountingPeriod | None):
    start, end = _range_from_selection(filters=filters, financial_year=financial_year, period=period)
    if financial_year is not None:
        queryset = queryset.filter(Q(journal_entry__financial_year=financial_year) | Q(journal_entry__entry_date__gte=financial_year.start_date, journal_entry__entry_date__lte=financial_year.end_date))
    if period is not None:
        queryset = queryset.filter(Q(journal_entry__accounting_period=period) | Q(journal_entry__entry_date__gte=period.start_date, journal_entry__entry_date__lte=period.end_date))
    if start:
        queryset = queryset.filter(journal_entry__entry_date__gte=start)
    if end:
        queryset = queryset.filter(journal_entry__entry_date__lte=end)
    if filters.source_model:
        queryset = queryset.filter(source_model=filters.source_model)
    if filters.source_type:
        queryset = queryset.filter(source_type=filters.source_type)
    if filters.account:
        account = _normalize(filters.account)
        numeric_id = _int_or_none(account)
        account_filter = Q(journal_entry__lines__chart_account__code__icontains=account) | Q(journal_entry__lines__chart_account__name__icontains=account)
        if numeric_id is not None:
            account_filter |= Q(journal_entry__lines__chart_account_id=numeric_id)
        queryset = queryset.filter(account_filter)
    return queryset.distinct()


def _posted_rows(filters: BridgeReconciliationFilters, financial_year: FinancialYear | None, period: AccountingPeriod | None) -> list[dict[str, Any]]:
    queryset = AccountingBridgePosting.objects.select_related(
        "journal_entry",
        "journal_entry__financial_year",
        "journal_entry__accounting_period",
    )
    queryset = _apply_posted_filters(queryset, filters, financial_year, period).order_by("-created_at", "-id")[:500]
    rows: list[dict[str, Any]] = []
    for posting in queryset:
        journal: JournalEntry | None = getattr(posting, "journal_entry", None)
        source_model = _normalize(getattr(posting, "source_model", ""))
        source_id = _normalize(getattr(posting, "source_id", ""))
        source_reference = _normalize(getattr(posting, "source_reference", "")) or _normalize(getattr(journal, "source_reference", ""))
        rec_items = list(_reconciliation_items(source_model, source_id, source_reference))
        exception_items = [item for item in rec_items if item.status in EXCEPTION_STATUSES]
        event_key = _posting_event_key(posting)
        purpose = _normalize(getattr(posting, "purpose", ""))
        status = "POSTED"
        settlement_linked = _has_settlement_link(source_model, source_id, source_reference)
        if settlement_linked:
            status = "SETTLED"
        if rec_items:
            status = "RECONCILED"
        if exception_items:
            status = "EXCEPTION"
        journal_fy = getattr(journal, "financial_year", None)
        journal_period = getattr(journal, "accounting_period", None)
        row = {
            "row_type": "posted_source",
            "event_key": event_key,
            "label": purpose or event_key,
            "module": _posting_module(posting),
            "event_group": "Posted Bridge",
            "source_model": source_model,
            "source_type": _normalize(getattr(posting, "source_type", "")) or source_model,
            "source_id": source_id,
            "source_reference": source_reference,
            "status": status,
            "mapping_status": "READY",
            "posting_mode": "POSTED",
            "can_post": False,
            "financial_year": _financial_year_payload(journal_fy),
            "accounting_period": _period_payload(journal_period),
            "period_status": getattr(journal_period, "status", None),
            "journal_entry": {
                "id": getattr(journal, "id", None),
                "entry_no": getattr(journal, "entry_no", None),
                "entry_date": getattr(journal, "entry_date", None).isoformat() if getattr(journal, "entry_date", None) else None,
                "status": getattr(journal, "status", None),
                "financial_year": getattr(journal, "financial_year_id", None),
                "financial_year_code": getattr(journal_fy, "code", None),
                "accounting_period": getattr(journal, "accounting_period_id", None),
                "accounting_period_code": getattr(journal_period, "code", None),
                "accounting_period_name": getattr(journal_period, "name", None) or getattr(journal_period, "label", None),
                "accounting_period_status": getattr(journal_period, "status", None),
            } if journal else None,
            "settlement_linked": settlement_linked,
            "reconciliation_linked": bool(rec_items),
            "reconciliation_items": [
                {
                    "id": item.id,
                    "status": item.status,
                    "severity": item.severity,
                    "exception_code": item.exception_code,
                    "exception_message": item.exception_message,
                }
                for item in rec_items
            ],
            "exception_reasons": [item.exception_message or item.exception_code or item.status for item in exception_items],
            "operator_action": "Review posted journal, settlement, and reconciliation coverage. This cockpit is read-only.",
        }
        if _row_passes_filters(row, filters):
            rows.append(row)
    return rows


def _document_counts(filters: BridgeReconciliationFilters, financial_year: FinancialYear | None, period: AccountingPeriod | None) -> dict[str, int]:
    start, end = _range_from_selection(filters=filters, financial_year=financial_year, period=period)
    invoice_qs = BillingInvoice.objects.all()
    receipt_qs = ReceiptDocument.objects.all()
    journal_qs = JournalEntry.objects.all()
    movement_qs = MoneyMovement.objects.all()
    if financial_year is not None:
        invoice_qs = invoice_qs.filter(invoice_date__gte=financial_year.start_date, invoice_date__lte=financial_year.end_date)
        receipt_qs = receipt_qs.filter(receipt_date__gte=financial_year.start_date, receipt_date__lte=financial_year.end_date)
        journal_qs = journal_qs.filter(Q(financial_year=financial_year) | Q(entry_date__gte=financial_year.start_date, entry_date__lte=financial_year.end_date))
        movement_qs = movement_qs.filter(movement_date__gte=financial_year.start_date, movement_date__lte=financial_year.end_date)
    if period is not None:
        invoice_qs = invoice_qs.filter(invoice_date__gte=period.start_date, invoice_date__lte=period.end_date)
        receipt_qs = receipt_qs.filter(receipt_date__gte=period.start_date, receipt_date__lte=period.end_date)
        journal_qs = journal_qs.filter(Q(accounting_period=period) | Q(entry_date__gte=period.start_date, entry_date__lte=period.end_date))
        movement_qs = movement_qs.filter(movement_date__gte=period.start_date, movement_date__lte=period.end_date)
    if start:
        invoice_qs = invoice_qs.filter(invoice_date__gte=start)
        receipt_qs = receipt_qs.filter(receipt_date__gte=start)
        journal_qs = journal_qs.filter(entry_date__gte=start)
        movement_qs = movement_qs.filter(movement_date__gte=start)
    if end:
        invoice_qs = invoice_qs.filter(invoice_date__lte=end)
        receipt_qs = receipt_qs.filter(receipt_date__lte=end)
        journal_qs = journal_qs.filter(entry_date__lte=end)
        movement_qs = movement_qs.filter(movement_date__lte=end)
    movement_ids = list(movement_qs.filter(status="POSTED").values_list("id", flat=True)[:5000])
    linked_movement_ids = set(
        SettlementAllocation.objects.filter(money_movement_id__in=movement_ids)
        .exclude(money_movement_id__isnull=True)
        .values_list("money_movement_id", flat=True)
        .distinct()
    )
    return {
        "total_invoices": invoice_qs.count(),
        "total_receipts": receipt_qs.count(),
        "total_journal_postings": journal_qs.count(),
        "total_money_movements": movement_qs.count(),
        "unreconciled_money_movement_count": len([item for item in movement_ids if item not in linked_movement_ids]),
    }


def _readiness_blockers(
    *,
    financial_year: FinancialYear | None,
    period: AccountingPeriod | None,
    resolver_blockers: list[str],
    rows: list[dict[str, Any]],
    counts: dict[str, int],
) -> list[str]:
    blockers = list(dict.fromkeys(resolver_blockers))
    if financial_year is None and "No active financial year is configured." not in blockers:
        blockers.append("No active financial year is configured.")
    if period is None and not any("accounting period" in item.lower() for item in blockers):
        blockers.append("No accounting period is selected.")
    if period is not None and period.status == AccountingPeriodStatus.LOCKED:
        blockers.append("Selected accounting period is locked.")
    if period is not None and period.status == AccountingPeriodStatus.CLOSED:
        blockers.append("Selected accounting period is closed.")
    if any(str(row.get("status", "")).startswith("BLOCKED") for row in rows):
        blockers.append("Bridge postings are blocked by mapping or approval readiness.")
    if any(row.get("status") == "READY_UNPOSTED" for row in rows):
        blockers.append("Unposted bridge items exist for the selected context.")
    if counts.get("unreconciled_money_movement_count", 0) > 0:
        blockers.append("Unreconciled money movements exist for the selected context.")
    return list(dict.fromkeys(blockers))


def build_accounting_bridge_reconciliation(filters: BridgeReconciliationFilters | None = None) -> dict[str, Any]:
    active_filters = filters or BridgeReconciliationFilters()
    selected_financial_year, fy_blockers = _resolve_financial_year(active_filters)
    selected_period, period_blockers = _resolve_period(active_filters, selected_financial_year)
    resolver_blockers = [*fy_blockers, *period_blockers]

    readiness_payload = build_accounting_bridge_readiness_with_returns_damage_credit()
    rows = [
        *_readiness_rows(
            readiness_payload,
            active_filters,
            financial_year=selected_financial_year,
            period=selected_period,
        ),
        *_posted_rows(active_filters, selected_financial_year, selected_period),
    ]
    counts = _document_counts(active_filters, selected_financial_year, selected_period)

    ready_unposted_count = sum(1 for row in rows if row["status"] == "READY_UNPOSTED")
    blocked_count = sum(1 for row in rows if str(row["status"]).startswith("BLOCKED"))
    exception_count = sum(1 for row in rows if row["status"] == "EXCEPTION" or row["exception_reasons"])
    locked_period_count = AccountingPeriod.objects.filter(
        financial_year=selected_financial_year,
        status=AccountingPeriodStatus.LOCKED,
    ).count() if selected_financial_year else 0
    closed_period_count = AccountingPeriod.objects.filter(
        financial_year=selected_financial_year,
        status=AccountingPeriodStatus.CLOSED,
    ).count() if selected_financial_year else 0
    readiness_blockers = _readiness_blockers(
        financial_year=selected_financial_year,
        period=selected_period,
        resolver_blockers=resolver_blockers,
        rows=rows,
        counts=counts,
    )

    summary = {
        "source_count": len(rows),
        "ready_unposted_count": ready_unposted_count,
        "blocked_count": blocked_count,
        "posted_count": sum(1 for row in rows if row["journal_entry"]),
        "settled_count": sum(1 for row in rows if row["settlement_linked"]),
        "reconciled_count": sum(1 for row in rows if row["reconciliation_linked"]),
        "exception_count": exception_count,
        "total_invoices": counts["total_invoices"],
        "total_receipts": counts["total_receipts"],
        "total_journal_postings": counts["total_journal_postings"],
        "total_money_movements": counts["total_money_movements"],
        "unposted_bridge_item_count": ready_unposted_count,
        "unreconciled_money_movement_count": counts["unreconciled_money_movement_count"],
        "reconciliation_exception_count": exception_count,
        "blocked_bridge_item_count": blocked_count,
        "locked_period_count": locked_period_count,
        "closed_period_count": closed_period_count,
    }
    year_end_hint = "Year-end ready when all periods are closed, no unposted bridge items remain, and reconciliation exceptions are cleared."
    return {
        "summary": summary,
        "selected_financial_year": _financial_year_payload(selected_financial_year),
        "selected_accounting_period": _period_payload(selected_period),
        "period_status": getattr(selected_period, "status", None),
        "available_financial_years": [_financial_year_payload(row) for row in FinancialYear.objects.order_by("-start_date", "-id")],
        "available_accounting_periods": _available_periods(selected_financial_year),
        "readiness_blockers": readiness_blockers,
        "year_end_readiness_hint": year_end_hint,
        "financial_year_readiness": readiness_payload.get("financial_year_readiness"),
        "accounting_period_readiness": readiness_payload.get("accounting_period_readiness"),
        "results": rows,
    }
