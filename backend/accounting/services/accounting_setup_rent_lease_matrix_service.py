"""Additive accounting setup matrix overlay for live rent/lease source collection."""
from __future__ import annotations

from copy import deepcopy

from accounting.services.accounting_setup_matrix_service import build_accounting_setup_matrix as _base_build_matrix

RENT_LEASE_SOURCE_COLLECTION_COPY = (
    "Operational source collection is enabled. Accounting posting bridge remains "
    "audit-deferred until approved."
)

IMPLEMENTED_RENT_LEASE_PROFILES = {
    "rent_lease_collection": {
        "required_debit_account": ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"],
        "required_credit_account": ["RENT_INCOME", "LEASE_INCOME"],
    },
    "security_deposit": {
        "required_debit_account": ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"],
        "required_credit_account": ["SECURITY_DEPOSIT_LIABILITY"],
    },
}


def _row_ready(row: dict) -> bool:
    required_count = len(row.get("required_debit_account") or []) + len(row.get("required_credit_account") or [])
    configured_count = len(row.get("configured_debit_account") or []) + len(row.get("configured_credit_account") or [])
    return required_count > 0 and configured_count >= required_count


def _normalize_row(row: dict) -> dict:
    key = row.get("key")
    spec = IMPLEMENTED_RENT_LEASE_PROFILES.get(key)
    if not spec:
        return row
    updated = {**row, **spec, "implemented": True}
    blockers = [
        blocker
        for blocker in (updated.get("blockers") or [])
        if "deferred" not in str(blocker).lower() and "do not create fake" not in str(blocker).lower()
    ]
    actions = [
        action
        for action in (updated.get("recommended_actions") or [])
        if "deferred" not in str(action).lower() and "do not create fake" not in str(action).lower()
    ]
    updated["blockers"] = blockers
    updated["recommended_actions"] = actions
    updated["recommended_action"] = actions[0] if actions else (blockers[0] if blockers else RENT_LEASE_SOURCE_COLLECTION_COPY)
    if _row_ready(updated) and not blockers:
        updated["status"] = "READY"
    elif (updated.get("configured_debit_account") or updated.get("configured_credit_account")):
        updated["status"] = "PARTIAL"
    else:
        updated["status"] = "BLOCKED"
    updated["operator_note"] = RENT_LEASE_SOURCE_COLLECTION_COPY
    return updated


def build_accounting_setup_matrix() -> dict:
    payload = deepcopy(_base_build_matrix())
    payload["posting_profile_readiness"] = [
        _normalize_row(dict(row)) for row in payload.get("posting_profile_readiness", [])
    ]
    copy = dict(payload.get("operator_copy") or {})
    copy["rent_lease_source_collection"] = RENT_LEASE_SOURCE_COLLECTION_COPY
    payload["operator_copy"] = copy
    summary = dict(payload.get("summary") or {})
    rows = payload.get("posting_profile_readiness") or []
    summary.update(
        {
            "ready_count": sum(1 for row in rows if row.get("status") == "READY"),
            "blocked_count": sum(1 for row in rows if row.get("status") == "BLOCKED"),
            "partial_count": sum(1 for row in rows if row.get("status") == "PARTIAL"),
            "deferred_count": sum(1 for row in rows if row.get("status") == "DEFERRED"),
        }
    )
    payload["summary"] = summary
    return payload
