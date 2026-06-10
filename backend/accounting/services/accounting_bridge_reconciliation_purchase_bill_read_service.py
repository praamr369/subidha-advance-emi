from __future__ import annotations

from typing import Any

from accounting.services.accounting_bridge_reconciliation_read_service import BridgeReconciliationFilters, build_accounting_bridge_reconciliation as build_base_reconciliation
from accounting.services.accounting_bridge_purchase_bill_service import BridgeCandidateFilters, list_bridge_candidates, summarize_candidate_statuses


def _candidate_filters(filters: BridgeReconciliationFilters) -> BridgeCandidateFilters:
    return BridgeCandidateFilters(date_from=filters.date_from, date_to=filters.date_to, financial_year=filters.financial_year, accounting_period=filters.accounting_period, status=filters.status, source_model="PurchaseBill", event_key=filters.event_key, module=filters.module)


def _row_matches_vendor(row: dict[str, Any], vendor: str | None) -> bool:
    text = (vendor or "").strip().lower()
    if not text:
        return True
    haystack = " ".join(str(item or "") for item in [row.get("vendor_name"), row.get("vendor_id"), row.get("source_reference"), row.get("source_reference_number")]).lower()
    return text in haystack


def build_accounting_bridge_reconciliation(filters: BridgeReconciliationFilters | None = None) -> dict[str, Any]:
    active_filters = filters or BridgeReconciliationFilters()
    payload = build_base_reconciliation(active_filters)
    if active_filters.source_model and active_filters.source_model != "PurchaseBill":
        return payload
    purchase_rows = list_bridge_candidates(_candidate_filters(active_filters))
    if active_filters.vendor:
        purchase_rows = [row for row in purchase_rows if _row_matches_vendor(row, active_filters.vendor)]
    if active_filters.status:
        purchase_rows = [row for row in purchase_rows if row.get("status") == active_filters.status or row.get("reconciliation_state") == active_filters.status]
    existing_results = payload.get("results", [])
    if active_filters.source_model == "PurchaseBill":
        results = purchase_rows
    else:
        # Avoid duplicating rows if the base service later gains first-class PurchaseBill support.
        existing_purchase_ids = {(row.get("source_model"), str(row.get("source_id") or row.get("source_pk") or ""), row.get("event_key")) for row in existing_results}
        results = [*existing_results, *[row for row in purchase_rows if (row.get("source_model"), str(row.get("source_id") or row.get("source_pk") or ""), row.get("event_key")) not in existing_purchase_ids]]
    summary = {**(payload.get("summary") or {}), **summarize_candidate_statuses(results)}
    return {**payload, "summary": summary, "results": results}
