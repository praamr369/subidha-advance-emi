from __future__ import annotations

from collections import Counter
from typing import Any

from accounting.services import accounting_bridge_staff_advance_service as staff_advance_bridge
from accounting.services.accounting_bridge_reconciliation_read_service import (
    BridgeReconciliationFilters,
    annotate_phase_f_row_actions,
    build_accounting_bridge_reconciliation as _base_build_accounting_bridge_reconciliation,
)


def annotate_purchase_bill_reconciliation_row(row: dict) -> dict:
    """Read-only purchase-bill inventory row action adapter."""

    return annotate_phase_f_row_actions(row)


def _row_status(row: dict[str, Any]) -> str:
    return str(row.get("status") or "").strip().upper()


def _is_staff_advance_boundary(row: dict[str, Any]) -> bool:
    return (
        row.get("event_key") == staff_advance_bridge.EVENT_KEY
        and row.get("source_model") == staff_advance_bridge.SOURCE_MODEL
        and row.get("row_type") != "bridge_candidate"
    )


def _event_counts(rows: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    counts: dict[str, Counter] = {}
    for row in rows:
        key = str(row.get("event_key") or "unknown")
        counts.setdefault(key, Counter())
        counts[key][_row_status(row) or "INFO"] += 1
    return {key: dict(value) for key, value in counts.items()}


def _blocking_groups(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        status = _row_status(row)
        if not status.startswith("BLOCKED") and status not in {"UNSUPPORTED_SOURCE", "UNSUPPORTED"}:
            continue
        key = (str(row.get("event_key") or "unknown"), str(row.get("blocker_code") or status))
        grouped.setdefault(
            key,
            {
                "event_key": key[0],
                "blocker_code": key[1],
                "blocker_label": row.get("blocker_label") or key[1],
                "count": 0,
                "recommended_action": row.get("recommended_action"),
                "action_href": row.get("action_href"),
                "is_acknowledgeable": False,
                "is_postable": False,
            },
        )
        grouped[key]["count"] += 1
    return list(grouped.values())


def _staff_status(staff_rows: list[dict[str, Any]]) -> str:
    if any(_row_status(row) == "POSTED_UNVERIFIED" or row.get("posted_unverified") for row in staff_rows):
        return "POSTED_UNVERIFIED"
    if any(_row_status(row).startswith("BLOCKED") for row in staff_rows):
        return "BLOCKED"
    if any(_row_status(row) == "READY_UNPOSTED" for row in staff_rows):
        return "READY"
    if any(_row_status(row) == "POSTED" for row in staff_rows):
        return "POSTED_UNVERIFIED"
    if any(_row_status(row) == "RECONCILED" for row in staff_rows):
        return "RECONCILED"
    return "READY"


def _staff_counts(staff_rows: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "ready_unposted": sum(1 for row in staff_rows if _row_status(row) == "READY_UNPOSTED"),
        "posted_unverified": sum(1 for row in staff_rows if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED" or _row_status(row) == "POSTED_UNVERIFIED"),
        "reconciled": sum(1 for row in staff_rows if _row_status(row) == "RECONCILED" or row.get("reconciliation_state") == "RECONCILED"),
        "blocked": sum(1 for row in staff_rows if _row_status(row).startswith("BLOCKED")),
        "unsupported": sum(1 for row in staff_rows if _row_status(row) in {"UNSUPPORTED", "UNSUPPORTED_SOURCE"}),
        "skipped_deferred": sum(1 for row in staff_rows if _row_status(row) in {"SKIPPED_NOT_APPLICABLE", "DEFERRED"}),
        "exception": sum(1 for row in staff_rows if _row_status(row) == "EXCEPTION" or bool(row.get("exception_reasons"))),
    }


def _action_link() -> dict[str, Any]:
    return {
        "key": "bridge_posting",
        "label": "Bridge Posting",
        "href": "/admin/accounting/bridge-reconciliation?source_model=StaffAdvance&event_key=staff_advance",
        "disabled": False,
    }


def _merge_control_tower(payload: dict[str, Any], rows: list[dict[str, Any]], staff_rows: list[dict[str, Any]]) -> dict[str, Any]:
    tower = dict(payload.get("phase_f_control_tower") or {})
    inventory = []
    staff_seen = False
    for item in tower.get("source_inventory") or []:
        if item.get("source_model") == staff_advance_bridge.SOURCE_MODEL:
            staff_seen = True
            counts = _staff_counts(staff_rows)
            inventory.append(
                {
                    **item,
                    "phase": "F26",
                    "domain": "Payroll/salary",
                    "source_model": staff_advance_bridge.SOURCE_MODEL,
                    "event_keys": [staff_advance_bridge.EVENT_KEY],
                    "event_key": staff_advance_bridge.EVENT_KEY,
                    "accounting_shape": "Dr staff advance receivable, Cr concrete cash/bank/UPI finance account",
                    "source_owner": "accounting.StaffAdvance",
                    "status": _staff_status(staff_rows),
                    "counts": counts,
                    "primary_blocker_type": "mapping" if counts["blocked"] else None,
                    "can_post": False,
                    "action_links": [_action_link()],
                }
            )
        else:
            inventory.append(item)
    if not staff_seen:
        inventory.append(
            {
                "phase": "F26",
                "domain": "Payroll/salary",
                "source_model": staff_advance_bridge.SOURCE_MODEL,
                "event_keys": [staff_advance_bridge.EVENT_KEY],
                "event_key": staff_advance_bridge.EVENT_KEY,
                "accounting_shape": "Dr staff advance receivable, Cr concrete cash/bank/UPI finance account",
                "source_owner": "accounting.StaffAdvance",
                "status": _staff_status(staff_rows),
                "counts": _staff_counts(staff_rows),
                "primary_blocker_type": None,
                "can_post": False,
                "action_links": [_action_link()],
            }
        )
    readiness = dict(tower.get("readiness") or {})
    counts = dict(readiness.get("counts") or {})
    status_counts = Counter(_row_status(row) or "INFO" for row in rows)
    counts.update(
        {
            "ready_unposted": status_counts.get("READY_UNPOSTED", 0),
            "posted_unverified": sum(1 for row in rows if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED" or _row_status(row) == "POSTED_UNVERIFIED"),
            "blocked": sum(count for status, count in status_counts.items() if status.startswith("BLOCKED")),
            "unsupported": status_counts.get("UNSUPPORTED_SOURCE", 0) + status_counts.get("UNSUPPORTED", 0),
            "exceptions": status_counts.get("EXCEPTION", 0),
        }
    )
    states = [state for state in readiness.get("states") or [] if state not in {"UNSUPPORTED_ONLY"}]
    if counts["ready_unposted"] and "READY_FOR_CONTROLLED_POSTING" not in states:
        states.append("READY_FOR_CONTROLLED_POSTING")
    if not states:
        states = ["NO_CANDIDATES"]
    readiness.update(
        {
            "state": states[0],
            "primary_state": states[0],
            "states": states,
            "ready_for_controlled_posting": "READY_FOR_CONTROLLED_POSTING" in states,
            "counts": counts,
        }
    )
    return {**tower, "source_inventory": inventory, "readiness": readiness}


def _merge_production_validation(payload: dict[str, Any], staff_rows: list[dict[str, Any]]) -> dict[str, Any]:
    validation = dict(payload.get("production_accounting_validation") or {})
    workflows = []
    for workflow in validation.get("workflows") or []:
        if workflow.get("source_model") == staff_advance_bridge.SOURCE_MODEL and workflow.get("event_key") == staff_advance_bridge.EVENT_KEY:
            workflows.append(
                {
                    **workflow,
                    "domain": "Payroll",
                    "workflow": "Staff advance disbursement",
                    "accounting_shape": "Dr staff advance receivable, Cr concrete cash/bank/UPI finance account",
                    "bridge_source_ownership": "F26 StaffAdvance bridge",
                    "expected_candidate_status": "READY_UNPOSTED or blocked by setup controls",
                    "expected_reconciliation_posture": "Staff advance posting must be verified before reconciled.",
                    "status": _staff_status(staff_rows),
                    "current_row_count": len(staff_rows),
                    "posted_unverified_count": _staff_counts(staff_rows)["posted_unverified"],
                    "reconciled_count": _staff_counts(staff_rows)["reconciled"],
                    "expected_action": _action_link(),
                }
            )
        else:
            workflows.append(workflow)
    grouped: dict[str, list[dict[str, Any]]] = {}
    for workflow in workflows:
        grouped.setdefault(str(workflow.get("domain") or "Other"), []).append(workflow)
    checks = dict(validation.get("source_event_separation_checks") or {})
    checks.pop("staff_advance_unsupported", None)
    checks["staff_advance_supported"] = True
    return {**validation, "workflows": workflows, "groups": grouped, "source_event_separation_checks": checks}


def _recompute_summary(payload: dict[str, Any], rows: list[dict[str, Any]], staff_rows: list[dict[str, Any]]) -> dict[str, Any]:
    status_counts = Counter(_row_status(row) or "INFO" for row in rows)
    event_counts = _event_counts(rows)
    summary = dict(payload.get("summary") or {})
    summary.update(
        {
            "source_count": len(rows),
            "ready_unposted_count": status_counts.get("READY_UNPOSTED", 0),
            "blocked_count": sum(count for status, count in status_counts.items() if status.startswith("BLOCKED") or status in {"UNSUPPORTED_SOURCE", "UNSUPPORTED"}),
            "posted_count": status_counts.get("POSTED", 0),
            "reconciled_count": status_counts.get("RECONCILED", 0),
            "exception_count": status_counts.get("EXCEPTION", 0),
            "unsupported_count": status_counts.get("UNSUPPORTED_SOURCE", 0) + status_counts.get("UNSUPPORTED", 0),
            "blocked_by_mapping_count": status_counts.get("BLOCKED_BY_MAPPING", 0),
            "blocked_by_finance_account_count": status_counts.get("BLOCKED_BY_FINANCE_ACCOUNT", 0),
            "blocked_by_period_count": status_counts.get("BLOCKED_BY_PERIOD", 0),
            "blocked_by_numbering_count": status_counts.get("BLOCKED_BY_NUMBERING", 0),
            "blocked_by_approval_count": status_counts.get("BLOCKED_BY_APPROVAL", 0),
            "unposted_bridge_item_count": status_counts.get("READY_UNPOSTED", 0),
            "posted_unverified_count": sum(1 for row in rows if row.get("posted_unverified") or row.get("reconciliation_state") == "POSTED_UNVERIFIED" or _row_status(row) == "POSTED_UNVERIFIED"),
            "unsupported_source_count": status_counts.get("UNSUPPORTED_SOURCE", 0) + status_counts.get("UNSUPPORTED", 0),
            "staff_advance_boundary": 0,
            "staff_advance_supported_count": len(staff_rows),
            "ready_unposted_by_event": {key: value.get("READY_UNPOSTED", 0) for key, value in event_counts.items() if value.get("READY_UNPOSTED", 0)},
            "blocked_by_mapping_by_event": {key: value.get("BLOCKED_BY_MAPPING", 0) for key, value in event_counts.items() if value.get("BLOCKED_BY_MAPPING", 0)},
            "status_counts_by_event": event_counts,
            "blocking_groups": _blocking_groups(rows),
        }
    )
    summary.update(staff_advance_bridge.summarize_candidate_statuses(staff_rows))
    return summary


def build_accounting_bridge_reconciliation(filters: BridgeReconciliationFilters | None = None) -> dict[str, Any]:
    payload = _base_build_accounting_bridge_reconciliation(filters)
    staff_rows = [annotate_phase_f_row_actions(row) for row in staff_advance_bridge.list_bridge_candidates(filters)]
    rows = [row for row in payload.get("results", []) if not _is_staff_advance_boundary(row)]
    existing_ids = {row.get("bridge_candidate_id") or row.get("id") for row in rows}
    for row in staff_rows:
        row_id = row.get("bridge_candidate_id") or row.get("id")
        if row_id not in existing_ids:
            rows.append(row)
    rows.sort(key=lambda row: (row.get("source_date") or "", str(row.get("source_id") or "")), reverse=True)
    return {
        **payload,
        "results": rows,
        "summary": _recompute_summary(payload, rows, staff_rows),
        "phase_f_control_tower": _merge_control_tower(payload, rows, staff_rows),
        "production_accounting_validation": _merge_production_validation(payload, staff_rows),
    }


__all__ = [
    "BridgeReconciliationFilters",
    "annotate_purchase_bill_reconciliation_row",
    "build_accounting_bridge_reconciliation",
]
