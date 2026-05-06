from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from subscriptions.models import AuditLog, OperationalCancellation
from subscriptions.services.audit_service import log_audit


WORKFLOW_OPEN = {"DRAFT", "NEEDS_REVIEW", "APPROVED"}
WORKFLOW_TERMINAL = {"POSTED", "REJECTED", "CANCELLED"}


def _clean_reason(reason: str | None) -> str:
    cleaned = (reason or "").strip()
    if not cleaned:
        raise ValueError("Reason is required.")
    return cleaned


def _to_decimal(value) -> Decimal:
    return Decimal(str(value or "0.00")).quantize(Decimal("0.01"))


def _status_of(case: OperationalCancellation) -> str:
    status = str((case.metadata or {}).get("workflow_status") or "").strip().upper()
    return status or "POSTED"


def _require_admin(actor) -> None:
    role = (getattr(actor, "role", "") or "").strip().upper()
    if role != "ADMIN" and not getattr(actor, "is_superuser", False):
        raise PermissionError("Only admin can manage reversal control cases.")


def _serialize_case(case: OperationalCancellation) -> dict:
    data = dict(case.metadata or {})
    return {
        "id": case.id,
        "case_no": f"REV-{case.id:06d}",
        "source_type": case.source_type,
        "source_id": case.source_id,
        "source_reference": case.source_reference,
        "customer_id": case.customer_id,
        "partner_id": case.partner_id,
        "reversal_type": case.cancellation_type,
        "status": _status_of(case),
        "amount_snapshot": str(case.amount_snapshot or "0.00"),
        "paid_amount_snapshot": str(data.get("paid_amount_snapshot") or "0.00"),
        "refundable_amount": str(data.get("refundable_amount") or "0.00"),
        "customer_credit_amount": str(data.get("customer_credit_amount") or "0.00"),
        "stock_return_required": bool(data.get("stock_return_required")),
        "delivery_return_required": bool(data.get("delivery_return_required")),
        "accounting_reversal_required": bool(data.get("accounting_reversal_required")),
        "reconciliation_required": bool(data.get("reconciliation_required", True)),
        "reason": case.reason,
        "internal_note": case.internal_note,
        "requested_by_id": case.requested_by_id,
        "approved_by_id": case.approved_by_id,
        "posted_by_id": data.get("posted_by_id"),
        "posted_at": data.get("posted_at"),
        "created_at": case.created_at,
        "updated_at": case.cancelled_at,
        "metadata": data,
    }


@transaction.atomic
def open_reversal_case(*, actor, payload: dict) -> dict:
    _require_admin(actor)
    reason = _clean_reason(payload.get("reason"))
    source_type = str(payload.get("source_type") or "").strip().upper()
    source_id = int(payload.get("source_id") or 0)
    if not source_type or source_id <= 0:
        raise ValueError("source_type and source_id are required.")

    existing = OperationalCancellation.objects.select_for_update(of=("self",)).filter(
        source_type=source_type,
        source_id=source_id,
    ).first()
    if existing is not None and _status_of(existing) in WORKFLOW_OPEN:
        raise ValueError("An active reversal case already exists for this source.")

    metadata = {
        "workflow_status": "DRAFT",
        "paid_amount_snapshot": str(_to_decimal(payload.get("paid_amount_snapshot"))),
        "refundable_amount": str(_to_decimal(payload.get("refundable_amount"))),
        "customer_credit_amount": str(_to_decimal(payload.get("customer_credit_amount"))),
        "stock_return_required": bool(payload.get("stock_return_required")),
        "delivery_return_required": bool(payload.get("delivery_return_required")),
        "accounting_reversal_required": bool(payload.get("accounting_reversal_required")),
        "reconciliation_required": bool(payload.get("reconciliation_required", True)),
        "settlement_mode": payload.get("settlement_mode"),
    }

    case = OperationalCancellation.objects.create(
        source_type=source_type,
        source_id=source_id,
        source_reference=str(payload.get("source_reference") or "").strip(),
        customer_id=payload.get("customer_id") or None,
        partner_id=payload.get("partner_id") or None,
        amount_snapshot=_to_decimal(payload.get("amount_snapshot")),
        status_before=str(payload.get("status_before") or "").strip().upper(),
        status_after=str(payload.get("status_after") or "").strip().upper(),
        cancellation_type=str(payload.get("reversal_type") or "MANUAL_SETTLEMENT").strip().upper()[:40],
        reason=reason,
        internal_note=str(payload.get("internal_note") or "").strip(),
        requested_by=actor,
        cancelled_by=actor,
        metadata=metadata,
    )
    log_audit(
        action_type=AuditLog.ActionType.PAYMENT_FLAGGED,
        instance=case,
        performed_by=actor,
        metadata={"event": "REVERSAL_CASE_OPENED", "case_id": case.id, "source_type": source_type, "source_id": source_id},
    )
    return _serialize_case(case)


@transaction.atomic
def approve_reversal_case(*, case_id: int, actor, reason: str) -> dict:
    _require_admin(actor)
    _clean_reason(reason)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    metadata = dict(case.metadata or {})
    metadata["workflow_status"] = "APPROVED"
    metadata["approval_reason"] = reason
    case.approved_by = actor
    case.metadata = metadata
    case.save(update_fields=["approved_by", "metadata", "cancelled_at"])
    return _serialize_case(case)


@transaction.atomic
def reject_reversal_case(*, case_id: int, actor, reason: str) -> dict:
    _require_admin(actor)
    _clean_reason(reason)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    metadata = dict(case.metadata or {})
    metadata["workflow_status"] = "REJECTED"
    metadata["rejection_reason"] = reason
    case.metadata = metadata
    case.save(update_fields=["metadata", "cancelled_at"])
    return _serialize_case(case)


@transaction.atomic
def post_reversal_case(*, case_id: int, actor, reason: str) -> dict:
    _require_admin(actor)
    _clean_reason(reason)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    metadata = dict(case.metadata or {})
    metadata["workflow_status"] = "POSTED"
    metadata["post_reason"] = reason
    metadata["posted_by_id"] = getattr(actor, "id", None)
    metadata["posted_at"] = timezone.now().isoformat()
    case.metadata = metadata
    case.save(update_fields=["metadata", "cancelled_at"])
    return _serialize_case(case)


def list_reversal_cases(*, query: str = "", open_only: bool = False) -> dict:
    qs = OperationalCancellation.objects.select_related("customer", "requested_by", "approved_by").all()
    if query:
        q = query.strip()
        qs = qs.filter(
            Q(source_reference__icontains=q)
            | Q(reason__icontains=q)
            | Q(customer__name__icontains=q)
            | Q(customer__phone__icontains=q)
        )
    rows = [_serialize_case(row) for row in qs.order_by("-id")[:200]]
    if open_only:
        rows = [row for row in rows if row["status"] in WORKFLOW_OPEN]
    return {"count": len(rows), "results": rows}


def get_reversal_case(*, case_id: int) -> dict:
    case = OperationalCancellation.objects.get(pk=case_id)
    return _serialize_case(case)


@transaction.atomic
def reconcile_reversal_case(*, case_id: int, actor, reason: str) -> dict:
    _require_admin(actor)
    _clean_reason(reason)
    case = OperationalCancellation.objects.select_for_update(of=("self",)).get(pk=case_id)
    metadata = dict(case.metadata or {})
    metadata["reconciliation_status"] = "FULLY_RECONCILED"
    metadata["reconciled_by_id"] = getattr(actor, "id", None)
    metadata["reconciled_at"] = timezone.now().isoformat()
    metadata["reconciliation_reason"] = reason
    case.metadata = metadata
    case.save(update_fields=["metadata", "cancelled_at"])
    return _serialize_case(case)
