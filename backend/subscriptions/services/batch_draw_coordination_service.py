"""
Pass 7 — Lucky Plan batch / draw coordination (additive).

Guards lock/snapshot/commit/execute flows without changing EMI math or payment posting.
"""

from __future__ import annotations

import hashlib
import json
import logging

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Max
from django.utils import timezone
from django.utils.crypto import get_random_string

from accounting.services.operational_accounts_service import ensure_phase3_system_accounts
from subscriptions.models import (
    Batch,
    BatchStatus,
    BusinessEventType,
    DrawCommit,
    DrawEligibilitySnapshot,
    LuckyDraw,
    LuckyIdStatus,
    PlanType,
    Subscription,
    SubscriptionRequestStatus,
    SubscriptionStatus,
)
from subscriptions.services.business_event_service import append_business_event

finance_logger = logging.getLogger("finance.events")

COORDINATION_ALGORITHM_VERSION = "pass7-v1"

# Batches in these statuses must not mutate EMI eligibility (subscriptions / lucky IDs / customer).
FROZEN_ELIGIBILITY_STATUSES = frozenset(
    {
        BatchStatus.LOCKED,
        BatchStatus.DRAW_COMMITTED,
        BatchStatus.DRAW_COMPLETED,
        BatchStatus.CANCELLED,
        # Legacy terminals / draw underway
        BatchStatus.DRAW_IN_PROGRESS,
        BatchStatus.COMPLETED,
        BatchStatus.CLOSED,
    }
)


def is_batch_eligibility_frozen(batch: Batch | None) -> bool:
    if not batch:
        return False
    return (batch.status or "") in FROZEN_ELIGIBILITY_STATUSES


def assert_batch_accepts_new_emi_subscriptions(batch: Batch):
    """
    Hard rule: only OPEN batches accept new EMI subscriptions (existing behavior).
    """
    if batch.status != BatchStatus.OPEN:
        raise ValidationError("Batch is not open for subscription.")


def assert_subscription_eligibility_mutations_allowed(batch: Batch | None):
    if batch and is_batch_eligibility_frozen(batch):
        raise ValidationError(
            "Batch draw eligibility is frozen. Customer, Lucky ID, and batch assignment cannot change."
        )


def assert_waiver_finance_ready():
    """
    Block draw completion if core waiver-related system accounts are missing.
    Does not alter commission or reconciliation rules.
    """
    accounts = ensure_phase3_system_accounts()
    required = ("EMI_WAIVER_EXPENSE", "EMI_WAIVER_RESERVE", "ACCOUNTS_RECEIVABLE")
    missing = [key for key in required if not accounts.get(key)]
    if missing:
        raise ValidationError(
            "Winner waiver finance is not fully configured (missing system accounts: "
            + ", ".join(missing)
            + "). Complete accounting setup before completing the draw."
        )


def _eligible_queryset(batch: Batch):
    return (
        Subscription.objects.select_related("customer", "product", "lucky_id", "batch", "partner")
        .filter(
            batch=batch,
            plan_type=PlanType.EMI,
            status=SubscriptionStatus.ACTIVE,
            lucky_id__isnull=False,
            lucky_id__status=LuckyIdStatus.ASSIGNED,
        )
        .order_by("lucky_id__lucky_number", "id")
    )


def list_coordination_eligible_subscriptions(batch: Batch) -> list[Subscription]:
    return list(_eligible_queryset(batch))


def _emi_summary_for_subscription(subscription: Subscription) -> dict:
    raw = list(subscription.emis.order_by("month_no", "id").values("month_no", "due_date", "amount", "status"))
    rows = [
        {
            "month_no": r["month_no"],
            "due_date": str(r["due_date"]) if r.get("due_date") is not None else None,
            "amount": str(r["amount"]) if r.get("amount") is not None else None,
            "status": r["status"],
        }
        for r in raw
    ]
    return {"emis": rows}


def _row_hash_bytes(subscription: Subscription, sort_order: int, version: int) -> bytes:
    summary = _emi_summary_for_subscription(subscription)
    lucky_num = subscription.lucky_id.lucky_number if subscription.lucky_id_id else None
    payload = {
        "v": version,
        "ord": sort_order,
        "subscription_id": subscription.id,
        "lucky_number": lucky_num,
        "customer_id": subscription.customer_id,
        "product_id": subscription.product_id,
        "partner_id": subscription.partner_id,
        "contract_reference": (subscription.contract_reference or "") or "",
        "emi_schedule_summary": summary,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).digest()


def compute_snapshot_aggregate_hash(batch: Batch, snapshot_version: int) -> str:
    row_hashes = list(
        DrawEligibilitySnapshot.objects.filter(batch=batch, snapshot_version=snapshot_version)
        .order_by("sort_order", "id")
        .values_list("row_hash", flat=True)
    )
    if not row_hashes:
        raise ValidationError("No eligibility snapshots found for this version.")
    joined = b"".join(bytes.fromhex(h) for h in row_hashes)
    return hashlib.sha256(joined).hexdigest()


@transaction.atomic
def freeze_draw_eligibility_snapshot(batch: Batch, user=None) -> dict:
    """
    Create immutable DrawEligibilitySnapshot rows for the batch's current eligible subscriptions.
    Idempotent if batch already LOCKED with snapshots — returns metadata only.
    """
    batch = Batch.objects.select_for_update().get(pk=batch.pk)

    if batch.status == BatchStatus.LOCKED:
        ver = (
            DrawEligibilitySnapshot.objects.filter(batch=batch)
            .order_by("-snapshot_version")
            .values_list("snapshot_version", flat=True)
            .first()
        )
        if not ver:
            raise ValidationError("Locked batch is missing eligibility snapshots.")
        agg = compute_snapshot_aggregate_hash(batch, ver)
        cnt = DrawEligibilitySnapshot.objects.filter(batch=batch, snapshot_version=ver).count()
        return {
            "snapshot_version": ver,
            "snapshot_hash": agg,
            "eligible_count": cnt,
            "row_count": cnt,
            "idempotent": True,
        }

    eligible = list_coordination_eligible_subscriptions(batch)

    dup_lucky = (
        Subscription.objects.filter(batch=batch, plan_type=PlanType.EMI)
        .values("lucky_id")
        .annotate(c=Count("id"))
        .filter(c__gt=1, lucky_id__isnull=False)
        .exists()
    )
    if dup_lucky:
        raise ValidationError("Duplicate Lucky ID assignments detected in batch.")

    next_version = (
        DrawEligibilitySnapshot.objects.filter(batch=batch).aggregate(m=Max("snapshot_version"))["m"] or 0
    )
    next_version += 1

    to_create: list[DrawEligibilitySnapshot] = []
    for order, sub in enumerate(eligible):
        rh = hashlib.sha256(
            _row_hash_bytes(sub, order, next_version)
        ).hexdigest()
        cref = (sub.contract_reference or "") or ""
        to_create.append(
            DrawEligibilitySnapshot(
                batch=batch,
                snapshot_version=next_version,
                sort_order=order,
                subscription=sub,
                customer=sub.customer,
                lucky_id=sub.lucky_id,
                product=sub.product,
                partner=sub.partner,
                contract_reference=cref[:64],
                emi_schedule_summary=_emi_summary_for_subscription(sub),
                row_hash=rh,
            )
        )

    DrawEligibilitySnapshot.objects.bulk_create(to_create)
    agg = compute_snapshot_aggregate_hash(batch, next_version)
    append_business_event(
        event_type=BusinessEventType.DRAW_SNAPSHOT_FROZEN,
        source_module="subscriptions.services.batch_draw_coordination_service.freeze_draw_eligibility_snapshot",
        actor_user=user,
        batch=batch,
        payload={
            "snapshot_version": next_version,
            "snapshot_hash": agg,
            "eligible_count": len(to_create),
        },
    )
    return {
        "snapshot_version": next_version,
        "snapshot_hash": agg,
        "eligible_count": len(to_create),
        "row_count": len(to_create),
        "idempotent": False,
    }


@transaction.atomic
def lock_batch_for_draw(*, batch: Batch, user=None, minimum_active: int | None = None) -> dict:
    """
    Validates batch, freezes eligibility snapshot, sets LOCKED + locked_at.
    Idempotent when already LOCKED (returns without duplicating snapshots).
    """
    batch = Batch.objects.select_for_update().get(pk=batch.pk)

    if batch.status == BatchStatus.LOCKED:
        snap_meta = freeze_draw_eligibility_snapshot(batch, user=user)
        return {
            "batch_id": batch.id,
            "status": batch.status,
            "active_subscription_count": Subscription.objects.filter(
                batch=batch, status=SubscriptionStatus.ACTIVE
            ).count(),
            "eligible_count": snap_meta["eligible_count"],
            "lock_timestamp": batch.locked_at.isoformat() if batch.locked_at else None,
            "snapshot_version": snap_meta["snapshot_version"],
            "snapshot_hash": snap_meta["snapshot_hash"],
            "messages": [],
            "idempotent": True,
        }

    if batch.status in (BatchStatus.CANCELLED, BatchStatus.DRAW_COMPLETED, BatchStatus.COMPLETED):
        raise ValidationError("Batch cannot be locked in its current state.")

    if batch.status not in (BatchStatus.FULL, BatchStatus.READY_TO_LOCK):
        raise ValidationError("Batch must be FULL or READY_TO_LOCK before lock.")

    if batch.lucky_ids.count() != batch.total_slots:
        raise ValidationError("Lucky ID rows must match total_slots before lock.")

    if batch.lucky_ids.filter(status=LuckyIdStatus.AVAILABLE).exists():
        raise ValidationError("All Lucky IDs must be assigned before lock.")

    active_count = Subscription.objects.filter(batch=batch, status=SubscriptionStatus.ACTIVE).count()
    threshold = minimum_active if minimum_active is not None else batch.total_slots
    if active_count < threshold:
        raise ValidationError(
            f"Active subscription count {active_count} is below required threshold {threshold}."
        )

    pending_req = batch.subscription_requests.filter(status=SubscriptionRequestStatus.SUBMITTED).exists()
    if pending_req:
        raise ValidationError("Complete or reject pending subscription requests before locking the batch.")

    snap = freeze_draw_eligibility_snapshot(batch, user=user)

    from subscriptions.services.batch_service import transition_batch_status

    transition_batch_status(batch, BatchStatus.LOCKED)
    batch.locked_at = timezone.now()
    batch.save(update_fields=["locked_at"])

    return {
        "batch_id": batch.id,
        "status": batch.status,
        "active_subscription_count": active_count,
        "eligible_count": snap["eligible_count"],
        "lock_timestamp": batch.locked_at.isoformat() if batch.locked_at else None,
        "snapshot_version": snap["snapshot_version"],
        "snapshot_hash": snap["snapshot_hash"],
        "messages": [],
        "idempotent": False,
    }


@transaction.atomic
def commit_batch_draw(*, batch: Batch, user=None) -> dict:
    """Creates DrawCommit + LuckyDraw month 1 + DRAW_COMMITTED. Idempotent."""
    batch = Batch.objects.select_for_update().get(pk=batch.pk)

    if DrawCommit.objects.filter(batch_id=batch.pk).exists():
        dc = DrawCommit.objects.get(batch_id=batch.pk)
        draw = LuckyDraw.objects.filter(batch=batch, draw_month=1).first()
        return {
            "batch_id": batch.id,
            "status": batch.status,
            "draw_commit_id": dc.id,
            "snapshot_hash": dc.snapshot_hash,
            "public_commit_hash": dc.public_commit_hash,
            "lucky_draw_id": draw.id if draw else None,
            "admin_seed_store_securely": None,
            "idempotent": True,
        }

    if batch.status != BatchStatus.LOCKED:
        raise ValidationError("Batch must be LOCKED before draw commit.")

    ver = (
        DrawEligibilitySnapshot.objects.filter(batch=batch)
        .order_by("-snapshot_version")
        .values_list("snapshot_version", flat=True)
        .first()
    )
    if not ver:
        raise ValidationError("Frozen eligibility snapshot is required before commit.")

    snapshot_hash = compute_snapshot_aggregate_hash(batch, ver)

    if LuckyDraw.objects.filter(batch=batch, draw_month=1).exists():
        raise ValidationError("Draw month 1 already exists for this batch.")

    secret_seed = get_random_string(64)
    public_commit_hash = hashlib.sha256(secret_seed.strip().encode()).hexdigest()

    dc = DrawCommit.objects.create(
        batch=batch,
        snapshot_version=ver,
        snapshot_hash=snapshot_hash,
        public_commit_hash=public_commit_hash,
        seed_commitment=public_commit_hash,
        committed_at=timezone.now(),
        committed_by=user if getattr(user, "pk", None) else None,
        algorithm_version=COORDINATION_ALGORITHM_VERSION,
    )

    draw = LuckyDraw.objects.create(
        batch=batch,
        draw_commit=dc,
        committed_hash=public_commit_hash,
        draw_date=timezone.now(),
        draw_month=1,
        is_revealed=False,
        waiver_scope="FUTURE_EMI_ONLY",
    )

    from subscriptions.services.batch_service import transition_batch_status

    transition_batch_status(batch, BatchStatus.DRAW_COMMITTED)
    append_business_event(
        event_type=BusinessEventType.DRAW_COMMITTED,
        source_module="subscriptions.services.batch_draw_coordination_service.commit_batch_draw",
        actor_user=user,
        batch=batch,
        payload={
            "draw_commit_id": dc.id,
            "snapshot_hash": snapshot_hash,
            "public_commit_hash": public_commit_hash,
            "lucky_draw_id": draw.id,
        },
    )
    finance_logger.info(
        "finance.draw_committed",
        extra={
            "batch_id": batch.id,
            "draw_commit_id": dc.id,
            "lucky_draw_id": draw.id,
            "snapshot_hash": snapshot_hash,
            "committed_by_user_id": getattr(user, "id", None),
        },
    )

    return {
        "batch_id": batch.id,
        "status": batch.status,
        "draw_commit_id": dc.id,
        "snapshot_hash": snapshot_hash,
        "public_commit_hash": public_commit_hash,
        "lucky_draw_id": draw.id,
        "admin_seed_store_securely": secret_seed,
        "idempotent": False,
    }


def build_control_center(batch: Batch) -> dict:
    """Read-only coordination state for admin UI."""
    snapshots = DrawEligibilitySnapshot.objects.filter(batch=batch)
    latest_ver = snapshots.order_by("-snapshot_version").values_list("snapshot_version", flat=True).first()
    snap_count = snapshots.filter(snapshot_version=latest_ver).count() if latest_ver else 0

    dc = DrawCommit.objects.filter(batch_id=batch.pk).first()
    draw_m1 = LuckyDraw.objects.filter(batch=batch, draw_month=1).first()

    active_subs = Subscription.objects.filter(batch=batch, status=SubscriptionStatus.ACTIVE).count()
    threshold = batch.total_slots

    disabled_lock = []
    if batch.status not in (BatchStatus.FULL, BatchStatus.READY_TO_LOCK):
        disabled_lock.append("batch_not_ready_for_lock")
    if batch.lucky_ids.filter(status=LuckyIdStatus.AVAILABLE).exists():
        disabled_lock.append("lucky_ids_still_available")
    if active_subs < threshold:
        disabled_lock.append("below_minimum_active_threshold")

    disabled_commit = []
    if batch.status != BatchStatus.LOCKED:
        disabled_commit.append("batch_not_locked")
    if not latest_ver:
        disabled_commit.append("no_eligibility_snapshot")

    disabled_execute = []
    if batch.status != BatchStatus.DRAW_COMMITTED:
        disabled_execute.append("draw_not_committed")
    if not draw_m1:
        disabled_execute.append("no_lucky_draw_record")
    elif draw_m1.is_revealed:
        disabled_execute.append("draw_already_revealed")

    finance_waiver = "ready"
    try:
        assert_waiver_finance_ready()
    except ValidationError as exc:
        finance_waiver = "not_configured"
        finance_reason = exc.messages[0] if getattr(exc, "messages", None) else str(exc)
    else:
        finance_reason = None

    return {
        "batch_id": batch.id,
        "batch_code": batch.batch_code,
        "target_size": batch.total_slots,
        "active_subscriptions": active_subs,
        "minimum_threshold": threshold,
        "minimum_threshold_met": active_subs >= threshold,
        "recommended_threshold_status": "use_total_slots",
        "lock_status": batch.status
        if batch.status
        in (
            BatchStatus.LOCKED,
            BatchStatus.DRAW_COMMITTED,
            BatchStatus.DRAW_COMPLETED,
        )
        else ("open" if batch.status == BatchStatus.OPEN else batch.status),
        "batch_status": batch.status,
        "locked_at": batch.locked_at.isoformat() if batch.locked_at else None,
        "snapshot_status": "present" if latest_ver else "absent",
        "snapshot_version": latest_ver,
        "snapshot_row_count": snap_count,
        "snapshot_hash": (
            compute_snapshot_aggregate_hash(batch, latest_ver) if latest_ver else None
        ),
        "commit_status": "present" if dc else "absent",
        "public_commit_hash": dc.public_commit_hash if dc else None,
        "draw_status": (
            "revealed"
            if draw_m1 and draw_m1.is_revealed
            else ("committed_unrevealed" if draw_m1 else "none")
        ),
        "winner_lucky_number": (
            draw_m1.winner_lucky_id.lucky_number
            if draw_m1 and draw_m1.winner_lucky_id_id
            else None
        ),
        "product_demand_status": "not_configured",
        "delivery_status": "not_configured",
        "finance_waiver_posting_status": finance_waiver,
        "finance_waiver_posting_reason": finance_reason,
        "disabled_reasons": {
            "lock_batch": disabled_lock,
            "commit_draw": disabled_commit,
            "execute_draw": disabled_execute,
        },
    }


def post_winner_operational_followup(*, subscription_id: int, performed_by=None) -> None:
    """
    Best-effort pending delivery + inventory soft reservation after a coord draw.
    Never marks delivered; failures are non-fatal for waiver integrity.
    """
    from decimal import Decimal

    sub = Subscription.objects.select_related("product", "customer").get(pk=subscription_id)

    from subscriptions.services.delivery_service import create_subscription_delivery

    try:
        create_subscription_delivery(
            subscription=sub,
            performed_by=performed_by,
            notes="Winner draw: delivery record pending staff scheduling (not auto-delivered).",
        )
    except ValueError:
        pass

    try:
        from inventory.models import InventoryItem
        from inventory.services.stock_movement_service import reserve_stock_for_subscription

        item = InventoryItem.objects.filter(product_id=sub.product_id).first()
        if item:
            reserve_stock_for_subscription(
                inventory_item=item,
                quantity=Decimal("1"),
                subscription_id=sub.id,
                posted_by=performed_by,
                notes="Winner draw reservation",
            )
    except ValueError:
        pass


@transaction.atomic
def execute_batch_draw(*, batch: Batch, revealed_seed: str, performed_by=None) -> dict:
    """
    Reveal month-1 draw for coordination batches (snapshot-based eligibility inside reveal).
    Idempotent when the draw is already revealed.
    """
    batch = Batch.objects.select_for_update().get(pk=batch.pk)
    draw = (
        LuckyDraw.objects.select_for_update()
        .select_related("batch")
        .filter(batch=batch, draw_month=1)
        .first()
    )
    if not draw:
        raise ValidationError("No month-1 draw exists for this batch. Run commit-draw first.")
    if not revealed_seed or not str(revealed_seed).strip():
        raise ValidationError("Reveal seed is required.")
    if batch.status != BatchStatus.DRAW_COMMITTED and not draw.is_revealed:
        raise ValidationError("Batch must be DRAW_COMMITTED before execute-draw.")

    assert_waiver_finance_ready()

    from subscriptions.services.lucky_draw_service import reveal_and_execute_draw

    return reveal_and_execute_draw(
        draw_id=draw.id,
        revealed_seed=str(revealed_seed).strip(),
        performed_by=performed_by,
    )
