from django.core.exceptions import ValidationError
from django.db import transaction

from subscriptions.models import Batch, BatchStatus


BATCH_STATUS_TRANSITIONS = {
    BatchStatus.DRAFT: (BatchStatus.OPEN,),
    BatchStatus.OPEN: (BatchStatus.FULL, BatchStatus.DRAW_IN_PROGRESS),
    BatchStatus.FULL: (
        BatchStatus.DRAW_IN_PROGRESS,
        BatchStatus.READY_TO_LOCK,
        BatchStatus.LOCKED,
    ),
    BatchStatus.READY_TO_LOCK: (BatchStatus.LOCKED,),
    BatchStatus.LOCKED: (BatchStatus.DRAW_COMMITTED,),
    BatchStatus.DRAW_COMMITTED: (BatchStatus.DRAW_COMPLETED,),
    BatchStatus.DRAW_COMPLETED: (BatchStatus.COMPLETED,),
    BatchStatus.DRAW_IN_PROGRESS: (BatchStatus.COMPLETED,),
    BatchStatus.COMPLETED: (BatchStatus.CLOSED,),
    BatchStatus.CLOSED: (),
    BatchStatus.CANCELLED: (),
}


@transaction.atomic
def transition_batch_status(batch: Batch, new_status: str):
    if new_status not in BATCH_STATUS_TRANSITIONS.get(batch.status, ()):
        raise ValidationError(
            f"Invalid transition from {batch.status} to {new_status}"
        )

    batch.status = new_status
    batch.save(update_fields=["status"])

    return batch
