import hashlib

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import get_random_string

from subscriptions.models import (
    AuditLog,
    Batch,
    BatchStatus,
    LuckyDraw,
    LuckyIdStatus,
    PlanType,
    Subscription,
    SubscriptionStatus,
)
from subscriptions.services.winner_state_service import (
    WAIVER_SCOPE_FUTURE_ONLY,
    apply_winner_state,
)


def _subscription_ref(subscription: Subscription) -> str:
    return (
        getattr(subscription, "subscription_number", None)
        or getattr(subscription, "contract_reference", None)
        or f"SUB-{subscription.id}"
    )


def _eligible_winner_subscriptions(batch: Batch):
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


@transaction.atomic
def create_lucky_draw_commit(batch: Batch):
    batch = Batch.objects.select_for_update().get(pk=batch.pk)

    if batch.status == BatchStatus.DRAFT:
        raise ValidationError("Batch must not be DRAFT before draw commitment is created.")

    if batch.status == BatchStatus.COMPLETED:
        raise ValidationError("Completed batch cannot accept new draw commitments.")

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
    committed_hash = hashlib.sha256(secret_seed.encode()).hexdigest()

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

    return draw, secret_seed


@transaction.atomic
def reveal_and_execute_draw(draw_id: int, revealed_seed: str, performed_by=None):
    draw = (
        LuckyDraw.objects.select_for_update()
        .select_related("batch")
        .get(pk=draw_id)
    )

    if draw.is_revealed:
        raise ValidationError("Draw is already revealed.")

    if not revealed_seed or not revealed_seed.strip():
        raise ValidationError("Reveal seed is required.")

    expected_hash = hashlib.sha256(revealed_seed.strip().encode()).hexdigest()
    if expected_hash != draw.committed_hash:
        raise ValidationError("Reveal seed does not match committed hash.")

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
