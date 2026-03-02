from django.utils import timezone
from subscriptions.models import AuditLog


def log_audit(
    *,
    action_type,
    instance,
    performed_by=None,
    metadata=None,
):
    """
    Centralized audit logger.
    Must be called inside existing transaction.
    """

    AuditLog.objects.create(
        action_type=action_type,
        model_name=instance.__class__.__name__,
        object_id=instance.pk,
        performed_by=performed_by,
        metadata=metadata or {},
        created_at=timezone.now(),
    )