from __future__ import annotations

<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
from typing import Any

from accounting.services.accounting_bridge_reconciliation_read_service import BridgeReconciliationFilters, _phase_f_control_tower, build_accounting_bridge_reconciliation as build_base_reconciliation
from accounting.services.accounting_bridge_customer_advance_refund_service import BridgeCandidateFilters, list_bridge_candidates, summarize_candidate_statuses


EXTENDED_SOURCE_MODELS = {"PurchaseBill", "VendorPayment", "StockLedger", "SalarySheet", "SalaryPayment", "RentLeaseCollection", "RentLeaseDepositTransaction", "CustomerAdvance", "CustomerAdvanceAllocation", "CustomerAdvanceRefund"}


def _candidate_filters(filters: BridgeReconciliationFilters) -> BridgeCandidateFilters:
    source_model = filters.source_model if filters.source_model in EXTENDED_SOURCE_MODELS else None
    return BridgeCandidateFilters(date_from=filters.date_from, date_to=filters.date_to, financial_year=filters.financial_year, accounting_period=filters.accounting_period, status=filters.status, source_model=source_model, event_key=filters.event_key, module=filters.module)


def _row_matches_vendor(row: dict[str, Any], vendor: str | None) -> bool:
    text = (vendor or "").strip().lower()
    if not text:
        return True
    haystack = " ".join(str(item or "") for item in [row.get("vendor_name"), row.get("vendor_id"), row.get("source_reference"), row.get("source_reference_number")]).lower()
    return text in haystack


def _is_old_f1_advance_allocation_row(row: dict[str, Any], guarded_ids: set[tuple[str, str]]) -> bool:
    return (row.get("source_model"), str(row.get("source_id") or row.get("source_pk") or "")) in guarded_ids and row.get("event_key") == "subscription_emi_payment"


def build_accounting_bridge_reconciliation(filters: BridgeReconciliationFilters | None = None) -> dict[str, Any]:
    active_filters = filters or BridgeReconciliationFilters()
    payload = build_base_reconciliation(active_filters)
    if active_filters.source_model and active_filters.source_model not in EXTENDED_SOURCE_MODELS:
        return payload
    candidate_rows = list_bridge_candidates(_candidate_filters(active_filters))
    if active_filters.vendor:
        candidate_rows = [row for row in candidate_rows if _row_matches_vendor(row, active_filters.vendor)]
    if active_filters.status:
        candidate_rows = [row for row in candidate_rows if row.get("status") == active_filters.status or row.get("reconciliation_state") == active_filters.status]
    existing_results = payload.get("results", [])
    guarded_payment_ids = {
        (row.get("source_model"), str(row.get("source_id") or row.get("source_pk") or ""))
        for row in candidate_rows
        if row.get("source_model") == "Payment" and row.get("event_key") == "payment_skipped_not_applicable"
    }
    existing_results = [row for row in existing_results if not _is_old_f1_advance_allocation_row(row, guarded_payment_ids)]
    if active_filters.source_model in EXTENDED_SOURCE_MODELS:
        results = candidate_rows
    else:
        # Avoid duplicating rows if the base service later gains first-class purchase/vendor/rent-lease/customer-advance support.
        existing_ids = {(row.get("source_model"), str(row.get("source_id") or row.get("source_pk") or ""), row.get("event_key")) for row in existing_results}
        results = [*existing_results, *[row for row in candidate_rows if (row.get("source_model"), str(row.get("source_id") or row.get("source_pk") or ""), row.get("event_key")) not in existing_ids]]
    summary = {**(payload.get("summary") or {}), **summarize_candidate_statuses(results)}
    phase_f_control_tower = _phase_f_control_tower(
        results,
        payload.get("accounting_period_readiness") or payload.get("financial_year_readiness") or {},
        payload.get("readiness_blockers") or [],
    )
    return {**payload, "summary": summary, "phase_f_control_tower": phase_f_control_tower, "results": results}
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
from accounting.services.accounting_bridge_reconciliation_read_service import annotate_phase_f_row_actions


def annotate_purchase_bill_reconciliation_row(row: dict) -> dict:
    """Read-only purchase-bill inventory row action adapter."""
    return annotate_phase_f_row_actions(row)
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
