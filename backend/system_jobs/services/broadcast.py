from __future__ import annotations

from accounts.models import User, UserRole

from system_jobs.models import SystemJobLog
from system_jobs.services.notifications import emit_notification


def notify_all_active_admins(
    *,
    module: str,
    title: str,
    body: str,
    dedupe_prefix: str,
    payload: dict | None = None,
    source_job: SystemJobLog | None = None,
) -> int:
    """Create one deduplicated in-app notification per active admin user."""
    payload = payload or {}
    created = 0
    for user in User.objects.filter(role=UserRole.ADMIN, is_active=True).order_by("id"):
        dedupe_key = f"{dedupe_prefix}:u{user.id}"
        _notif, was_created = emit_notification(
            module=module,
            title=title,
            body=body,
            payload=payload,
            recipient=user,
            audience="",
            dedupe_key=dedupe_key,
            source_job=source_job,
        )
        if was_created:
            created += 1
    return created
