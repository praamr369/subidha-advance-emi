"""
P2B — Cash counter session service.

All mutations go through this module. No payment record is modified.
Expected cash is computed from existing Payment records only.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from subscriptions.models_cash_counter_session import (
    CashCounterSession,
    CashCounterSessionStatus,
    _IMMUTABLE_STATUSES,
)
from subscriptions.services.audit_service import log_audit
from subscriptions.models import AuditLog, PaymentMethod

MONEY_ZERO = Decimal("0.00")


# ─────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────

def _log(event: str, session: CashCounterSession, performed_by=None, extra: dict | None = None) -> None:
    log_audit(
        action_type=AuditLog.ActionType.USER_UPDATED,
        instance=session,
        performed_by=performed_by,
        metadata={
            "event": f"CASH_SESSION_{event}",
            "session_id": session.pk,
            "session_date": str(session.session_date),
            "cash_counter_id": session.cash_counter_id,
            "status": session.status,
            **(extra or {}),
        },
    )


def _guard_immutable(session: CashCounterSession) -> None:
    if session.status in _IMMUTABLE_STATUSES:
        raise ValueError(
            f"CashCounterSession {session.pk} is {session.status} and cannot be modified."
        )


def _is_admin(user) -> bool:
    return getattr(user, "role", "") == "ADMIN"


# ─────────────────────────────────────────────
# Expected cash calculation
# ─────────────────────────────────────────────

def calculate_cash_counter_expected_cash(
    *,
    cash_counter,
    session_date,
    opening_cash: Decimal = MONEY_ZERO,
) -> Decimal:
    """
    expected = opening_cash
               + CASH payments collected at this counter on this date
               - CASH direct-sale refunds at this counter on this date (if any)

    Reads from Payment and billing.ReceiptDocument only. Never mutates.
    """
    from subscriptions.models import Payment

    cash_collected = (
        Payment.objects.filter(
            cash_counter=cash_counter,
            payment_date=session_date,
            method=PaymentMethod.CASH,
        ).aggregate(total=Sum("amount"))["total"]
        or MONEY_ZERO
    )

    # Cash refunds via DirectSaleReturn (CustomerRefund with cash_counter)
    # If the billing model exists and has a cash_refund flag, subtract it.
    cash_refunded = _sum_cash_refunds(cash_counter=cash_counter, session_date=session_date)

    return opening_cash + cash_collected - cash_refunded


def _sum_cash_refunds(*, cash_counter, session_date) -> Decimal:
    """Sum cash refunds at counter for date. Returns ZERO if billing models don't match."""
    try:
        from billing.models import RefundMethod, DirectSaleReturn, DirectSaleReturnStatus

        total = (
            DirectSaleReturn.objects.filter(
                cash_counter=cash_counter,
                return_date=session_date,
                refund_method=RefundMethod.CASH_REFUND,
                status__in=[
                    DirectSaleReturnStatus.APPROVED,
                    DirectSaleReturnStatus.POSTED,
                ],
            ).aggregate(total=Sum("refund_amount"))["total"]
            or MONEY_ZERO
        )
        return total
    except Exception:
        return MONEY_ZERO


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

@transaction.atomic
def open_cash_counter_session(
    *,
    cash_counter,
    cashier,
    session_date,
    opening_cash: Decimal = MONEY_ZERO,
    notes: str = "",
    opened_by=None,
    metadata: dict | None = None,
) -> CashCounterSession:
    """Open a new session for cashier on counter/date. Raises ValueError if already open."""
    opened_by = opened_by or cashier

    if not _is_admin(opened_by) and opened_by.pk != cashier.pk:
        raise ValueError("Only the assigned cashier or an admin can open a session on their behalf.")

    existing = CashCounterSession.objects.filter(
        cash_counter=cash_counter,
        cashier=cashier,
        session_date=session_date,
        status=CashCounterSessionStatus.OPEN,
    ).first()
    if existing:
        raise ValueError(
            f"An OPEN session already exists for counter {cash_counter.code} / "
            f"cashier {cashier.username} on {session_date} (id={existing.pk})."
        )

    session = CashCounterSession(
        branch=cash_counter.branch,
        cash_counter=cash_counter,
        cashier=cashier,
        session_date=session_date,
        opened_at=timezone.now(),
        opening_cash=opening_cash,
        expected_cash=opening_cash,
        declared_cash=MONEY_ZERO,
        variance=MONEY_ZERO,
        status=CashCounterSessionStatus.OPEN,
        opened_by=opened_by,
        notes=(notes or "").strip(),
        metadata=metadata or {},
    )
    session.save()
    _log("OPENED", session, performed_by=opened_by, extra={"opening_cash": str(opening_cash)})
    return session


@transaction.atomic
def close_cash_counter_session(
    *,
    session: CashCounterSession,
    declared_cash: Decimal,
    closed_by,
    notes: str = "",
) -> CashCounterSession:
    """
    Close a session:
    1. Compute expected_cash from Payment records.
    2. Compute variance = declared_cash - expected_cash.
    3. If variance != 0 and CASH_VARIANCE_REQUIRES_APPROVAL policy is True,
       create a P2A ApprovalRequest and set status VARIANCE_PENDING_APPROVAL.
    4. Otherwise status = CLOSED.
    """
    _guard_immutable(session)

    if not _is_admin(closed_by) and closed_by.pk != session.cashier_id:
        raise ValueError(
            "Only the session's cashier or an admin can close this session."
        )

    if declared_cash < MONEY_ZERO:
        raise ValueError("Declared cash cannot be negative.")

    expected = calculate_cash_counter_expected_cash(
        cash_counter=session.cash_counter,
        session_date=session.session_date,
        opening_cash=session.opening_cash,
    )
    variance = declared_cash - expected

    session.expected_cash = expected
    session.declared_cash = declared_cash
    session.variance = variance
    session.closed_at = timezone.now()
    session.closed_by = closed_by
    session.notes = ((session.notes or "") + "\n" + (notes or "")).strip()

    if variance != MONEY_ZERO:
        needs_approval = _policy_requires_variance_approval()
        if needs_approval:
            approval_req = _create_variance_approval(session=session, closed_by=closed_by)
            session.variance_approval_request_id = approval_req.pk
            session.status = CashCounterSessionStatus.VARIANCE_PENDING_APPROVAL
        else:
            session.status = CashCounterSessionStatus.CLOSED
    else:
        session.status = CashCounterSessionStatus.CLOSED

    session.save()
    _log(
        "CLOSED",
        session,
        performed_by=closed_by,
        extra={
            "declared_cash": str(declared_cash),
            "expected_cash": str(expected),
            "variance": str(variance),
        },
    )
    return session


def _policy_requires_variance_approval() -> bool:
    try:
        from subscriptions.services.control_policy_service import get_policy_value, PolicyKey
        return bool(get_policy_value(PolicyKey.CASH_VARIANCE_REQUIRES_APPROVAL, default=False))
    except Exception:
        return False


def _create_variance_approval(*, session: CashCounterSession, closed_by) -> Any:
    from subscriptions.services.control_approval_service import create_approval_request
    from subscriptions.models_control_foundation import ApprovalRiskLevel

    risk = ApprovalRiskLevel.HIGH if abs(session.variance) > Decimal("1000") else ApprovalRiskLevel.MEDIUM

    return create_approval_request(
        source_model="CashCounterSession",
        source_id=str(session.pk),
        action_key="cash_counter.variance",
        requested_by=closed_by,
        risk_level=risk,
        before_snapshot={
            "expected_cash": str(session.expected_cash),
            "opening_cash": str(session.opening_cash),
        },
        after_snapshot={
            "declared_cash": str(session.declared_cash),
            "variance": str(session.variance),
        },
        request_reason=f"Cash variance of {session.variance} detected on counter {session.cash_counter_id} date {session.session_date}",
    )


@transaction.atomic
def approve_cash_variance(
    *,
    session: CashCounterSession,
    approved_by,
    notes: str = "",
) -> CashCounterSession:
    """Approve a VARIANCE_PENDING_APPROVAL session → APPROVED_VARIANCE."""
    if session.status != CashCounterSessionStatus.VARIANCE_PENDING_APPROVAL:
        raise ValueError(
            f"Session {session.pk} is not in VARIANCE_PENDING_APPROVAL status (current: {session.status})."
        )
    if not _is_admin(approved_by):
        raise ValueError("Only admin can approve a cash variance.")

    if approved_by.pk == session.cashier_id:
        raise ValueError("Self-approval of cash variance is not permitted.")

    session.approved_by = approved_by
    session.status = CashCounterSessionStatus.APPROVED_VARIANCE
    if notes:
        session.notes = ((session.notes or "") + "\n" + notes).strip()
    session.save(update_fields=["approved_by", "status", "notes", "updated_at"])

    # Also approve the P2A request if it exists
    if session.variance_approval_request_id:
        _try_approve_p2a_request(session, approved_by)

    _log("VARIANCE_APPROVED", session, performed_by=approved_by, extra={"notes": notes})
    return session


def _try_approve_p2a_request(session: CashCounterSession, approved_by) -> None:
    try:
        from subscriptions.models_control_foundation import ApprovalRequest, ApprovalStatus
        from subscriptions.services.control_approval_service import approve_request
        req = ApprovalRequest.objects.filter(
            pk=session.variance_approval_request_id,
            status=ApprovalStatus.PENDING,
        ).first()
        if req and req.requested_by_id != approved_by.pk:
            approve_request(request=req, decided_by=approved_by, decision_reason="Cash variance approved.")
    except Exception:
        pass


def get_cash_counter_session_status(*, session: CashCounterSession) -> dict:
    """Read payload for a single session. Safe for API serialisation."""
    return {
        "id": session.pk,
        "branch_id": session.branch_id,
        "cash_counter_id": session.cash_counter_id,
        "cashier_id": session.cashier_id,
        "session_date": str(session.session_date),
        "opened_at": session.opened_at.isoformat() if session.opened_at else None,
        "closed_at": session.closed_at.isoformat() if session.closed_at else None,
        "opening_cash": str(session.opening_cash),
        "expected_cash": str(session.expected_cash),
        "declared_cash": str(session.declared_cash),
        "variance": str(session.variance),
        "status": session.status,
        "opened_by_id": session.opened_by_id,
        "closed_by_id": session.closed_by_id,
        "approved_by_id": session.approved_by_id,
        "variance_approval_request_id": session.variance_approval_request_id,
        "notes": session.notes,
        "metadata": session.metadata,
        "created_at": session.created_at.isoformat(),
    }
