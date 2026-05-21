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
from reconciliation.services.direct_sale_reconciliation import run_direct_sale_billing_checks
from reconciliation.services.emi_reconciliation import run_emi_checks
from reconciliation.services.inventory_stock_reconciliation import run_inventory_stock_checks
from reconciliation.services.return_cancellation_reconciliation import run_return_cancellation_checks


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
            "phase": "I",
            "checks": [
                "PAYMENT_MISSING_RECEIPT_DOCUMENT",
                "RECEIPT_DOCUMENT_PAYMENT_LINK_INVALID",
                "PAYMENT_EMI_STATUS_MISMATCH_PENDING",
                "EMI_PAID_MISSING_LEDGER_EVIDENCE",
                "PAYMENT_MISSING_ACCOUNTING_BRIDGE_POSTING",
                "BRIDGE_JOURNAL_MISSING_SOURCE_REFERENCE",
                "JOURNAL_GROUP_UNBALANCED",
                "DUPLICATE_JOURNAL_SOURCE_REFERENCE",
                "BILLING_INVOICE_POSTED_JOURNAL_MISSING",
                "BILLING_INVOICE_JOURNAL_SOURCE_LINK_INVALID",
                "BILLING_INVOICE_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
                "BILLING_INVOICE_RECEIPT_LINK_MISSING",
                "BILLING_INVOICE_AMOUNT_FIELDS_MISMATCH",
                "BILLING_INVOICE_CANCELLED_OUTSTANDING",
                "RECEIPT_DOCUMENT_INVOICE_LINK_INVALID",
                "DIRECT_SALE_RETURN_AMOUNT_FIELDS_MISMATCH",
                "DIRECT_SALE_RETURN_ORIGINAL_INVOICE_LINK_INVALID",
                "DIRECT_SALE_RETURN_CUSTOMER_LINK_MISMATCH",
                "DIRECT_SALE_RETURN_CREDIT_NOTE_MISSING",
                "DIRECT_SALE_RETURN_CREDIT_NOTE_JOURNAL_MISSING",
                "DIRECT_SALE_RETURN_CREDIT_NOTE_SOURCE_LINK_INVALID",
                "DIRECT_SALE_RETURN_CREDIT_NOTE_JOURNAL_SOURCE_LINK_INVALID",
                "CREDIT_NOTE_AMOUNT_FIELDS_MISMATCH",
                "CREDIT_NOTE_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
                "CUSTOMER_REFUND_DIRECT_SALE_RETURN_LINK_INVALID",
                "CUSTOMER_REFUND_PAID_JOURNAL_MISSING",
                "CUSTOMER_REFUND_JOURNAL_SOURCE_LINK_INVALID",
                "CUSTOMER_REFUND_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
                "STOCK_LEDGER_REFERENCE_FORMAT_INVALID",
                "DIRECT_SALE_RETURN_STOCK_RESTORATION_MISSING",
                "DIRECT_SALE_RETURN_STOCK_QUANTITY_MISMATCH",
                "BILLING_INVOICE_STOCK_DEDUCTION_MISSING",
                "PRODUCTION_JOB_FINISHED_GOOD_RECEIPT_STOCK_MISSING",
                "PRODUCTION_JOB_FINISHED_GOOD_RECEIPT_STOCK_QUANTITY_MISMATCH",
                "PRODUCTION_JOB_RAW_MATERIAL_STOCK_MOVEMENT_MISSING",
                "PRODUCTION_JOB_RAW_MATERIAL_STOCK_QUANTITY_MISMATCH",
                "INVENTORY_NEGATIVE_STOCK",
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
        totals = run_direct_sale_billing_checks(run=run, totals=totals)
        totals = run_return_cancellation_checks(run=run, totals=totals)
        totals = run_inventory_stock_checks(run=run, totals=totals)

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
