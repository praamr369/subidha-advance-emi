from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db.models import Q

from accounting.models import AccountingBridgePosting, JournalEntry
from accounting.services.returns_damage_credit_bridge_readiness_service import (
    build_accounting_bridge_readiness_with_returns_damage_credit,
)
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


def _normalize(value: Any) -> str:
    return str(value or "").strip()


def _norm_key(value: Any) -> str:
    return _normalize(value).lower().replace(" ", "_").replace("-", "_")


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
    # Customer/vendor/partner filters are reserved for source drilldown when source payloads expose those ids.
    # Keep them non-mutating and non-blocking for rows that do not carry party metadata.
    return True


def _readiness_rows(readiness_payload: dict[str, Any], filters: BridgeReconciliationFilters) -> list[dict[str, Any]]:
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
            "source_id": None,
            "source_reference": None,
            "status": status,
            "mapping_status": event.get("status"),
            "posting_mode": event.get("posting_mode"),
            "can_post": False,
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


def _posted_rows(filters: BridgeReconciliationFilters) -> list[dict[str, Any]]:
    queryset = AccountingBridgePosting.objects.select_related("journal_entry").order_by("-created_at", "-id")[:500]
    rows: list[dict[str, Any]] = []
    for posting in queryset:
        journal: JournalEntry | None = getattr(posting, "journal_entry", None)
        source_model = _normalize(getattr(posting, "source_model", ""))
        source_id = _normalize(getattr(posting, "source_id", ""))
        source_reference = _normalize(getattr(posting, "source_reference", "")) or _normalize(getattr(journal, "source_reference", ""))
        if filters.date_from and journal and journal.entry_date and journal.entry_date < filters.date_from:
            continue
        if filters.date_to and journal and journal.entry_date and journal.entry_date > filters.date_to:
            continue
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
        row = {
            "row_type": "posted_source",
            "event_key": event_key,
            "label": purpose or event_key,
            "module": _posting_module(posting),
            "event_group": "Posted Bridge",
            "source_model": source_model,
            "source_id": source_id,
            "source_reference": source_reference,
            "status": status,
            "mapping_status": "READY",
            "posting_mode": "POSTED",
            "can_post": False,
            "journal_entry": {
                "id": getattr(journal, "id", None),
                "entry_no": getattr(journal, "entry_no", None),
                "entry_date": getattr(journal, "entry_date", None).isoformat() if getattr(journal, "entry_date", None) else None,
                "status": getattr(journal, "status", None),
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


def build_accounting_bridge_reconciliation(filters: BridgeReconciliationFilters | None = None) -> dict[str, Any]:
    active_filters = filters or BridgeReconciliationFilters()
    readiness_payload = build_accounting_bridge_readiness_with_returns_damage_credit()
    rows = [*_readiness_rows(readiness_payload, active_filters), *_posted_rows(active_filters)]

    summary = {
        "source_count": len(rows),
        "ready_unposted_count": sum(1 for row in rows if row["status"] == "READY_UNPOSTED"),
        "blocked_count": sum(1 for row in rows if str(row["status"]).startswith("BLOCKED")),
        "posted_count": sum(1 for row in rows if row["journal_entry"]),
        "settled_count": sum(1 for row in rows if row["settlement_linked"]),
        "reconciled_count": sum(1 for row in rows if row["reconciliation_linked"]),
        "exception_count": sum(1 for row in rows if row["status"] == "EXCEPTION" or row["exception_reasons"]),
    }
    return {"summary": summary, "results": rows}
