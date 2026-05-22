from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.db.models import Count, Q, Sum

from reconciliation.models import (
    ReconciliationEvidence,
    ReconciliationItem,
    ReconciliationItemStatus,
    ReconciliationSeverity,
)
from settlements.models import (
    MONEY_ZERO,
    BankStatementLine,
    CashierDayClose,
    CashierDayCloseStatus,
    ImportStatus,
    LineMatchedStatus,
    SettlementAllocation,
    SettlementAllocationSourceType,
    SettlementAllocationStatus,
    UpiSettlementLine,
)

MODULE = "settlement"


def _decimal_or_zero(value) -> Decimal:
    return value if value is not None else MONEY_ZERO


def _bank_line_source_amount(line: BankStatementLine) -> Decimal:
    credit = _decimal_or_zero(line.credit)
    debit = _decimal_or_zero(line.debit)
    if credit > MONEY_ZERO:
        return credit
    if debit > MONEY_ZERO:
        return debit
    return MONEY_ZERO


@dataclass(frozen=True)
class _AllocationAgg:
    allocation_count: int
    allocated_amount: Decimal


def _allocations_agg_for_source(*, source_type: str, source_ids: list[str]) -> dict[str, _AllocationAgg]:
    if not source_ids:
        return {}
    rows = (
        SettlementAllocation.objects.filter(source_type=source_type, source_id__in=source_ids)
        .exclude(status__in=[SettlementAllocationStatus.VOIDED, SettlementAllocationStatus.REJECTED])
        .values("source_id")
        .annotate(
            allocation_count=Count("id"),
            allocated_amount=Sum("matched_amount"),
        )
    )
    out: dict[str, _AllocationAgg] = {}
    for row in rows:
        source_id = str(row["source_id"])
        out[source_id] = _AllocationAgg(
            allocation_count=int(row["allocation_count"] or 0),
            allocated_amount=_decimal_or_zero(row["allocated_amount"]),
        )
    return out


def run_settlement_allocation_checks(*, run, totals: dict) -> dict:
    """
    Settlement allocation-backed reconciliation (deterministic only).

    Guarantees:
    - detection only; no auto-correction
    - no inferred matching
    - does not create/void allocations
    - does not mutate any settlement source records or financial source records
    """
    date_from = run.date_from
    date_to = run.date_to
    branch_id = run.branch_id

    active_import_statuses = [ImportStatus.PARSED, ImportStatus.PARTIALLY_MATCHED, ImportStatus.MATCHED]

    # A/B/C/F for BankStatementLine
    bank_lines = BankStatementLine.objects.select_related("statement_import", "statement_import__bank_finance_account").filter(
        statement_import__status__in=active_import_statuses,
    )
    if date_from:
        bank_lines = bank_lines.filter(transaction_date__gte=date_from)
    if date_to:
        bank_lines = bank_lines.filter(transaction_date__lte=date_to)
    if branch_id:
        bank_lines = bank_lines.filter(statement_import__bank_finance_account__branch_id=branch_id)

    bank_line_ids = [str(row["id"]) for row in bank_lines.values("id")]
    bank_allocs = _allocations_agg_for_source(source_type=SettlementAllocationSourceType.BANK_STATEMENT_LINE, source_ids=bank_line_ids)

    for line in bank_lines:
        totals["checked"] += 1
        if line.matched_status == LineMatchedStatus.IGNORED:
            continue

        source_amount = _bank_line_source_amount(line)
        alloc = bank_allocs.get(str(line.id), _AllocationAgg(allocation_count=0, allocated_amount=MONEY_ZERO))

        # A) Bank line unallocated (explicit evidence: no active allocations and matched_status UNMATCHED)
        if line.matched_status == LineMatchedStatus.UNMATCHED and alloc.allocation_count == 0:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="BankStatementLine",
                source_id=str(line.id),
                source_label=f"{line.statement_import.import_no} / BankLine#{line.id}",
                severity=ReconciliationSeverity.MEDIUM,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="BANK_STATEMENT_LINE_UNALLOCATED",
                exception_message="Bank statement line is active but has no non-VOIDED/non-REJECTED SettlementAllocation evidence.",
                recommended_action="Review imported bank lines and create manual SettlementAllocation if this line should be linked; otherwise mark IGNORED via the settlement workflow.",
                metadata={
                    "import_id": line.statement_import_id,
                    "import_no": line.statement_import.import_no,
                    "import_status": line.statement_import.status,
                    "transaction_date": str(line.transaction_date),
                    "matched_status": line.matched_status,
                    "source_amount": str(source_amount),
                    "allocated_amount": str(alloc.allocated_amount),
                    "allocation_count": alloc.allocation_count,
                    "finance_account_id": line.statement_import.bank_finance_account_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BankStatementLine",
                object_id=str(line.id),
                label=f"BankLine#{line.id}",
                amount=source_amount,
                status=line.matched_status,
                metadata={"statement_import_id": line.statement_import_id, "reference_no": line.reference_no},
            )
            totals["exceptions"] += 1
            continue

        # F) Match status mismatch (derived matched_status suggests allocated but evidence is absent)
        if line.matched_status in {LineMatchedStatus.MATCHED, LineMatchedStatus.PARTIAL} and alloc.allocation_count == 0:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="BankStatementLine",
                source_id=str(line.id),
                source_label=f"{line.statement_import.import_no} / BankLine#{line.id}",
                severity=ReconciliationSeverity.MEDIUM,
                status=ReconciliationItemStatus.STATUS_MISMATCH,
                exception_code="BANK_STATEMENT_LINE_MATCH_STATUS_MISMATCH",
                exception_message="Bank statement line matched_status indicates MATCHED/PARTIAL but there are no active allocations (all allocations may be VOIDED/REJECTED).",
                recommended_action="Review allocations for this line; if all allocations are VOIDED/REJECTED, investigate why matched_status is not UNMATCHED and correct via the existing settlement allocation workflows (no direct mutation here).",
                metadata={
                    "import_id": line.statement_import_id,
                    "import_no": line.statement_import.import_no,
                    "matched_status": line.matched_status,
                    "source_amount": str(source_amount),
                    "allocated_amount": str(alloc.allocated_amount),
                    "allocation_count": alloc.allocation_count,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BankStatementLine",
                object_id=str(line.id),
                label=f"BankLine#{line.id}",
                amount=source_amount,
                status=line.matched_status,
                metadata={"statement_import_id": line.statement_import_id},
            )
            totals["exceptions"] += 1
            continue

        # B) Partial allocation
        if alloc.allocation_count > 0 and alloc.allocated_amount < source_amount:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="BankStatementLine",
                source_id=str(line.id),
                source_label=f"{line.statement_import.import_no} / BankLine#{line.id}",
                severity=ReconciliationSeverity.MEDIUM,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="BANK_STATEMENT_LINE_PARTIALLY_ALLOCATED",
                exception_message="Bank statement line has allocations but allocated total is less than the source line amount.",
                recommended_action="Review this line and add additional SettlementAllocation evidence if the remaining amount should be linked; otherwise mark remaining as intentionally unmatched per operational policy.",
                expected_amount=source_amount,
                actual_amount=alloc.allocated_amount,
                amount_delta=(alloc.allocated_amount - source_amount),
                metadata={
                    "import_id": line.statement_import_id,
                    "import_no": line.statement_import.import_no,
                    "source_amount": str(source_amount),
                    "allocated_amount": str(alloc.allocated_amount),
                    "allocation_count": alloc.allocation_count,
                    "finance_account_id": line.statement_import.bank_finance_account_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BankStatementLine",
                object_id=str(line.id),
                label=f"BankLine#{line.id}",
                amount=source_amount,
                status=line.matched_status,
                metadata={"statement_import_id": line.statement_import_id},
            )
            totals["exceptions"] += 1
            continue

        # C) Over-allocation
        if alloc.allocation_count > 0 and alloc.allocated_amount > source_amount:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="BankStatementLine",
                source_id=str(line.id),
                source_label=f"{line.statement_import.import_no} / BankLine#{line.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.AMOUNT_MISMATCH,
                exception_code="BANK_STATEMENT_LINE_OVER_ALLOCATED",
                exception_message="Bank statement line allocated total exceeds the source line amount.",
                recommended_action="Review allocations for this line and void/reject incorrect allocations via the allocation workflow (no auto-correction).",
                expected_amount=source_amount,
                actual_amount=alloc.allocated_amount,
                amount_delta=(alloc.allocated_amount - source_amount),
                metadata={
                    "import_id": line.statement_import_id,
                    "import_no": line.statement_import.import_no,
                    "source_amount": str(source_amount),
                    "allocated_amount": str(alloc.allocated_amount),
                    "allocation_count": alloc.allocation_count,
                    "finance_account_id": line.statement_import.bank_finance_account_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="BankStatementLine",
                object_id=str(line.id),
                label=f"BankLine#{line.id}",
                amount=source_amount,
                status=line.matched_status,
                metadata={"statement_import_id": line.statement_import_id},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    # A/B/C/F for UpiSettlementLine
    upi_lines = UpiSettlementLine.objects.select_related("settlement_import", "settlement_import__upi_finance_account").filter(
        settlement_import__status__in=active_import_statuses,
    )
    if date_from:
        upi_lines = upi_lines.filter(settlement_date__gte=date_from)
    if date_to:
        upi_lines = upi_lines.filter(settlement_date__lte=date_to)
    if branch_id:
        upi_lines = upi_lines.filter(settlement_import__upi_finance_account__branch_id=branch_id)

    upi_line_ids = [str(row["id"]) for row in upi_lines.values("id")]
    upi_allocs = _allocations_agg_for_source(source_type=SettlementAllocationSourceType.UPI_SETTLEMENT_LINE, source_ids=upi_line_ids)

    for line in upi_lines:
        totals["checked"] += 1
        if line.matched_status == LineMatchedStatus.IGNORED:
            continue

        source_amount = _decimal_or_zero(line.net_amount)
        alloc = upi_allocs.get(str(line.id), _AllocationAgg(allocation_count=0, allocated_amount=MONEY_ZERO))

        if line.matched_status == LineMatchedStatus.UNMATCHED and alloc.allocation_count == 0:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="UpiSettlementLine",
                source_id=str(line.id),
                source_label=f"{line.settlement_import.import_no} / UpiLine#{line.id}",
                severity=ReconciliationSeverity.MEDIUM,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="UPI_SETTLEMENT_LINE_UNALLOCATED",
                exception_message="UPI settlement line is active but has no non-VOIDED/non-REJECTED SettlementAllocation evidence.",
                recommended_action="Review imported UPI settlement lines and create manual SettlementAllocation if this line should be linked; otherwise mark IGNORED via the settlement workflow.",
                metadata={
                    "import_id": line.settlement_import_id,
                    "import_no": line.settlement_import.import_no,
                    "import_status": line.settlement_import.status,
                    "settlement_date": str(line.settlement_date),
                    "matched_status": line.matched_status,
                    "source_amount": str(source_amount),
                    "allocated_amount": str(alloc.allocated_amount),
                    "allocation_count": alloc.allocation_count,
                    "finance_account_id": line.settlement_import.upi_finance_account_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="UpiSettlementLine",
                object_id=str(line.id),
                label=f"UpiLine#{line.id}",
                amount=source_amount,
                status=line.matched_status,
                metadata={"settlement_import_id": line.settlement_import_id, "transaction_ref": line.transaction_ref},
            )
            totals["exceptions"] += 1
            continue

        if line.matched_status in {LineMatchedStatus.MATCHED, LineMatchedStatus.PARTIAL} and alloc.allocation_count == 0:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="UpiSettlementLine",
                source_id=str(line.id),
                source_label=f"{line.settlement_import.import_no} / UpiLine#{line.id}",
                severity=ReconciliationSeverity.MEDIUM,
                status=ReconciliationItemStatus.STATUS_MISMATCH,
                exception_code="UPI_SETTLEMENT_LINE_MATCH_STATUS_MISMATCH",
                exception_message="UPI settlement line matched_status indicates MATCHED/PARTIAL but there are no active allocations (all allocations may be VOIDED/REJECTED).",
                recommended_action="Review allocations for this line; if all allocations are VOIDED/REJECTED, investigate why matched_status is not UNMATCHED and correct via the existing settlement allocation workflows (no direct mutation here).",
                metadata={
                    "import_id": line.settlement_import_id,
                    "import_no": line.settlement_import.import_no,
                    "matched_status": line.matched_status,
                    "source_amount": str(source_amount),
                    "allocated_amount": str(alloc.allocated_amount),
                    "allocation_count": alloc.allocation_count,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="UpiSettlementLine",
                object_id=str(line.id),
                label=f"UpiLine#{line.id}",
                amount=source_amount,
                status=line.matched_status,
                metadata={"settlement_import_id": line.settlement_import_id},
            )
            totals["exceptions"] += 1
            continue

        if alloc.allocation_count > 0 and alloc.allocated_amount < source_amount:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="UpiSettlementLine",
                source_id=str(line.id),
                source_label=f"{line.settlement_import.import_no} / UpiLine#{line.id}",
                severity=ReconciliationSeverity.MEDIUM,
                status=ReconciliationItemStatus.NEEDS_REVIEW,
                exception_code="UPI_SETTLEMENT_LINE_PARTIALLY_ALLOCATED",
                exception_message="UPI settlement line has allocations but allocated total is less than the source line amount.",
                recommended_action="Review this line and add additional SettlementAllocation evidence if the remaining amount should be linked; otherwise mark remaining as intentionally unmatched per operational policy.",
                expected_amount=source_amount,
                actual_amount=alloc.allocated_amount,
                amount_delta=(alloc.allocated_amount - source_amount),
                metadata={
                    "import_id": line.settlement_import_id,
                    "import_no": line.settlement_import.import_no,
                    "source_amount": str(source_amount),
                    "allocated_amount": str(alloc.allocated_amount),
                    "allocation_count": alloc.allocation_count,
                    "finance_account_id": line.settlement_import.upi_finance_account_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="UpiSettlementLine",
                object_id=str(line.id),
                label=f"UpiLine#{line.id}",
                amount=source_amount,
                status=line.matched_status,
                metadata={"settlement_import_id": line.settlement_import_id},
            )
            totals["exceptions"] += 1
            continue

        if alloc.allocation_count > 0 and alloc.allocated_amount > source_amount:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="UpiSettlementLine",
                source_id=str(line.id),
                source_label=f"{line.settlement_import.import_no} / UpiLine#{line.id}",
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.AMOUNT_MISMATCH,
                exception_code="UPI_SETTLEMENT_LINE_OVER_ALLOCATED",
                exception_message="UPI settlement line allocated total exceeds the source line amount.",
                recommended_action="Review allocations for this line and void/reject incorrect allocations via the allocation workflow (no auto-correction).",
                expected_amount=source_amount,
                actual_amount=alloc.allocated_amount,
                amount_delta=(alloc.allocated_amount - source_amount),
                metadata={
                    "import_id": line.settlement_import_id,
                    "import_no": line.settlement_import.import_no,
                    "source_amount": str(source_amount),
                    "allocated_amount": str(alloc.allocated_amount),
                    "allocation_count": alloc.allocation_count,
                    "finance_account_id": line.settlement_import.upi_finance_account_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="UpiSettlementLine",
                object_id=str(line.id),
                label=f"UpiLine#{line.id}",
                amount=source_amount,
                status=line.matched_status,
                metadata={"settlement_import_id": line.settlement_import_id},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    # C) Cashier day close over-allocation and G) variance unresolved
    cashier_closes = CashierDayClose.objects.all()
    if date_from:
        cashier_closes = cashier_closes.filter(business_date__gte=date_from)
    if date_to:
        cashier_closes = cashier_closes.filter(business_date__lte=date_to)
    if branch_id:
        cashier_closes = cashier_closes.filter(branch_id=branch_id)

    cashier_close_ids = [str(row["id"]) for row in cashier_closes.values("id")]
    cashier_allocs = _allocations_agg_for_source(
        source_type=SettlementAllocationSourceType.CASHIER_DAY_CLOSE,
        source_ids=cashier_close_ids,
    )

    for close in cashier_closes:
        totals["checked"] += 1
        source_amount = _decimal_or_zero(close.counted_cash)
        alloc = cashier_allocs.get(str(close.id), _AllocationAgg(allocation_count=0, allocated_amount=MONEY_ZERO))

        if alloc.allocation_count > 0 and alloc.allocated_amount > source_amount:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="CashierDayClose",
                source_id=str(close.id),
                source_label=close.close_no,
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.AMOUNT_MISMATCH,
                exception_code="CASHIER_DAY_CLOSE_OVER_ALLOCATED",
                exception_message="Cashier day close allocated total exceeds counted_cash.",
                recommended_action="Review allocations linked to this day close; void/reject incorrect allocations via the existing workflow (no auto-correction).",
                expected_amount=source_amount,
                actual_amount=alloc.allocated_amount,
                amount_delta=(alloc.allocated_amount - source_amount),
                metadata={
                    "business_date": str(close.business_date),
                    "status": close.status,
                    "source_amount": str(source_amount),
                    "allocated_amount": str(alloc.allocated_amount),
                    "allocation_count": alloc.allocation_count,
                    "finance_account_id": close.finance_account_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="CashierDayClose",
                object_id=str(close.id),
                label=close.close_no,
                amount=source_amount,
                status=close.status,
                metadata={"business_date": str(close.business_date), "variance": str(close.variance)},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

        if close.variance != MONEY_ZERO and close.status not in {
            CashierDayCloseStatus.APPROVED,
            CashierDayCloseStatus.REJECTED,
            CashierDayCloseStatus.VOIDED,
        }:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="CashierDayClose",
                source_id=str(close.id),
                source_label=close.close_no,
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.STATUS_MISMATCH,
                exception_code="CASHIER_DAY_CLOSE_VARIANCE_UNRESOLVED",
                exception_message="Cashier day close has non-zero variance but is not in an approved/rejected/voided status.",
                recommended_action="Ensure the day close is reviewed and marked APPROVED, REJECTED, or VOIDED via the cashier day-close workflow.",
                metadata={
                    "business_date": str(close.business_date),
                    "status": close.status,
                    "variance": str(close.variance),
                    "counted_cash": str(close.counted_cash),
                    "system_cash_total": str(close.system_cash_total),
                    "opening_cash": str(close.opening_cash),
                    "finance_account_id": close.finance_account_id,
                    "cash_counter_id": close.cash_counter_id,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="CashierDayClose",
                object_id=str(close.id),
                label=close.close_no,
                amount=source_amount,
                status=close.status,
                metadata={"business_date": str(close.business_date)},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    # D/E checks: per-allocation invariants (finance account mismatch, invalid targets)
    # Scope allocations to the same source populations considered above (date/branch filters apply to sources).
    source_bank_ids = {str(line.id) for line in bank_lines}
    source_upi_ids = {str(line.id) for line in upi_lines}
    source_cashier_ids = {str(close.id) for close in cashier_closes}

    allocations = SettlementAllocation.objects.select_related("finance_account", "payment", "receipt", "money_movement").exclude(
        status__in=[SettlementAllocationStatus.VOIDED, SettlementAllocationStatus.REJECTED]
    )
    allocations = allocations.filter(
        (
            (Q(source_type=SettlementAllocationSourceType.BANK_STATEMENT_LINE) & Q(source_id__in=source_bank_ids))
            | (Q(source_type=SettlementAllocationSourceType.UPI_SETTLEMENT_LINE) & Q(source_id__in=source_upi_ids))
            | (Q(source_type=SettlementAllocationSourceType.CASHIER_DAY_CLOSE) & Q(source_id__in=source_cashier_ids))
        )
    )

    bank_source_map: dict[str, int | None] = {
        str(line_id): int(account_id) if account_id is not None else None
        for line_id, account_id in BankStatementLine.objects.select_related("statement_import")
        .filter(id__in=[int(sid) for sid in source_bank_ids if sid.isdigit()])
        .values_list("id", "statement_import__bank_finance_account_id")
    }
    upi_source_map: dict[str, int | None] = {
        str(line_id): int(account_id) if account_id is not None else None
        for line_id, account_id in UpiSettlementLine.objects.select_related("settlement_import")
        .filter(id__in=[int(sid) for sid in source_upi_ids if sid.isdigit()])
        .values_list("id", "settlement_import__upi_finance_account_id")
    }
    cashier_source_map: dict[str, int | None] = {
        str(close_id): int(account_id) if account_id is not None else None
        for close_id, account_id in CashierDayClose.objects.filter(id__in=[int(sid) for sid in source_cashier_ids if sid.isdigit()]).values_list(
            "id", "finance_account_id"
        )
    }

    def _expected_finance_account_id(*, source_type: str, source_id: str) -> int | None:
        if source_type == SettlementAllocationSourceType.BANK_STATEMENT_LINE:
            return bank_source_map.get(str(source_id))
        if source_type == SettlementAllocationSourceType.UPI_SETTLEMENT_LINE:
            return upi_source_map.get(str(source_id))
        if source_type == SettlementAllocationSourceType.CASHIER_DAY_CLOSE:
            return cashier_source_map.get(str(source_id))
        return None

    for allocation in allocations:
        totals["checked"] += 1
        expected_account_id = _expected_finance_account_id(source_type=allocation.source_type, source_id=allocation.source_id)

        if expected_account_id is not None and int(allocation.finance_account_id) != int(expected_account_id):
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="SettlementAllocation",
                source_id=str(allocation.id),
                source_label=str(allocation),
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.WRONG_ACCOUNT,
                exception_code="SETTLEMENT_ALLOCATION_FINANCE_ACCOUNT_MISMATCH",
                exception_message="SettlementAllocation.finance_account does not match the deterministic finance account for its source record.",
                recommended_action="Void and recreate allocation with the correct finance account via the admin settlement allocation workflow (no source mutation).",
                metadata={
                    "allocation_id": allocation.id,
                    "source_type": allocation.source_type,
                    "source_id": allocation.source_id,
                    "allocation_finance_account_id": allocation.finance_account_id,
                    "expected_finance_account_id": expected_account_id,
                    "matched_amount": str(allocation.matched_amount),
                    "status": allocation.status,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="SettlementAllocation",
                object_id=str(allocation.id),
                label=str(allocation),
                amount=allocation.matched_amount,
                status=allocation.status,
                metadata={"finance_account_id": allocation.finance_account_id},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

        target_invalid = False
        if not (allocation.payment_id or allocation.receipt_id or allocation.money_movement_id):
            target_invalid = True
        if allocation.payment_id and allocation.payment is None:
            target_invalid = True
        if allocation.receipt_id and allocation.receipt is None:
            target_invalid = True
        if allocation.money_movement_id and allocation.money_movement is None:
            target_invalid = True

        if target_invalid:
            item = ReconciliationItem.objects.create(
                run=run,
                module=MODULE,
                source_type="SettlementAllocation",
                source_id=str(allocation.id),
                source_label=str(allocation),
                severity=ReconciliationSeverity.HIGH,
                status=ReconciliationItemStatus.MISSING_SOURCE,
                exception_code="SETTLEMENT_ALLOCATION_TARGET_INVALID",
                exception_message="SettlementAllocation has no valid target reference (payment/receipt/money_movement).",
                recommended_action="Void this allocation and recreate with a valid explicit target via the admin workflow.",
                metadata={
                    "allocation_id": allocation.id,
                    "source_type": allocation.source_type,
                    "source_id": allocation.source_id,
                    "finance_account_id": allocation.finance_account_id,
                    "matched_amount": str(allocation.matched_amount),
                    "status": allocation.status,
                },
            )
            ReconciliationEvidence.objects.create(
                item=item,
                evidence_type="SettlementAllocation",
                object_id=str(allocation.id),
                label=str(allocation),
                amount=allocation.matched_amount,
                status=allocation.status,
                metadata={},
            )
            totals["exceptions"] += 1
            totals["high_risk"] += 1

    return totals
