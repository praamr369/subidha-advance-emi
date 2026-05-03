import hashlib
import logging

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from django.utils.crypto import get_random_string

from subscriptions.models import (
    AuditLog,
    Batch,
    BatchStatus,
    BusinessEventType,
    DrawEligibilitySnapshot,
    LuckyDraw,
    LuckyIdStatus,
    PlanType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.business_event_service import append_business_event
from subscriptions.services.winner_state_service import (
    WAIVER_SCOPE_FUTURE_ONLY,
    apply_winner_state,
)

finance_logger = logging.getLogger("finance.events")


def _subscription_ref(subscription: Subscription) -> str:
    return (
        getattr(subscription, "subscription_number", None)
        or getattr(subscription, "contract_reference", None)
        or f"SUB-{subscription.id}"
    )


def _eligible_winner_subscriptions(batch: Batch):
    if DrawEligibilitySnapshot.objects.filter(batch=batch).exists():
        latest_ver = DrawEligibilitySnapshot.objects.filter(batch=batch).aggregate(
            v=Max("snapshot_version")
        )["v"]
        if latest_ver is None:
            raise ValidationError("Eligibility snapshot version missing for this batch.")
        ordered_ids = list(
            DrawEligibilitySnapshot.objects.filter(batch=batch, snapshot_version=latest_ver)
            .order_by("sort_order", "id")
            .values_list("subscription_id", flat=True)
        )
        # PostgreSQL: FOR UPDATE cannot target nullable OUTER JOIN sides. Lock subscription
        # base rows only, then load lucky_id/customer via a separate SELECT (same txn).
        list(
            Subscription.objects.select_for_update(of=("self",))
            .filter(id__in=ordered_ids)
            .order_by("id")
        )
        id_to_sub = {
            s.id: s
            for s in Subscription.objects.filter(id__in=ordered_ids).select_related("lucky_id", "customer")
        }
        ordered_subs = [id_to_sub[i] for i in ordered_ids if i in id_to_sub]
        if len(ordered_subs) != len(ordered_ids):
            raise ValidationError("Snapshot subscriptions are no longer available.")
        return ordered_subs

    return list(
        Subscription.objects.select_for_update()
        .filter(
            batch=batch,
            plan_type=PlanType.EMI,
            status=SubscriptionStatus.ACTIVE,
            lucky_id__isnull=False,
            lucky_id__status=LuckyIdStatus.ASSIGNED,
        )
        .order_by("lucky_id__lucky_number", "id")
    )


def generate_commitment(seed: str) -> str:
    """
    Legacy compatibility alias for pre-committing a reveal seed hash.

    Older tests and scripts imported this helper directly. Keep the hashing
    contract stable while the canonical flow returns the seed from
    create_lucky_draw_commit().
    """
    return hashlib.sha256((seed or "").strip().encode()).hexdigest()


@transaction.atomic
def create_lucky_draw_commit(batch: Batch):
    batch = Batch.objects.select_for_update().get(pk=batch.pk)

    if batch.status == BatchStatus.DRAFT:
        raise ValidationError("Batch must not be DRAFT before draw commitment is created.")

    if batch.status in (
        BatchStatus.LOCKED,
        BatchStatus.DRAW_COMMITTED,
        BatchStatus.DRAW_COMPLETED,
    ):
        raise ValidationError(
            "This batch uses coordinated draw flow. Use commit-draw and execute-draw instead of legacy draw-commit."
        )

    if batch.status in (
        BatchStatus.COMPLETED,
        BatchStatus.CANCELLED,
    ):
        raise ValidationError("Terminal batch cannot accept new draw commitments.")

    lucky_count = batch.lucky_ids.count()
    if lucky_count != batch.total_slots:
        raise ValidationError(
            f"Batch Lucky IDs are incomplete. Expected {batch.total_slots}, found {lucky_count}."
        )

    next_draw_month = batch.lucky_draws.count() + 1

    if next_draw_month > batch.duration_months:
        raise ValidationError("All scheduled draw months for this batch are already committed.")

    if LuckyDraw.objects.filter(batch=batch, draw_month=next_draw_month).exists():
        raise ValidationError("Draw commitment already exists for this batch month.")

    secret_seed = get_random_string(64)
    committed_hash = generate_commitment(secret_seed)

    draw = LuckyDraw.objects.create(
        batch=batch,
        committed_hash=committed_hash,
        draw_date=timezone.now(),
        draw_month=next_draw_month,
        is_revealed=False,
        waiver_scope=WAIVER_SCOPE_FUTURE_ONLY,
    )

    AuditLog.objects.create(
        action_type=getattr(
            AuditLog.ActionType,
            "DRAW_COMMITTED",
            AuditLog.ActionType.DRAW_EXECUTED,
        ),
        model_name="LuckyDraw",
        object_id=draw.id,
        metadata={
            "batch_id": batch.id,
            "batch_code": batch.batch_code,
            "draw_month": draw.draw_month,
            "committed_hash": committed_hash,
        },
    )
    append_business_event(
        event_type=BusinessEventType.DRAW_COMMITTED,
        source_module="subscriptions.services.lucky_draw_service.create_lucky_draw_commit",
        actor_user=None,
        batch=batch,
        payload={
            "draw_id": draw.id,
            "draw_month": draw.draw_month,
            "committed_hash": committed_hash,
        },
    )
    finance_logger.info(
        "finance.draw_committed",
        extra={
            "batch_id": batch.id,
            "draw_id": draw.id,
            "draw_month": draw.draw_month,
            "committed_hash": committed_hash,
        },
    )
    return draw, secret_seed


@transaction.atomic
def reveal_and_execute_draw(draw_id: int, revealed_seed: str, performed_by=None):
    # PostgreSQL rejects FOR UPDATE on nullable OUTER JOIN sides. Lock only the draw row.
    draw = (
        LuckyDraw.objects.select_for_update(of=("self",))
        .select_related("batch", "winner_lucky_id", "winner_subscription", "winner_subscription__customer")
        .get(pk=draw_id)
    )

    if draw.is_revealed:
        winner_lucky_id = draw.winner_lucky_id
        winner_subscription = draw.winner_subscription
        if not winner_lucky_id or not winner_subscription:
            raise ValidationError("Draw is revealed but winner linkage is inconsistent.")
        return {
            "id": draw.id,
            "batch_id": draw.batch_id,
            "batch_code": draw.batch.batch_code,
            "draw_month": draw.draw_month,
            "committed_hash": draw.committed_hash,
            "is_revealed": draw.is_revealed,
            "revealed_at": draw.revealed_at,
            "winner_lucky_id": winner_lucky_id.id,
            "winner_lucky_number": winner_lucky_id.lucky_number,
            "winner_subscription_id": winner_subscription.id,
            "winner_subscription_number": _subscription_ref(winner_subscription),
            "winner_customer_name": winner_subscription.customer.name,
            "waiver_applied": True,
            "waiver_scope": WAIVER_SCOPE_FUTURE_ONLY,
            "waived_emi_count": draw.waived_emi_count,
            "waived_amount": str(draw.waived_amount),
        }

    if not revealed_seed or not revealed_seed.strip():
        raise ValidationError("Reveal seed is required.")

    expected_hash = hashlib.sha256(revealed_seed.strip().encode()).hexdigest()
    if expected_hash != draw.committed_hash:
        raise ValidationError("Reveal seed does not match committed hash.")

    if draw.draw_commit_id:
        from subscriptions.services.batch_draw_coordination_service import assert_waiver_finance_ready

        assert_waiver_finance_ready()

    eligible_subscriptions = _eligible_winner_subscriptions(draw.batch)

    if not eligible_subscriptions:
        raise ValidationError("No eligible active subscriptions are available for this draw.")

    selector_hash = hashlib.sha256(
        f"{revealed_seed.strip()}::{draw.id}::{draw.draw_month}".encode()
    ).hexdigest()
    winner_index = int(selector_hash, 16) % len(eligible_subscriptions)
    winner_subscription = eligible_subscriptions[winner_index]

    if not winner_subscription.lucky_id_id:
        raise ValidationError("Winning subscription does not have a linked Lucky ID.")

    winner_lucky_id = winner_subscription.lucky_id

    reveal_time = timezone.now()
    winner_result = apply_winner_state(
        subscription=winner_subscription,
        winner_month=draw.draw_month,
        performed_by=performed_by,
        draw=draw,
        source="lucky_draw_reveal",
        emit_waiver_audit=True,
    )
    winner_subscription = winner_result["subscription"]
    winner_lucky_id = winner_result["lucky_id"]
    waived_count = winner_result["waived_emi_count"]
    waived_amount = winner_result["waived_amount"]

    draw.revealed_seed = revealed_seed.strip()
    draw.is_revealed = True
    draw.revealed_at = reveal_time
    draw.winner_lucky_id = winner_lucky_id
    draw.winner_subscription = winner_subscription
    draw.waived_emi_count = waived_count
    draw.waived_amount = waived_amount
    draw.waiver_scope = WAIVER_SCOPE_FUTURE_ONLY
    draw.save(
        update_fields=[
            "revealed_seed",
            "is_revealed",
            "revealed_at",
            "winner_lucky_id",
            "winner_subscription",
            "waived_emi_count",
            "waived_amount",
            "waiver_scope",
        ]
    )

    AuditLog.objects.create(
        action_type=getattr(
            AuditLog.ActionType,
            "DRAW_REVEALED",
            AuditLog.ActionType.DRAW_EXECUTED,
        ),
        model_name="LuckyDraw",
        object_id=draw.id,
        performed_by=performed_by,
        metadata={
            "batch_id": draw.batch_id,
            "batch_code": draw.batch.batch_code,
            "draw_month": draw.draw_month,
            "winner_lucky_id": winner_lucky_id.id,
            "winner_lucky_number": winner_lucky_id.lucky_number,
            "winner_subscription_id": winner_subscription.id,
            "winner_subscription_number": _subscription_ref(winner_subscription),
            "winner_customer_id": winner_subscription.customer_id,
            "winner_customer_name": winner_subscription.customer.name,
            "waived_emi_count": waived_count,
            "waived_amount": str(waived_amount),
            "waiver_scope": WAIVER_SCOPE_FUTURE_ONLY,
        },
    )
    append_business_event(
        event_type=BusinessEventType.WINNER_SELECTED,
        source_module="subscriptions.services.lucky_draw_service.reveal_and_execute_draw",
        actor_user=performed_by,
        customer=winner_subscription.customer,
        subscription=winner_subscription,
        batch=draw.batch,
        lucky_id=winner_lucky_id,
        payload={
            "draw_id": draw.id,
            "draw_month": draw.draw_month,
            "waived_emi_count": waived_count,
            "waived_amount": str(waived_amount),
        },
    )

    if draw.draw_commit_id:
        from subscriptions.services.batch_draw_coordination_service import (
            post_winner_operational_followup,
        )
        from subscriptions.services.batch_service import transition_batch_status

        post_winner_operational_followup(
            subscription_id=winner_subscription.id,
            performed_by=performed_by,
        )
        batch = draw.batch
        batch.refresh_from_db()
        if batch.status == BatchStatus.DRAW_COMMITTED:
            transition_batch_status(batch, BatchStatus.DRAW_COMPLETED)

    return {
        "id": draw.id,
        "batch_id": draw.batch_id,
        "batch_code": draw.batch.batch_code,
        "draw_month": draw.draw_month,
        "committed_hash": draw.committed_hash,
        "is_revealed": draw.is_revealed,
        "revealed_at": draw.revealed_at,
        "winner_lucky_id": winner_lucky_id.id,
        "winner_lucky_number": winner_lucky_id.lucky_number,
        "winner_subscription_id": winner_subscription.id,
        "winner_subscription_number": _subscription_ref(winner_subscription),
        "winner_customer_name": winner_subscription.customer.name,
        "waiver_applied": True,
        "waiver_scope": WAIVER_SCOPE_FUTURE_ONLY,
        "waived_emi_count": waived_count,
        "waived_amount": str(waived_amount),
    }
