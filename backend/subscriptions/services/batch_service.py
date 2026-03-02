from django.core.exceptions import ValidationError
from django.db import transaction

from subscriptions.models import Batch, BatchStatus


@transaction.atomic
def transition_batch_status(batch: Batch, new_status: str):

    allowed_transitions = {
        BatchStatus.DRAFT: [BatchStatus.OPEN],
        BatchStatus.OPEN: [BatchStatus.FULL, BatchStatus.DRAW_IN_PROGRESS],
        BatchStatus.FULL: [BatchStatus.DRAW_IN_PROGRESS],
        BatchStatus.DRAW_IN_PROGRESS: [BatchStatus.COMPLETED],
        BatchStatus.COMPLETED: [BatchStatus.CLOSED],
        BatchStatus.CLOSED: [],
    }

    if new_status not in allowed_transitions.get(batch.status, []):
        raise ValidationError(
            f"Invalid transition from {batch.status} to {new_status}"
        )

    batch.status = new_status
    batch.save(update_fields=["status"])

    return batch