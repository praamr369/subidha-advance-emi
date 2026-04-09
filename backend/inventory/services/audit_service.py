from __future__ import annotations

from subscriptions.services.audit_service import log_audit


def log_inventory_event(
    *,
    action_type,
    instance,
    performed_by=None,
    event: str,
    metadata: dict | None = None,
):
    payload = {"event": event}
    if metadata:
        payload.update(metadata)
    log_audit(
        action_type=action_type,
        instance=instance,
        performed_by=performed_by,
        metadata=payload,
    )
