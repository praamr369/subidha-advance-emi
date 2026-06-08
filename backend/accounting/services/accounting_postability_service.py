from __future__ import annotations

from collections import Counter
from typing import Any

from accounting.services.accounting_bridge_readiness_service import build_accounting_bridge_period_readiness

READY = "READY"
POSTABLE = "POSTABLE"
READY_UNPOSTED = "READY_UNPOSTED"
POSTED = "POSTED"
RECONCILED = "RECONCILED"
BLOCKED_BY_MAPPING = "BLOCKED_BY_MAPPING"
BLOCKED_BY_PERIOD = "BLOCKED_BY_PERIOD"
BLOCKED_BY_NUMBERING = "BLOCKED_BY_NUMBERING"
BLOCKED_BY_APPROVAL = "BLOCKED_BY_APPROVAL"
UNSUPPORTED_SOURCE = "UNSUPPORTED_SOURCE"

CANONICAL_STATUSES = (
    READY,
    POSTABLE,
    READY_UNPOSTED,
    POSTED,
    RECONCILED,
    BLOCKED_BY_MAPPING,
    BLOCKED_BY_PERIOD,
    BLOCKED_BY_NUMBERING,
    BLOCKED_BY_APPROVAL,
    UNSUPPORTED_SOURCE,
)

APPROVAL_REQUIRED_EVENTS = {
    "commission_approval",
    "commission_payout",
    "payout_batch_payment",
    "purchase_inventory_receive",
    "inventory_purchase_receive",
}

ACTION_HREF_BY_BLOCKER = {
    BLOCKED_BY_MAPPING: "/admin/accounting/setup/mapping-audit",
    BLOCKED_BY_PERIOD: "/admin/accounting/periods",
    BLOCKED_BY_NUMBERING: "/admin/settings/business-setup/document-numbering",
    BLOCKED_BY_APPROVAL: "/admin/accounting/bridges",
    UNSUPPORTED_SOURCE: "/admin/accounting/setup/mapping-audit",
}


def _first_reason(row: dict[str, Any] | None) -> str | None:
    reasons = (row or {}).get("blocking_reasons") or []
    return str(reasons[0]) if reasons else None


def _mapping_status(row: dict[str, Any] | None) -> str:
    if row is None:
        return UNSUPPORTED_SOURCE
    raw = str(row.get("status") or "NOT_CONFIGURED").strip().upper()
    if raw in {UNSUPPORTED_SOURCE, BLOCKED_BY_MAPPING}:
        return raw
    if raw in CANONICAL_STATUSES:
        return READY
    if raw == "READY":
        return READY
    if raw in {"WARNING", "ERROR", "NOT_CONFIGURED"}:
        return BLOCKED_BY_MAPPING
    if raw.startswith("BLOCKED"):
        return raw
    return BLOCKED_BY_MAPPING


def evaluate_accounting_postability(
    *,
    event_key: str,
    event_label: str | None = None,
    module: str | None = None,
    source_model: str | None = None,
    bridge_row: dict[str, Any] | None = None,
    period_readiness: dict[str, Any] | None = None,
    source_workflow_exists: bool | None = None,
    posted: bool = False,
    reconciled: bool = False,
    approval_required: bool | None = None,
    as_source_row: bool = False,
) -> dict[str, Any]:
    """Return the canonical postability contract for setup, bridge, and reconciliation screens.

    This evaluator is intentionally read-only. It reads supplied readiness payloads only and
    never creates journals, document numbers, periods, mappings, or source records.
    """

    key = (event_key or "").strip()
    period = period_readiness or build_accounting_bridge_period_readiness()
    supported = bool(source_workflow_exists if source_workflow_exists is not None else bridge_row is not None)
    if key == "staff_advance":
        supported = False
    mapping_state = _mapping_status(bridge_row)
    mapping_ready = mapping_state == READY
    active_financial_year_ready = bool(period.get("financial_year_ready"))
    accounting_period_ready = bool(period.get("accounting_period_ready"))
    journal_numbering_ready = bool(period.get("journal_numbering_ready"))
    period_ready = active_financial_year_ready and accounting_period_ready
    needs_approval = bool(approval_required if approval_required is not None else key in APPROVAL_REQUIRED_EVENTS)
    approval_ready = not needs_approval

    if not supported:
        status = UNSUPPORTED_SOURCE
        blocker_code = "UNSUPPORTED_SOURCE"
        blocker_reason = "Source workflow is not configured. Do not create fake posting readiness."
    elif reconciled:
        status = RECONCILED
        blocker_code = None
        blocker_reason = "Already reconciled."
    elif posted:
        status = POSTED
        blocker_code = None
        blocker_reason = "Already posted."
    elif not mapping_ready:
        status = BLOCKED_BY_MAPPING
        blocker_code = "MAPPING_NOT_READY"
        blocker_reason = _first_reason(bridge_row) or (bridge_row or {}).get("operator_action") or "Complete COA, FinanceAccount, and posting profile mapping."
    elif not period_ready:
        status = BLOCKED_BY_PERIOD
        blocker_code = str(period.get("period_blocker_code") or "PERIOD_NOT_READY")
        blocker_reason = str(period.get("period_blocker_reason") or "Active financial year and open target accounting period are required.")
    elif not journal_numbering_ready:
        status = BLOCKED_BY_NUMBERING
        blocker_code = "JOURNAL_NUMBERING_NOT_READY"
        blocker_reason = "JOURNAL_ENTRY document numbering is required before posting."
    elif not approval_ready:
        status = BLOCKED_BY_APPROVAL
        blocker_code = "APPROVAL_REQUIRED"
        blocker_reason = "Controlled bridge posting approval is required for this workflow."
    elif as_source_row:
        status = READY_UNPOSTED
        blocker_code = "READY_UNPOSTED"
        blocker_reason = "Mapping and setup are ready; source item is not posted yet."
    else:
        status = POSTABLE
        blocker_code = None
        blocker_reason = "All mapping, period, numbering, and approval gates are ready."

    can_preview = status in {POSTABLE, READY_UNPOSTED}
    can_post = status in {POSTABLE, READY_UNPOSTED}
    can_reconcile = status == POSTED
    setup_href = ACTION_HREF_BY_BLOCKER.get(status, "/admin/accounting/bridge-reconciliation")
    action_href = setup_href
    if status in {POSTABLE, READY_UNPOSTED, POSTED, RECONCILED}:
        action_href = "/admin/accounting/bridge-reconciliation"

    return {
        "event_key": key,
        "event_label": event_label or (bridge_row or {}).get("label") or key.replace("_", " ").title(),
        "module": module or (bridge_row or {}).get("source_module") or (bridge_row or {}).get("event_group") or "accounting",
        "source_model": source_model or (bridge_row or {}).get("source_model"),
        "supported": supported,
        "source_workflow_exists": supported,
        "mapping_ready": mapping_ready,
        "coa_ready": mapping_ready,
        "finance_account_ready": mapping_ready,
        "posting_profile_ready": mapping_ready,
        "approval_ready": approval_ready,
        "active_financial_year_ready": active_financial_year_ready,
        "accounting_period_ready": accounting_period_ready,
        "journal_numbering_ready": journal_numbering_ready,
        "reconciliation_ready": can_reconcile or status == RECONCILED,
        "can_preview": can_preview,
        "can_post": can_post,
        "can_reconcile": can_reconcile,
        "status": status,
        "blocker_code": blocker_code,
        "blocker_reason": blocker_reason,
        "recommended_action": _recommended_action(status),
        "setup_href": setup_href,
        "action_href": action_href,
    }


def _recommended_action(status: str) -> str:
    if status == POSTABLE:
        return "Preview and post only through the controlled bridge posting workflow."
    if status == READY_UNPOSTED:
        return "Open bridge reconciliation, preview the source row, then post through controlled posting."
    if status == BLOCKED_BY_MAPPING:
        return "Open mapping audit and fix COA, FinanceAccount, and posting profile blockers."
    if status == BLOCKED_BY_PERIOD:
        return "Open accounting periods and create/open the required period."
    if status == BLOCKED_BY_NUMBERING:
        return "Open document numbering and configure JOURNAL_ENTRY numbering."
    if status == BLOCKED_BY_APPROVAL:
        return "Complete the explicit admin approval gate before posting."
    if status == UNSUPPORTED_SOURCE:
        return "Keep this workflow non-postable until a real source model/workflow exists."
    if status == POSTED:
        return "Review journal and reconciliation evidence."
    if status == RECONCILED:
        return "No posting action required."
    return "Review accounting readiness."


def staff_advance_unsupported_event(period_readiness: dict[str, Any] | None = None) -> dict[str, Any]:
    postability = evaluate_accounting_postability(event_key="staff_advance", event_label="Staff advance", module="HR & Payroll", source_model="StaffAdvance", bridge_row=None, period_readiness=period_readiness, source_workflow_exists=False)
    return {"event_key": "staff_advance", "label": "Staff advance", "source_module": "accounting", "source_model": "StaffAdvance", "event_group": "HR & Payroll", "posting_mode": "UNSUPPORTED", "debit_requirements": [], "credit_requirements": [], "required_finance_account_kinds": [], "required_coa_system_codes": [], "required_mapping_purposes": [], "debit_accounts": [], "credit_accounts": [], "finance_accounts": [], "blocking_reasons": [postability["blocker_reason"]], "operator_action": postability["recommended_action"], **postability}


def canonicalize_bridge_readiness_payload(payload: dict[str, Any], *, as_source_rows: bool = False, include_staff_advance: bool = True) -> dict[str, Any]:
    period = payload.get("accounting_period_readiness") or payload.get("financial_year_readiness") or build_accounting_bridge_period_readiness()
    rows: list[dict[str, Any]] = []
    for event in payload.get("events") or []:
        postability = evaluate_accounting_postability(event_key=str(event.get("event_key") or ""), event_label=event.get("label"), module=event.get("source_module") or event.get("event_group"), source_model=event.get("source_model"), bridge_row=event, period_readiness=period, source_workflow_exists=True, as_source_row=as_source_rows)
        if as_source_rows:
            rows.append({**event, **postability, "operator_action": postability["recommended_action"], "blocking_reasons": event.get("blocking_reasons") or ([postability["blocker_reason"]] if postability.get("blocker_reason") else [])})
        else:
            status_override = {"status": UNSUPPORTED_SOURCE} if postability["status"] == UNSUPPORTED_SOURCE else {}
            rows.append({**event, **status_override, "postability": postability, "canonical_status": postability["status"], "canonical_blocker_code": postability["blocker_code"], "canonical_blocker_reason": postability["blocker_reason"], "canonical_recommended_action": postability["recommended_action"]})
    if include_staff_advance and not any(row.get("event_key") == "staff_advance" for row in rows):
        rows.append(staff_advance_unsupported_event(period))
    status_counts = Counter(str(row.get("canonical_status") or row.get("status") or "INFO") for row in rows)
    canonical_summary = {f"{status.lower()}_count": status_counts.get(status, 0) for status in CANONICAL_STATUSES}
    canonical_summary.update({"blocked_count": sum(count for status, count in status_counts.items() if status.startswith("BLOCKED") or status == UNSUPPORTED_SOURCE), "source_count": len(rows), "status_counts": dict(status_counts)})
    return {**payload, "summary": {**(payload.get("summary") or {}), **canonical_summary}, "financial_year_readiness": payload.get("financial_year_readiness") or period, "accounting_period_readiness": payload.get("accounting_period_readiness") or period, "events": rows, "canonical_statuses": list(CANONICAL_STATUSES)}
