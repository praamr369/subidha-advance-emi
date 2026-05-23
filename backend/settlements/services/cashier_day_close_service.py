"""
Cashier Day Close Service

Responsibilities:
- Create and manage cashier day-close records (evidence capture only)
- Handle day-close lifecycle: DRAFT → SUBMITTED → APPROVED/REJECTED/VOIDED
- Calculate variance (counted_cash - system_cash_total)
- Record submission, approval, and rejection with actor/timestamp
- Preserve variance as evidence only; never mutate source records
- Never create accounting entries or SettlementAllocations
- Never close reconciliation items

Non-goals:
- Auto-posting accounting
- Auto-creating SettlementAllocation
- Auto-closing reconciliation items
- Mutating Payment, ReceiptDocument, MoneyMovement, JournalEntry, FinanceAccount, CashCounter
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from django.core.exceptions import ValidationError
from django.db.models import Sum
from django.utils import timezone

from reconciliation.services.financial_source_lifecycle_event_service import (
    is_payment_valid_for_cash_evidence,
)
from settlements.models import (
    MONEY_ZERO,
    CashierDayClose,
    CashierDayCloseStatus,
)

from subscriptions.models import Payment, PaymentMethod


def compute_system_cash_total(
    *,
    cashier_id: int,
    business_date: str,
    branch_id: Optional[int] = None,
    cash_counter_id: Optional[int] = None,
    finance_account_id: Optional[int] = None,
) -> Decimal:
    """
    Compute "system cash total" for evidence capture.

    Current definition (intentionally conservative): sum of CASH `Payment.amount`
    collected by the cashier on the business date, optionally filtered by
    branch/cash counter/finance account when provided.

    Notes:
    - Evidence-only: read-only aggregation, no mutation.
    - Snapshot: value is stored on CashierDayClose at creation time.
    """
    qs = Payment.objects.filter(
        collected_by_id=cashier_id,
        payment_date=business_date,
        method=PaymentMethod.CASH,
    )

    if branch_id is not None:
        qs = qs.filter(branch_id=branch_id)
    if cash_counter_id is not None:
        qs = qs.filter(cash_counter_id=cash_counter_id)
    if finance_account_id is not None:
        qs = qs.filter(finance_account_id=finance_account_id)

    # Evidence-only validity gate:
    # - preserves existing OperationalCancellation(SourceType.EMI_PAYMENT) compatibility
    # - also excludes explicit FinancialSourceLifecycleEvent invalidations
    # - never creates lifecycle events or mutates source records from the read path
    valid_payment_ids = [
        payment.id
        for payment in qs.only("id")
        if is_payment_valid_for_cash_evidence(payment)
    ]
    if not valid_payment_ids:
        return MONEY_ZERO

    total = qs.filter(id__in=valid_payment_ids).aggregate(total_amount=Sum("amount"))
    value = total.get("total_amount")
    return value if value is not None else MONEY_ZERO


@dataclass(frozen=True)
class CashierDayCloseCreatePayload:
    """Payload for creating a new day-close draft."""
    cashier_id: int
    business_date: str  # YYYY-MM-DD
    counted_cash: Decimal
    system_cash_total: Decimal
    branch_id: Optional[int] = None
    cash_counter_id: Optional[int] = None
    finance_account_id: Optional[int] = None
    opening_cash: Decimal = MONEY_ZERO
    notes: str = ""


@dataclass(frozen=True)
class CashierDayCloseSubmitPayload:
    """Payload for submitting a day-close."""
    user_id: int


@dataclass(frozen=True)
class CashierDayCloseApprovalPayload:
    """Payload for approving a day-close."""
    user_id: int
    notes: Optional[str] = None


@dataclass(frozen=True)
class CashierDayCloseRejectionPayload:
    """Payload for rejecting a day-close."""
    user_id: int
    notes: str


def create_cashier_day_close_draft(payload: CashierDayCloseCreatePayload) -> CashierDayClose:
    """
    Create a new cashier day-close record in DRAFT status.

    Evidence capture only:
    - Accepts cashier-entered counted_cash
    - Calculates variance deterministically: variance = counted_cash - system_cash_total
    - Stores as evidence; does not trigger accounting or allocation creation
    - Does not mutate source records

    Validation:
    - counted_cash >= 0
    - system_cash_total >= 0
    - business_date required
    - Duplicate active day-close for same cashier/counter/date should be blocked

    Args:
        payload: CashierDayCloseCreatePayload

    Returns:
        CashierDayClose in DRAFT status

    Raises:
        ValidationError: on invalid input or duplicate active day-close
    """
    errors = {}

    # Validate amounts
    if payload.counted_cash < MONEY_ZERO:
        errors["counted_cash"] = "Counted cash cannot be negative."
    if payload.system_cash_total < MONEY_ZERO:
        errors["system_cash_total"] = "System cash total cannot be negative."

    if errors:
        raise ValidationError(errors)

    # Check for duplicate active day-close (same cashier/date, optionally scoped to cash_counter)
    # Note: This assumes single-shift model. Multi-shift models would need shift_id in query.
    duplicate_query = CashierDayClose.objects.filter(
        cashier_id=payload.cashier_id,
        business_date=payload.business_date,
        status__in=[CashierDayCloseStatus.DRAFT, CashierDayCloseStatus.SUBMITTED],
    )
    if payload.cash_counter_id is not None:
        duplicate_query = duplicate_query.filter(cash_counter_id=payload.cash_counter_id)
    if duplicate_query.exists():
        raise ValidationError(
            {
                "cashier": "An active day-close already exists for this cashier/date. "
                "Complete, approve, or reject the existing record first."
            }
        )

    # Calculate variance
    variance = payload.counted_cash - payload.system_cash_total

    # Create the day-close record
    day_close = CashierDayClose(
        cashier_id=payload.cashier_id,
        branch_id=payload.branch_id,
        cash_counter_id=payload.cash_counter_id,
        finance_account_id=payload.finance_account_id,
        business_date=payload.business_date,
        opening_cash=payload.opening_cash,
        system_cash_total=payload.system_cash_total,
        counted_cash=payload.counted_cash,
        variance=variance,
        status=CashierDayCloseStatus.DRAFT,
        notes=payload.notes,
    )
    day_close.full_clean()
    day_close.save()

    return day_close


def submit_cashier_day_close(day_close: CashierDayClose, payload: CashierDayCloseSubmitPayload) -> CashierDayClose:
    """
    Submit a DRAFT day-close to SUBMITTED status.

    Only a cashier can submit their own draft.
    Submitting freezes the record for admin review.
    Does not trigger accounting or allocation creation.

    Args:
        day_close: CashierDayClose instance in DRAFT status
        payload: CashierDayCloseSubmitPayload with submitter user_id

    Returns:
        CashierDayClose in SUBMITTED status

    Raises:
        ValidationError: if not DRAFT or already submitted/approved
    """
    errors = {}

    if day_close.status != CashierDayCloseStatus.DRAFT:
        errors["status"] = f"Can only submit DRAFT day-closes. Current status: {day_close.status}"

    if errors:
        raise ValidationError(errors)

    day_close.status = CashierDayCloseStatus.SUBMITTED
    day_close.closed_by_id = payload.user_id
    day_close.closed_at = timezone.now()
    day_close.full_clean()
    day_close.save(update_fields=["status", "closed_by_id", "closed_at", "updated_at"])

    return day_close


def approve_cashier_day_close(day_close: CashierDayClose, payload: CashierDayCloseApprovalPayload) -> CashierDayClose:
    """
    Admin approval of a SUBMITTED day-close.

    Approval:
    - Changes status to APPROVED
    - Records approver and timestamp
    - Does not post accounting
    - Does not create SettlementAllocation
    - Does not close reconciliation items
    - Does not mutate source records
    - Preserves variance as evidence only

    Args:
        day_close: CashierDayClose instance in SUBMITTED status
        payload: CashierDayCloseApprovalPayload with approver user_id

    Returns:
        CashierDayClose in APPROVED status

    Raises:
        ValidationError: if not SUBMITTED
    """
    errors = {}

    if day_close.status != CashierDayCloseStatus.SUBMITTED:
        errors["status"] = f"Can only approve SUBMITTED day-closes. Current status: {day_close.status}"

    if errors:
        raise ValidationError(errors)

    day_close.status = CashierDayCloseStatus.APPROVED
    day_close.approved_by_id = payload.user_id
    day_close.approved_at = timezone.now()
    if payload.notes:
        day_close.notes = payload.notes
    day_close.full_clean()
    day_close.save(update_fields=["status", "approved_by_id", "approved_at", "notes", "updated_at"])

    return day_close


def reject_cashier_day_close(day_close: CashierDayClose, payload: CashierDayCloseRejectionPayload) -> CashierDayClose:
    """
    Admin rejection of a SUBMITTED day-close.

    Rejection:
    - Changes status to REJECTED
    - Records rejector, timestamp, and rejection notes
    - Does not mutate source records
    - Preserved for audit trail

    Args:
        day_close: CashierDayClose instance in SUBMITTED status
        payload: CashierDayCloseRejectionPayload with rejector user_id and rejection notes

    Returns:
        CashierDayClose in REJECTED status

    Raises:
        ValidationError: if not SUBMITTED or no rejection notes
    """
    errors = {}

    if day_close.status != CashierDayCloseStatus.SUBMITTED:
        errors["status"] = f"Can only reject SUBMITTED day-closes. Current status: {day_close.status}"
    if not payload.notes or not payload.notes.strip():
        errors["notes"] = "Rejection notes are required."

    if errors:
        raise ValidationError(errors)

    day_close.status = CashierDayCloseStatus.REJECTED
    day_close.approved_by_id = payload.user_id  # Reuse approved_by for rejection actor
    day_close.approved_at = timezone.now()  # Reuse approved_at for rejection timestamp
    day_close.notes = payload.notes.strip()
    day_close.full_clean()
    day_close.save(update_fields=["status", "approved_by_id", "approved_at", "notes", "updated_at"])

    return day_close


def void_cashier_day_close(day_close: CashierDayClose, user_id: int, notes: str = "") -> CashierDayClose:
    """
    Admin void of a day-close (for data correction or cancellation).

    Void:
    - Changes status to VOIDED
    - Records voider and timestamp
    - Preserved for audit trail
    - Never deleted

    Args:
        day_close: CashierDayClose instance
        user_id: Admin user ID performing void
        notes: Optional notes about why voided

    Returns:
        CashierDayClose in VOIDED status

    Raises:
        ValidationError: if already VOIDED
    """
    errors = {}

    if day_close.status == CashierDayCloseStatus.VOIDED:
        errors["status"] = "Cannot void an already-voided day-close."

    if errors:
        raise ValidationError(errors)

    day_close.status = CashierDayCloseStatus.VOIDED
    day_close.approved_by_id = user_id
    day_close.approved_at = timezone.now()
    if notes:
        day_close.notes = f"{day_close.notes or ''}\n[VOIDED: {notes}]".strip()
    day_close.full_clean()
    day_close.save(update_fields=["status", "approved_by_id", "approved_at", "notes", "updated_at"])

    return day_close


def get_cashier_current_day_close(cashier_id: int, business_date: str) -> Optional[CashierDayClose]:
    """
    Get the current day-close record for a cashier on a given business date.

    Returns:
        CashierDayClose if exists, None otherwise
    """
    return (
        CashierDayClose.objects.filter(
            cashier_id=cashier_id,
            business_date=business_date,
        )
        .exclude(status=CashierDayCloseStatus.VOIDED)
        .order_by("-created_at")
        .first()
    )
