from __future__ import annotations

from datetime import date
from typing import Any

from accounting.services.bridge_run_service import (
    run_commission_settlement_bridges as _run_commission_settlement_bridges,
    run_payout_batch_bridges as _run_payout_batch_bridges,
)

POSTING_NOT_APPROVED = "POSTING_NOT_APPROVED"


def _not_approved_payload(*, start_date: date, end_date: date, dry_run: bool, purpose: str) -> dict[str, Any]:
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "dry_run": dry_run,
        "purpose": purpose,
        "status": POSTING_NOT_APPROVED,
        "created_count": 0,
        "existing_count": 0,
        "candidates": 0,
        "skipped": [
            {
                "reason": POSTING_NOT_APPROVED,
                "operator_action": "Set posting_approved=true only after finance/admin review. No journal or bridge posting was created.",
            }
        ],
    }


def run_commission_settlement_bridges_guarded(
    *,
    start_date: date,
    end_date: date,
    dry_run: bool = False,
    posting_approved: bool = False,
    performed_by=None,
) -> dict[str, Any]:
    """Run commission accrual/settlement bridge only after explicit posting approval.

    Dry-run remains available without approval and creates no journals. Non-dry-run
    requests without posting_approved=True return a controlled POSTING_NOT_APPROVED
    payload and do not call the underlying posting service.
    """

    if not dry_run and not posting_approved:
        return _not_approved_payload(
            start_date=start_date,
            end_date=end_date,
            dry_run=dry_run,
            purpose="COMMISSION_SETTLEMENT",
        )
    return _run_commission_settlement_bridges(
        start_date=start_date,
        end_date=end_date,
        dry_run=dry_run,
        performed_by=performed_by,
    )


def run_payout_batch_bridges_guarded(
    *,
    start_date: date,
    end_date: date,
    dry_run: bool = False,
    posting_approved: bool = False,
    performed_by=None,
) -> dict[str, Any]:
    """Run payout-batch payment bridge only after explicit posting approval."""

    if not dry_run and not posting_approved:
        return _not_approved_payload(
            start_date=start_date,
            end_date=end_date,
            dry_run=dry_run,
            purpose="COMMISSION_PAYOUT_BATCH",
        )
    return _run_payout_batch_bridges(
        start_date=start_date,
        end_date=end_date,
        dry_run=dry_run,
        performed_by=performed_by,
    )
