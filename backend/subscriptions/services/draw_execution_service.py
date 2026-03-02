# subscriptions/services/draw_execution_service.py

from django.db import transaction
from django.core.exceptions import ValidationError
from subscriptions.models import (
    LuckyDraw,
    LuckyId,
    LuckyIdStatus,
)
from subscriptions.services.lucky_draw_service import (
    reveal_and_execute_draw
)


@transaction.atomic
def execute_monthly_draw(*, draw_id, revealed_seed):
    """
    Orchestrates full draw execution safely.
    """

    draw = LuckyDraw.objects.select_for_update().get(id=draw_id)

    if draw.is_revealed:
        raise ValidationError("Draw already executed.")

    batch = draw.batch

    assigned_count = LuckyId.objects.filter(
        batch=batch,
        status=LuckyIdStatus.ASSIGNED
    ).count()

    if assigned_count != batch.total_slots:
        raise ValidationError("Batch not fully subscribed.")

    result = reveal_and_execute_draw(
        draw_id=draw.id,
        revealed_seed=revealed_seed
    )

    return result