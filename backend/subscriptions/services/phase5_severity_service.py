from __future__ import annotations

from datetime import date


ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}


def infer_severity(key: str, count: int) -> str:
    if key in {"unreconciled_payments"} and count > 0:
        return "CRITICAL"
    if key in {"overdue_dues", "deliveries_pending"} and count > 0:
        return "HIGH"
    if key in {"contracts_awaiting_approval", "return_inspections_pending", "returns_due"} and count > 0:
        return "MEDIUM"
    if key in {"kyc_pending", "partner_commission_pending"} and count > 0:
        return "LOW"
    return "INFO"


def rank_alert_rows(rows: list[dict]) -> list[dict]:
    return sorted(
        rows,
        key=lambda row: (
            ORDER.get(str(row.get("severity") or "INFO"), 5),
            str(row.get("oldest_pending_at") or date.max.isoformat()),
        ),
    )

