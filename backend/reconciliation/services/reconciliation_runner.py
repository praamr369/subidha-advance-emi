from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Callable

from django.db import transaction
from django.utils import timezone

from reconciliation.models import (
    ReconciliationRun,
    ReconciliationRunStatus,
)
from reconciliation.services.accounting_bridge_reconciliation import run_accounting_bridge_checks
from reconciliation.services.cash_bank_upi_reconciliation import run_cash_bank_upi_settlement_checks
from reconciliation.services.direct_sale_reconciliation import run_direct_sale_billing_checks
from reconciliation.services.emi_reconciliation import run_emi_checks
from reconciliation.services.inventory_stock_reconciliation import run_inventory_stock_checks
from reconciliation.services.return_cancellation_reconciliation import run_return_cancellation_checks
from reconciliation.services.settlement_allocation_reconciliation import run_settlement_allocation_checks
from reconciliation.services.run_numbering import next_reconciliation_run_no
from reconciliation.services.vendor_payable_reconciliation import run_vendor_payable_checks


@dataclass(frozen=True)
class PhaseFRunRequest:
    scope: str
    module: str
    date_from: date | None = None
    date_to: date | None = None
    branch_id: int | None = None
    financial_year: str | None = None
    accounting_period: str | None = None


CheckRunner = Callable[..., dict[str, int]]

PHASE_F_CHECK_REGISTRY: tuple[tuple[str, CheckRunner], ...] = (
    ("EMI", run_emi_checks),
    ("ACCOUNTING_BRIDGE", run_accounting_bridge_checks),
    ("DIRECT_SALE_BILLING", run_direct_sale_billing_checks),
    ("RETURN_CANCELLATION", run_return_cancellation_checks),
    ("INVENTORY_STOCK", run_inventory_stock_checks),
    ("VENDOR_PAYABLE", run_vendor_payable_checks),
    ("CASH_BANK_UPI_SETTLEMENT", run_cash_bank_upi_settlement_checks),
    ("SETTLEMENT_ALLOCATION", run_settlement_allocation_checks),
)


def _base_metadata(request: PhaseFRunRequest) -> dict:
    return {
        "phase": "K",
        "financial_year": request.financial_year,
        "accounting_period": request.accounting_period,
        "execution_mode": "chunked_synchronous",
        "chunk_count": len(PHASE_F_CHECK_REGISTRY),
        "completed_chunks": [],
        "failed_chunks": [],
        "read_only_contract": "Reconciliation checks must not create JournalEntry, DocumentSequence, source operational records, or posting bridge rows.",
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
            "PURCHASE_BILL_POSTED_JOURNAL_MISSING",
            "PURCHASE_BILL_JOURNAL_SOURCE_LINK_INVALID",
            "PURCHASE_BILL_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            "VENDOR_BILL_POSTED_JOURNAL_MISSING",
            "VENDOR_BILL_JOURNAL_SOURCE_LINK_INVALID",
            "VENDOR_BILL_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            "VENDOR_PAYMENT_POSTED_JOURNAL_MISSING",
            "VENDOR_PAYMENT_JOURNAL_SOURCE_LINK_INVALID",
            "VENDOR_PAYMENT_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            "PURCHASE_RETURN_POSTED_JOURNAL_MISSING",
            "PURCHASE_RETURN_JOURNAL_SOURCE_LINK_INVALID",
            "PURCHASE_RETURN_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            "PAYMENT_SETTLEMENT_BRIDGE_MISSING",
            "PAYMENT_SETTLEMENT_JOURNAL_SOURCE_LINK_INVALID",
            "PAYMENT_SETTLEMENT_DUPLICATE_JOURNAL_SOURCE_REFERENCE",
            "PAYMENT_SETTLEMENT_JOURNAL_AMOUNT_MISMATCH",
            "RECEIPT_SETTLEMENT_JOURNAL_AMOUNT_MISMATCH",
            "MONEY_MOVEMENT_POSTED_JOURNAL_MISSING",
            "MONEY_MOVEMENT_JOURNAL_SOURCE_LINK_INVALID",
            "MONEY_MOVEMENT_JOURNAL_AMOUNT_MISMATCH",
            "MONEY_MOVEMENT_JOURNAL_GROUP_UNBALANCED",
            "BANK_STATEMENT_LINE_UNALLOCATED",
            "UPI_SETTLEMENT_LINE_UNALLOCATED",
            "BANK_STATEMENT_LINE_PARTIALLY_ALLOCATED",
            "UPI_SETTLEMENT_LINE_PARTIALLY_ALLOCATED",
            "BANK_STATEMENT_LINE_OVER_ALLOCATED",
            "UPI_SETTLEMENT_LINE_OVER_ALLOCATED",
            "CASHIER_DAY_CLOSE_OVER_ALLOCATED",
            "SETTLEMENT_ALLOCATION_FINANCE_ACCOUNT_MISMATCH",
            "SETTLEMENT_ALLOCATION_TARGET_INVALID",
            "BANK_STATEMENT_LINE_MATCH_STATUS_MISMATCH",
            "UPI_SETTLEMENT_LINE_MATCH_STATUS_MISMATCH",
            "CASHIER_DAY_CLOSE_VARIANCE_UNRESOLVED",
        ],
    }


def _create_phase_f_run(*, request: PhaseFRunRequest, started_by) -> ReconciliationRun:
    return ReconciliationRun.objects.create(
        run_no=next_reconciliation_run_no(),
        scope=request.scope,
        module=request.module,
        branch_id=request.branch_id,
        date_from=request.date_from,
        date_to=request.date_to,
        status=ReconciliationRunStatus.RUNNING,
        started_by=started_by,
        started_at=timezone.now(),
        metadata=_base_metadata(request),
    )


def _persist_progress(run: ReconciliationRun, *, totals: dict[str, int], chunk_key: str, chunk_status: str, error: str | None = None) -> None:
    metadata = dict(run.metadata or {})
    completed_chunks = list(metadata.get("completed_chunks") or [])
    failed_chunks = list(metadata.get("failed_chunks") or [])
    if chunk_status == "completed" and chunk_key not in completed_chunks:
        completed_chunks.append(chunk_key)
    if chunk_status == "failed":
        failed_chunks.append({"chunk": chunk_key, "error": error or "Unknown reconciliation check failure."})
    metadata.update(
        {
            "completed_chunks": completed_chunks,
            "failed_chunks": failed_chunks,
            "last_chunk": chunk_key,
            "last_chunk_status": chunk_status,
            "progress": {
                "checked": totals["checked"],
                "matched": totals["matched"],
                "exceptions": totals["exceptions"],
                "high_risk": totals["high_risk"],
                "completed_chunks": len(completed_chunks),
                "total_chunks": len(PHASE_F_CHECK_REGISTRY),
            },
        }
    )
    run.total_checked = totals["checked"]
    run.total_matched = totals["matched"]
    run.total_exceptions = totals["exceptions"]
    run.high_risk_count = totals["high_risk"]
    run.metadata = metadata
    run.save(update_fields=["total_checked", "total_matched", "total_exceptions", "high_risk_count", "metadata"])


def _run_check_chunk(*, run: ReconciliationRun, totals: dict[str, int], chunk_key: str, runner: CheckRunner) -> dict[str, int]:
    try:
        with transaction.atomic():
            updated_totals = runner(run=run, totals=totals)
    except Exception as exc:
        _persist_progress(run, totals=totals, chunk_key=chunk_key, chunk_status="failed", error=str(exc))
        raise
    _persist_progress(run, totals=updated_totals, chunk_key=chunk_key, chunk_status="completed")
    return updated_totals


def start_and_run_phase_f(*, request: PhaseFRunRequest, started_by) -> ReconciliationRun:
    """
    Start a Phase-F/K reconciliation run and execute each source-family check in
    its own transaction. This keeps the API synchronous for backward
    compatibility, but avoids one long transaction around every reconciliation
    module.
    """
    with transaction.atomic():
        run = _create_phase_f_run(request=request, started_by=started_by)

    totals = {"checked": 0, "matched": 0, "exceptions": 0, "high_risk": 0}
    try:
        for chunk_key, runner in PHASE_F_CHECK_REGISTRY:
            totals = _run_check_chunk(run=run, totals=totals, chunk_key=chunk_key, runner=runner)

        run.total_checked = totals["checked"]
        run.total_matched = totals["matched"]
        run.total_exceptions = totals["exceptions"]
        run.high_risk_count = totals["high_risk"]
        run.status = ReconciliationRunStatus.COMPLETED
        run.finished_at = timezone.now()
        run.metadata = {
            **(run.metadata or {}),
            "finished_at": run.finished_at.isoformat(),
            "last_chunk_status": "completed",
        }
        run.save(update_fields=["total_checked", "total_matched", "total_exceptions", "high_risk_count", "status", "finished_at", "metadata"])
    except Exception as exc:
        run.status = ReconciliationRunStatus.FAILED
        run.finished_at = timezone.now()
        run.metadata = {**(run.metadata or {}), "error": str(exc), "finished_at": run.finished_at.isoformat()}
        run.save(update_fields=["status", "finished_at", "metadata"])
        raise

    return run
