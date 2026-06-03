from __future__ import annotations

from datetime import date
from typing import Any

from accounting.services.bridge_run_service import run_inventory_posting_bridges as _run_inventory_posting_bridges

POSTING_NOT_APPROVED = "POSTING_NOT_APPROVED"


def _not_approved_payload(*, start_date: date, end_date: date, dry_run: bool) -> dict[str, Any]:
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "dry_run": dry_run,
        "purpose": "INVENTORY_POSTING",
        "status": POSTING_NOT_APPROVED,
        "purchase_candidates": 0,
        "purchase_created": 0,
        "purchase_existing": 0,
        "adjustment_candidates": 0,
        "adjustment_created": 0,
        "adjustment_existing": 0,
        "skipped": [
            {
                "reason": POSTING_NOT_APPROVED,
                "operator_action": "Set posting_approved=true only after finance/admin review. No purchase, inventory, journal, or bridge posting was created.",
            }
        ],
    }


def run_inventory_posting_bridges_guarded(
    *,
    start_date: date,
    end_date: date,
    dry_run: bool = False,
    posting_approved: bool = False,
    performed_by=None,
) -> dict[str, Any]:
    """Guard bulk purchase/inventory bridge posting behind explicit approval.

    Dry-run remains available without approval. Non-dry-run requests without
    posting_approved=True return a controlled POSTING_NOT_APPROVED payload and
    do not call the underlying purchase/stock posting service.
    """

    if not dry_run and not posting_approved:
        return _not_approved_payload(start_date=start_date, end_date=end_date, dry_run=dry_run)
    return _run_inventory_posting_bridges(
        start_date=start_date,
        end_date=end_date,
        dry_run=dry_run,
        performed_by=performed_by,
    )
