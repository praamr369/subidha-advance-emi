from __future__ import annotations

import logging
from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone

from accounting.services.bridge_run_service import (
    run_emi_payment_bridges,
    run_retail_sale_bridges,
    run_emi_waiver_bridges,
    run_emi_subscription_bridges,
    run_commission_settlement_bridges,
    run_inventory_posting_bridges,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.models import AuditLog

logger = logging.getLogger(__name__)


def run_solopreneur_daily_close(*, as_of: date | None = None, performed_by=None, dry_run: bool = False, full_rescan: bool = False) -> dict:
    """
    Run all accounting bridges sequentially for the solopreneur daily close.
    This replaces the multi-department manual review with a single trusted call.
    """
    end_date = as_of or timezone.localdate()
    
    # 1. Determine start_date
    if full_rescan:
        start_date = date(2020, 1, 1)
    else:
        last_run = AuditLog.objects.filter(
            action_type="SOLOPRENEUR_DAILY_CLOSE",
            metadata__status="SUCCESS"
        ).order_by('-created_at').first()
        
        if last_run and last_run.created_at:
            # Re-scan from 7 days before last successful run to catch any backdated entries
            start_date = (last_run.created_at.date() - timedelta(days=7))
        else:
            start_date = date(2020, 1, 1)

    results = {}
    total_processed = 0
    total_errors = 0
    
    bridges = [
        ("retail_sales", run_retail_sale_bridges),
        ("emi_subscriptions", run_emi_subscription_bridges),
        ("emi_payments", run_emi_payment_bridges),
        ("emi_waivers", run_emi_waiver_bridges),
        ("commission_settlements", run_commission_settlement_bridges),
        ("inventory_postings", run_inventory_posting_bridges),
    ]

    # 2. Run each bridge in its own atomic block so one failure doesn't roll back the others
    for bridge_key, bridge_fn in bridges:
        try:
            with transaction.atomic():
                bridge_result = bridge_fn(
                    start_date=start_date, end_date=end_date, dry_run=dry_run, performed_by=performed_by
                )
                results[bridge_key] = bridge_result
                total_processed += bridge_result.get("processed", 0)
                total_errors += bridge_result.get("errors", 0)
        except Exception as e:
            logger.exception(f"Bridge {bridge_key} failed during solopreneur close.")
            results[bridge_key] = {"processed": 0, "errors": 1, "error": str(e)}
            total_errors += 1

    status = "SUCCESS"
    if total_errors > 0:
        status = "PARTIAL_SUCCESS"

    # 3. Write Audit Log
    if not dry_run:
        log_audit(
            action_type="SOLOPRENEUR_DAILY_CLOSE",
            instance=None,
            performed_by=performed_by,
            metadata={
                "status": status,
                "start_date": str(start_date),
                "end_date": str(end_date),
                "processed": total_processed,
                "errors": total_errors,
                "results": results
            }
        )

    return {
        "status": status,
        "processed": total_processed,
        "errors": total_errors,
        "details": results,
    }
