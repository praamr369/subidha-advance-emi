from decimal import Decimal
from typing import Iterable, List

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone

from subscriptions.models import (
    AuditLog,
    Commission,
    CommissionPayoutBatch,
    CommissionPayoutLine,
    CommissionStatus,
    MONEY_ZERO,
)
from subscriptions.services.commission_service import settle_commission


def _normalize_ids(commission_ids: Iterable[int]) -> List[int]:
    if not commission_ids:
        raise ValueError("commission_ids is required.")

    normalized = []
    seen = set()

    for raw in commission_ids:
        try:
            value = int(raw)
        except (TypeError, ValueError):
            raise ValueError("commission_ids must contain valid integers.")

        if value <= 0:
            raise ValueError("commission_ids must contain positive integers.")

        if value in seen:
            raise ValueError("commission_ids cannot contain duplicates.")

        seen.add(value)
        normalized.append(value)

    if not normalized:
        raise ValueError("commission_ids is required.")

    return normalized


def _money(value) -> Decimal:
    return Decimal(str(value or MONEY_ZERO)).quantize(Decimal("0.01"))


def generate_payout_batch_code() -> str:
    return f"CPB-{timezone.now().strftime('%Y%m%d-%H%M%S-%f')}"


def _create_payout_batch_audit_log(
    *,
    action_type: str,
    actor,
    payout_batch: CommissionPayoutBatch,
    metadata: dict | None = None,
):
    base_metadata = {
        "actor_id": getattr(actor, "id", None),
        "batch_id": payout_batch.id,
        "timestamp": timezone.now().isoformat(),
    }
    if metadata:
        base_metadata.update(metadata)

    AuditLog.objects.create(
        action_type=action_type,
        performed_by=actor,
        model_name="commission_payout_batch",
        object_id=payout_batch.id,
        metadata=base_metadata,
    )


def _eligible_commission_queryset():
    return (
        Commission.objects.select_related(
            "partner",
            "subscription",
            "subscription__customer",
            "subscription__batch",
            "subscription__lucky_id",
            "payment",
            "emi",
            "payout_line__payout_batch",
        )
        .filter(
            partner__role="PARTNER",
            payment__isnull=False,
            status=CommissionStatus.PENDING,
            payout_line__isnull=True,
        )
        .exclude(
            status=CommissionStatus.REVERSED,
        )
        .exclude(
            payment__allocation_metadata__reversal__is_reversed=True,
        )
    )


def preview_commission_payout_candidates(*, partner_id=None, date_from=None, date_to=None):
    queryset = _eligible_commission_queryset().order_by("-created_at", "-id")

    if partner_id:
        queryset = queryset.filter(partner_id=partner_id)

    if date_from:
        queryset = queryset.filter(created_at__date__gte=date_from)

    if date_to:
        queryset = queryset.filter(created_at__date__lte=date_to)

    per_partner_rows = (
        queryset.values("partner_id", "partner__username")
        .annotate(
            commission_count=Count("id"),
            total_commission=Sum("commission_amount"),
            pending_commission=Sum("commission_amount"),
        )
        .order_by("-total_commission", "partner__username", "partner_id")
    )

    return {
        "summary": {
            "eligible_count": queryset.count(),
            "eligible_amount": f"{_money(queryset.aggregate(total=Sum('commission_amount'))['total']):.2f}",
            "pending_count": queryset.count(),
            "settled_count": 0,
        },
        "per_partner": [
            {
                "partner_id": row["partner_id"],
                "partner_username": row["partner__username"] or "",
                "commission_count": row["commission_count"],
                "total_commission": f"{_money(row['total_commission']):.2f}",
                "pending_commission": f"{_money(row['pending_commission']):.2f}",
                "settled_commission": f"{_money(MONEY_ZERO):.2f}",
            }
            for row in per_partner_rows
        ],
        "queryset": queryset,
    }


@transaction.atomic
def create_commission_payout_batch(
    *,
    commission_ids,
    processed_by,
    payout_date=None,
    notes: str = "",
):
    """
    Create one draft payout batch from eligible commissions.

    Eligible commissions:
    - PENDING commissions only
    - partner-owned commissions only
    - commissions with no existing payout line
    - commissions linked to non-reversed payments only
    """
    if not processed_by:
        raise ValueError("processed_by is required.")

    commission_ids = _normalize_ids(commission_ids)
    payout_date = payout_date or timezone.now().date()
    notes = (notes or "").strip()

    commissions = list(
        Commission.objects.select_for_update()
        .select_related("partner")
        .prefetch_related("payout_line")
        .filter(id__in=commission_ids)
        .order_by("id")
    )

    if len(commissions) != len(commission_ids):
        found_ids = {commission.id for commission in commissions}
        missing_ids = [commission_id for commission_id in commission_ids if commission_id not in found_ids]
        raise ValueError(f"Commission(s) not found: {missing_ids}")

    invalid_partner_ids = [
        commission.id
        for commission in commissions
        if getattr(commission.partner, "role", None) != "PARTNER"
    ]
    if invalid_partner_ids:
        raise ValueError(
            f"Only partner commissions can be added to payout batch. Invalid commission ids: {invalid_partner_ids}"
        )

    partner_ids = {commission.partner_id for commission in commissions}
    if len(partner_ids) > 1:
        raise ValueError(
            "All commissions in a payout batch must belong to the same partner."
        )

    invalid_payment_ids = [
        commission.id
        for commission in commissions
        if commission.payment_id is None
        or (commission.payment and (commission.payment.allocation_metadata or {}).get("reversal", {}).get("is_reversed"))
    ]
    if invalid_payment_ids:
        raise ValueError(
            f"Commission(s) linked to missing/reversed payments cannot be added to payout batch: {invalid_payment_ids}"
        )

    invalid_status_ids = [
        commission.id
        for commission in commissions
        if commission.status != CommissionStatus.PENDING
    ]
    if invalid_status_ids:
        raise ValueError(
            f"Only pending commissions can be added to payout batch. Invalid commission ids: {invalid_status_ids}"
        )

    already_batched_ids = [
        commission.id
        for commission in commissions
        if getattr(commission, "payout_line", None) is not None
    ]

    if already_batched_ids:
        raise ValueError(
            f"Commission(s) already assigned to a payout batch: {already_batched_ids}"
        )

    batch = CommissionPayoutBatch.objects.create(
        batch_code=generate_payout_batch_code(),
        payout_date=payout_date,
        processed_by=processed_by,
        status=CommissionPayoutBatch.Status.DRAFT,
        notes=notes,
        total_amount=MONEY_ZERO,
    )

    total_amount = MONEY_ZERO
    created_lines = []

    for commission in commissions:
        line = CommissionPayoutLine.objects.create(
            payout_batch=batch,
            commission=commission,
            partner=commission.partner,
            amount=commission.commission_amount,
        )
        created_lines.append(line)
        total_amount += _money(commission.commission_amount)

    batch.total_amount = total_amount
    batch.save(update_fields=["total_amount", "updated_at"])

    _create_payout_batch_audit_log(
        action_type=AuditLog.ActionType.COMMISSION_PAYOUT_BATCH_CREATED,
        actor=processed_by,
        payout_batch=batch,
        metadata={
            "partner_id": next(iter(partner_ids)),
            "batch_code": batch.batch_code,
            "line_count": len(created_lines),
            "total_amount": str(batch.total_amount),
            "commission_ids": commission_ids,
        },
    )

    return {
        "batch": batch,
        "lines": created_lines,
        "line_count": len(created_lines),
        "total_amount": batch.total_amount,
    }


@transaction.atomic
def finalize_commission_payout_batch(*, batch_id: int, processed_by):
    if not batch_id:
        raise ValueError("batch_id is required.")

    if not processed_by:
        raise ValueError("processed_by is required.")

    payout_batch = (
        CommissionPayoutBatch.objects.select_for_update()
        .prefetch_related("lines__commission")
        .get(id=batch_id)
    )

    if payout_batch.status == CommissionPayoutBatch.Status.FINALIZED:
        return {
            "batch": payout_batch,
            "updated": False,
            "settled_count": 0,
        }

    if payout_batch.status == CommissionPayoutBatch.Status.CANCELLED:
        raise ValueError("Cancelled payout batch cannot be finalized.")

    if payout_batch.status != CommissionPayoutBatch.Status.DRAFT:
        raise ValueError(f"Invalid payout batch state: {payout_batch.status}")

    lines = list(
        payout_batch.lines.select_related("commission", "commission__payment").order_by("id")
    )
    if not lines:
        raise ValueError("Empty payout batch cannot be finalized.")

    commission_ids = [line.commission_id for line in lines]
    settled_count = 0

    for line in lines:
        commission = line.commission
        if commission.status == CommissionStatus.REVERSED:
            raise ValueError(
                f"Reversed commission cannot be finalized in payout batch: {commission.id}"
            )

        if commission.status != CommissionStatus.PENDING:
            raise ValueError(
                f"Only pending commissions can be finalized in payout batch: {commission.id}"
            )

        if commission.payment is None:
            raise ValueError(
                f"Commission linked to missing payment cannot be finalized in payout batch: {commission.id}"
            )

        metadata = getattr(commission.payment, "allocation_metadata", {}) or {}
        reversal = metadata.get("reversal", {}) or {}
        if reversal.get("is_reversed"):
            raise ValueError(
                f"Commission linked to reversed payment cannot be finalized in payout batch: {commission.id}"
            )

        result = settle_commission(
            commission_id=commission.id,
            settled_by=processed_by,
            settlement_date=payout_batch.payout_date,
            settlement_metadata={
                "settlement_source": "PAYOUT_BATCH",
                "actor_id": getattr(processed_by, "id", None),
                "payout_batch_id": payout_batch.id,
                "payout_batch_code": payout_batch.batch_code,
            },
        )
        if result["updated"]:
            settled_count += 1

    payout_batch.status = CommissionPayoutBatch.Status.FINALIZED
    payout_batch.save(update_fields=["status", "updated_at"])

    _create_payout_batch_audit_log(
        action_type=AuditLog.ActionType.COMMISSION_PAYOUT_BATCH_FINALIZED,
        actor=processed_by,
        payout_batch=payout_batch,
        metadata={
            "batch_code": payout_batch.batch_code,
            "line_count": len(lines),
            "settled_count": settled_count,
            "status": payout_batch.status,
            "commission_ids": commission_ids,
        },
    )

    return {
        "batch": payout_batch,
        "updated": True,
        "settled_count": settled_count,
    }


@transaction.atomic
def cancel_commission_payout_batch(*, batch_id: int, processed_by, reason: str | None = None):
    if not batch_id:
        raise ValueError("batch_id is required.")

    if not processed_by:
        raise ValueError("processed_by is required.")

    payout_batch = (
        CommissionPayoutBatch.objects.select_for_update()
        .prefetch_related("lines")
        .get(id=batch_id)
    )

    if payout_batch.status == CommissionPayoutBatch.Status.CANCELLED:
        return {
            "batch": payout_batch,
            "updated": False,
        }

    if payout_batch.status == CommissionPayoutBatch.Status.FINALIZED:
        raise ValueError("Finalized payout batch cannot be cancelled.")

    if payout_batch.status != CommissionPayoutBatch.Status.DRAFT:
        raise ValueError(f"Invalid payout batch state: {payout_batch.status}")

    reason = (reason or "").strip()
    line_ids = list(payout_batch.lines.values_list("id", flat=True))
    commission_ids = list(payout_batch.lines.values_list("commission_id", flat=True))
    line_count = len(line_ids)

    payout_batch.status = CommissionPayoutBatch.Status.CANCELLED

    if reason:
        existing_notes = (payout_batch.notes or "").strip()
        payout_batch.notes = (
            f"{existing_notes}\nCancellation reason: {reason}".strip()
            if existing_notes
            else f"Cancellation reason: {reason}"
        )

    payout_batch.save(update_fields=["status", "notes", "updated_at"])
    if line_ids:
        CommissionPayoutLine.objects.filter(id__in=line_ids).delete()

    _create_payout_batch_audit_log(
        action_type=AuditLog.ActionType.COMMISSION_PAYOUT_BATCH_CANCELLED,
        actor=processed_by,
        payout_batch=payout_batch,
        metadata={
            "batch_code": payout_batch.batch_code,
            "status": payout_batch.status,
            "line_count": line_count,
            "commission_ids": commission_ids,
            "reason": reason,
        },
    )

    return {
        "batch": payout_batch,
        "updated": True,
    }
