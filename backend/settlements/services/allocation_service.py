from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional, Tuple

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from settlements.models import (
    MONEY_ZERO,
    BankStatementLine,
    CashierDayClose,
    LineMatchedStatus,
    SettlementAllocation,
    SettlementAllocationSourceType,
    SettlementAllocationStatus,
    UpiSettlementLine,
)


@dataclass(frozen=True)
class ResolvedSettlementSource:
    source_type: str
    source_id: str
    finance_account_id: int
    source_amount: Decimal
    source_object: object


def _decimal_or_zero(value: Optional[Decimal]) -> Decimal:
    return value if value is not None else MONEY_ZERO


def _bank_line_source_amount(line: BankStatementLine) -> Decimal:
    """
    Phase L2 decision (documented):
    - BankStatementLine is evidence only; we treat the allocatable amount as the absolute amount on the line.
    - If credit > 0, allocatable amount = credit
    - Else if debit > 0, allocatable amount = debit
    - Else 0
    This supports manual linking for either direction without inferring semantics beyond the line's amounts.
    """
    credit = _decimal_or_zero(line.credit)
    debit = _decimal_or_zero(line.debit)
    if credit > MONEY_ZERO:
        return credit
    if debit > MONEY_ZERO:
        return debit
    return MONEY_ZERO


def _recompute_line_matched_status(source: ResolvedSettlementSource) -> None:
    if source.source_type == SettlementAllocationSourceType.BANK_STATEMENT_LINE:
        line: BankStatementLine = source.source_object  # type: ignore[assignment]
    elif source.source_type == SettlementAllocationSourceType.UPI_SETTLEMENT_LINE:
        line = source.source_object  # type: ignore[assignment]
    else:
        return

    allocated = get_allocated_amount(source.source_type, source.source_id)
    if allocated <= MONEY_ZERO:
        new_status = LineMatchedStatus.UNMATCHED
    elif allocated >= source.source_amount:
        new_status = LineMatchedStatus.MATCHED
    else:
        new_status = LineMatchedStatus.PARTIAL

    if getattr(line, "matched_status", None) != new_status:
        line.matched_status = new_status
        line.save(update_fields=["matched_status", "updated_at"])


def resolve_source(source_type: str, source_id: str) -> ResolvedSettlementSource:
    source_type = (source_type or "").strip().upper()
    source_id = (str(source_id) or "").strip()
    if not source_type:
        raise ValidationError({"source_type": "source_type is required."})
    if not source_id:
        raise ValidationError({"source_id": "source_id is required."})

    if source_type == SettlementAllocationSourceType.BANK_STATEMENT_LINE:
        try:
            line = BankStatementLine.objects.select_related("statement_import", "statement_import__bank_finance_account").get(
                pk=int(source_id)
            )
        except (ValueError, BankStatementLine.DoesNotExist):
            raise ValidationError({"source_id": "Invalid bank statement line id."})
        finance_account_id = line.statement_import.bank_finance_account_id
        amount = _bank_line_source_amount(line)
        return ResolvedSettlementSource(
            source_type=source_type,
            source_id=str(line.id),
            finance_account_id=finance_account_id,
            source_amount=amount,
            source_object=line,
        )

    if source_type == SettlementAllocationSourceType.UPI_SETTLEMENT_LINE:
        try:
            line = UpiSettlementLine.objects.select_related("settlement_import", "settlement_import__upi_finance_account").get(
                pk=int(source_id)
            )
        except (ValueError, UpiSettlementLine.DoesNotExist):
            raise ValidationError({"source_id": "Invalid UPI settlement line id."})
        finance_account_id = line.settlement_import.upi_finance_account_id
        amount = _decimal_or_zero(line.net_amount)
        return ResolvedSettlementSource(
            source_type=source_type,
            source_id=str(line.id),
            finance_account_id=finance_account_id,
            source_amount=amount,
            source_object=line,
        )

    if source_type == SettlementAllocationSourceType.CASHIER_DAY_CLOSE:
        try:
            close = CashierDayClose.objects.select_related("finance_account").get(pk=int(source_id))
        except (ValueError, CashierDayClose.DoesNotExist):
            raise ValidationError({"source_id": "Invalid cashier day close id."})
        if not close.finance_account_id:
            raise ValidationError({"source_id": "Cashier day close has no finance_account; allocation is not supported for this record."})
        amount = _decimal_or_zero(close.counted_cash)
        return ResolvedSettlementSource(
            source_type=source_type,
            source_id=str(close.id),
            finance_account_id=close.finance_account_id,
            source_amount=amount,
            source_object=close,
        )

    raise ValidationError({"source_type": "Invalid source_type."})


def get_allocated_amount(source_type: str, source_id: str) -> Decimal:
    total = (
        SettlementAllocation.objects.filter(source_type=source_type, source_id=str(source_id))
        .exclude(status__in=[SettlementAllocationStatus.VOIDED, SettlementAllocationStatus.REJECTED])
        .aggregate(total=Sum("matched_amount"))
        .get("total")
    )
    return _decimal_or_zero(total)


def get_available_amount(source: ResolvedSettlementSource) -> Decimal:
    allocated = get_allocated_amount(source.source_type, source.source_id)
    remaining = source.source_amount - allocated
    return remaining if remaining > MONEY_ZERO else MONEY_ZERO


def _target_fingerprint(
    payment_id: Optional[int],
    receipt_id: Optional[int],
    money_movement_id: Optional[int],
) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    return payment_id, receipt_id, money_movement_id


@transaction.atomic
def create_manual_allocation(
    *,
    actor,
    source_type: str,
    source_id: str,
    finance_account_id: int,
    matched_amount: Decimal,
    payment_id: Optional[int] = None,
    receipt_id: Optional[int] = None,
    money_movement_id: Optional[int] = None,
    note: str = "",
) -> SettlementAllocation:
    source = resolve_source(source_type, source_id)

    if int(finance_account_id) != int(source.finance_account_id):
        raise ValidationError({"finance_account": "finance_account must match the settlement source's deterministic finance account."})

    if not (payment_id or receipt_id or money_movement_id):
        raise ValidationError({"payment": "At least one target (payment, receipt, money_movement) is required."})

    if matched_amount is None:
        raise ValidationError({"matched_amount": "matched_amount is required."})
    if matched_amount <= MONEY_ZERO:
        raise ValidationError({"matched_amount": "matched_amount must be greater than zero."})

    available = get_available_amount(source)
    if matched_amount > available:
        raise ValidationError({"matched_amount": f"matched_amount exceeds available source amount ({available})."})

    payment_id = int(payment_id) if payment_id else None
    receipt_id = int(receipt_id) if receipt_id else None
    money_movement_id = int(money_movement_id) if money_movement_id else None

    dup = SettlementAllocation.objects.filter(
        source_type=source.source_type,
        source_id=source.source_id,
        finance_account_id=finance_account_id,
        matched_amount=matched_amount,
        payment_id=payment_id,
        receipt_id=receipt_id,
        money_movement_id=money_movement_id,
    ).exclude(status__in=[SettlementAllocationStatus.VOIDED, SettlementAllocationStatus.REJECTED])
    if dup.exists():
        raise ValidationError("Duplicate exact active allocation for the same source/target/amount is not allowed.")

    allocation = SettlementAllocation.objects.create(
        source_type=source.source_type,
        source_id=source.source_id,
        finance_account_id=finance_account_id,
        matched_amount=matched_amount,
        payment_id=payment_id,
        receipt_id=receipt_id,
        money_movement_id=money_movement_id,
        status=SettlementAllocationStatus.MATCHED,
        matched_by=actor,
        matched_at=timezone.now(),
        metadata={"note": (note or "").strip()} if (note or "").strip() else {},
    )

    _recompute_line_matched_status(source)
    return allocation


@transaction.atomic
def void_allocation(*, actor, allocation: SettlementAllocation, reason: str = "") -> SettlementAllocation:
    if allocation.status == SettlementAllocationStatus.VOIDED:
        return allocation

    allocation.status = SettlementAllocationStatus.VOIDED
    allocation.metadata = allocation.metadata or {}
    allocation.metadata["voided_at"] = timezone.now().isoformat()
    allocation.metadata["voided_by_id"] = getattr(actor, "id", None)
    if (reason or "").strip():
        allocation.metadata["void_reason"] = (reason or "").strip()
    allocation.save(update_fields=["status", "metadata", "updated_at"])

    # Resolve only to recompute matched_status when supported.
    try:
        resolved = resolve_source(allocation.source_type, allocation.source_id)
        _recompute_line_matched_status(resolved)
    except ValidationError:
        # If source row was removed (should not happen with PROTECT/foreign constraints, but keep safe),
        # we still void the allocation without failing.
        pass

    return allocation
