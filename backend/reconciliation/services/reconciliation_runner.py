from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from reconciliation.models import (
    ReconciliationRun,
    ReconciliationRunStatus,
)
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.emi_reconciliation import run_emi_checks


@dataclass(frozen=True)
class PhaseFRunRequest:
    scope: str
    module: str
    date_from: date | None = None
    date_to: date | None = None
    branch_id: int | None = None


@transaction.atomic
def start_and_run_phase_f(*, request: PhaseFRunRequest, started_by) -> ReconciliationRun:
    run_no = (ReconciliationRun.objects.aggregate(mx=Max("run_no"))["mx"] or 0) + 1
    run = ReconciliationRun.objects.create(
        run_no=run_no,
        scope=request.scope,
        module=request.module,
        branch_id=request.branch_id,
        date_from=request.date_from,
        date_to=request.date_to,
        status=ReconciliationRunStatus.RUNNING,
        started_by=started_by,
        started_at=timezone.now(),
        metadata={
            "phase": "F",
            "checks": [
                "PAYMENT_MISSING_RECEIPT_DOCUMENT",
                "RECEIPT_DOCUMENT_PAYMENT_LINK_INVALID",
                "PAYMENT_EMI_STATUS_MISMATCH_PENDING",
                "EMI_PAID_MISSING_LEDGER_EVIDENCE",
                "PAYMENT_MISSING_ACCOUNTING_BRIDGE_POSTING",
                "BRIDGE_JOURNAL_MISSING_SOURCE_REFERENCE",
                "JOURNAL_GROUP_UNBALANCED",
                "DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            ],
        },
    )

    try:
        totals = {
            "checked": 0,
            "matched": 0,
            "exceptions": 0,
            "high_risk": 0,
        }
        totals = run_emi_checks(run=run, totals=totals)
        totals = run_accounting_bridge_checks(run=run, totals=totals)

        run.total_checked = totals["checked"]
        run.total_matched = totals["matched"]
        run.total_exceptions = totals["exceptions"]
        run.high_risk_count = totals["high_risk"]
        run.status = ReconciliationRunStatus.COMPLETED
        run.finished_at = timezone.now()
        run.save(
            update_fields=[
                "total_checked",
                "total_matched",
                "total_exceptions",
                "high_risk_count",
                "status",
                "finished_at",
            ]
        )
    except Exception as exc:
        run.status = ReconciliationRunStatus.FAILED
        run.finished_at = timezone.now()
        run.metadata = {
            **(run.metadata or {}),
            "error": str(exc),
        }
        run.save(update_fields=["status", "finished_at", "metadata"])
        raise

    return run

