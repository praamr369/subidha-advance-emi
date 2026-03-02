import hashlib
import secrets
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.core.exceptions import ValidationError
from django.utils import timezone
from subscriptions.services.audit_service import log_audit


from subscriptions.services.batch_service import transition_batch_status
from subscriptions.models import (
    AuditLog,
    LuckyDraw,
    LuckyId,
    Subscription,
    Emi,
    FinancialLedger,
    LuckyIdStatus,
    SubscriptionStatus,
    EmiStatus,
    BatchStatus,
)


# ------------------------------------------------------------
# Utility
# ------------------------------------------------------------

def generate_commitment(seed: str) -> str:
    return hashlib.sha256(seed.encode()).hexdigest()


# ------------------------------------------------------------
# Step 1: Create Commitment
# ------------------------------------------------------------

@transaction.atomic
def create_lucky_draw_commit(*, batch):

    if batch.status not in [
        BatchStatus.FULL,
        BatchStatus.DRAW_IN_PROGRESS,
    ]:
        raise ValidationError("Batch not ready for draw.")

    next_month = (
        LuckyDraw.objects
        .select_for_update()
        .filter(batch=batch)
        .count() + 1
    )

    if next_month > batch.duration_months:
        raise ValidationError("All draw months already completed.")

    # Mark batch as draw in progress
    if batch.status == BatchStatus.FULL:
        transition_batch_status(batch, BatchStatus.DRAW_IN_PROGRESS)

    secret_seed = secrets.token_hex(32)
    committed_hash = generate_commitment(secret_seed)

    draw = LuckyDraw.objects.create(
        batch=batch,
        committed_hash=committed_hash,
        draw_month=next_month,
        is_revealed=False,
    )

    return draw, secret_seed


# ------------------------------------------------------------
# Step 2: Reveal + Execute Draw
# ------------------------------------------------------------

@transaction.atomic
def reveal_and_execute_draw(*, draw_id: int, revealed_seed: str):

    draw = (
        LuckyDraw.objects
        .select_for_update()
        .select_related("batch")
        .get(id=draw_id)
    )

    if draw.is_revealed:
        raise ValidationError("Draw already revealed.")

    recalculated = generate_commitment(revealed_seed)
    if recalculated != draw.committed_hash:
        raise ValidationError("Seed mismatch.")

    batch = draw.batch

    if batch.status not in [
        BatchStatus.DRAW_IN_PROGRESS,
        BatchStatus.FULL,
    ]:
        raise ValidationError("Batch not in drawable state.")

    # Deterministic Winner Selection
    combined = f"{revealed_seed}-{batch.id}-{draw.draw_month}"
    hash_value = int(hashlib.sha256(combined.encode()).hexdigest(), 16)
    winner_number = hash_value % batch.total_slots

    lucky = (
        LuckyId.objects
        .select_for_update()
        .get(batch=batch, lucky_number=winner_number)
    )

    if lucky.status != LuckyIdStatus.ASSIGNED:
        raise ValidationError("Winner Lucky ID not active.")

    subscription = (
        Subscription.objects
        .select_for_update()
        .filter(
            lucky_id=lucky,
            status=SubscriptionStatus.ACTIVE
        )
        .first()
    )

    if not subscription:
        raise ValidationError("No active subscription found for winner.")

    # --------------------------------------------------------
    # Waive Remaining EMIs
    # --------------------------------------------------------

    waived_total = waive_future_emis(
        subscription=subscription,
        draw_month=draw.draw_month
    )

    # --------------------------------------------------------
    # Update Subscription
    # --------------------------------------------------------

    subscription.status = SubscriptionStatus.WON
    subscription.winner_month = draw.draw_month
    subscription.waived_amount = waived_total
    subscription.save(
        update_fields=["status", "winner_month", "waived_amount"]
    )

    # --------------------------------------------------------
    # Update LuckyId
    # --------------------------------------------------------

    lucky.status = LuckyIdStatus.WON
    lucky.save(update_fields=["status"])

    # --------------------------------------------------------
    # Finalize Draw
    # --------------------------------------------------------

    draw.winner_lucky_id = lucky
    draw.revealed_seed = revealed_seed
    draw.is_revealed = True
    draw.draw_date = timezone.now()
    draw.save(update_fields=[
        "winner_lucky_id",
        "revealed_seed",
        "is_revealed",
        "draw_date"
    ])

    log_audit(
        action_type=AuditLog.ActionType.DRAW_EXECUTED,
        instance=draw,
        metadata={
            "batch_id": batch.id,
            "winner_lucky_number": lucky.lucky_number,
            "subscription_id": subscription.id,
            "waived_amount": str(waived_total),
            "draw_month": draw.draw_month,
        },
    )
   

    # --------------------------------------------------------
    # Batch Lifecycle Progression
    # --------------------------------------------------------

    if draw.draw_month >= batch.duration_months:
        transition_batch_status(batch, BatchStatus.COMPLETED)
    else:
        # Stay in DRAW_IN_PROGRESS
        pass

    return {
        "winner_lucky_number": lucky.lucky_number,
        "waived_amount": waived_total,
        "draw_month": draw.draw_month,
    }


# ------------------------------------------------------------
# EMI Waiver Logic
# ------------------------------------------------------------

def waive_future_emis(subscription, draw_month: int):

    emis = (
        Emi.objects
        .select_for_update()
        .filter(
            subscription=subscription,
            month_no__gt=draw_month,
            status=EmiStatus.PENDING
        )
    )

    total_waived = emis.aggregate(
        total=Sum("amount")
    )["total"] or Decimal("0.00")

    for emi in emis:
        emi.status = EmiStatus.WAIVED
        emi.save(update_fields=["status"])

        FinancialLedger.objects.create(
            emi=emi,
            amount=emi.amount,
            entry_type="EMI_WAIVER",
        )

    return total_waived