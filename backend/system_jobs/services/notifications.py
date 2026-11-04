from __future__ import annotations

from typing import Any
from django.db import transaction

from system_jobs.models import Notification, SystemJobLog


def _sanitize_json_payload(data: Any) -> Any:
    if isinstance(data, dict):
        return {str(k): _sanitize_json_payload(v) for k, v in data.items()}
    if isinstance(data, (list, tuple, set)):
        return [_sanitize_json_payload(v) for v in data]
    if hasattr(data, "isoformat"):
        return data.isoformat()
    if type(data).__name__ == "Decimal":
        return str(data)
    if hasattr(data, "hex"):
        return str(data)
    return data


@transaction.atomic
def emit_notification(
    *,
    module: str,
    title: str,
    body: str = "",
    payload: dict | None = None,
    recipient=None,
    audience: str = "",
    dedupe_key: str | None = None,
    source_job: SystemJobLog | None = None,
) -> tuple[Notification, bool]:
    """
    Create a user-visible notification. Optional dedupe_key prevents duplicates.
    Returns (notification, created).
    """
    payload = _sanitize_json_payload(payload or {})
    if dedupe_key:
        dedupe_key = str(dedupe_key).strip()[:220]
        existing = Notification.objects.filter(dedupe_key=dedupe_key).first()
        if existing:
            return existing, False
        return (
            Notification.objects.create(
                recipient=recipient,
                audience=audience or "",
                module=module,
                title=title,
                body=body,
                payload=payload,
                dedupe_key=dedupe_key,
                source_job=source_job,
            ),
            True,
        )
    return (
        Notification.objects.create(
            recipient=recipient,
            audience=audience or "",
            module=module,
            title=title,
            body=body,
            payload=payload,
            dedupe_key=None,
            source_job=source_job,
        ),
        True,
    )


def notify_admins_of_job(*, job: SystemJobLog, title: str, body: str, module: str = "system") -> None:
    from system_jobs.services.broadcast import notify_all_active_admins

    notify_all_active_admins(
        module=module,
        title=title,
        body=body,
        dedupe_prefix=f"{job.idempotency_key}:admin-fail",
        source_job=job,
        payload={"job_type": job.job_type, "status": job.status},
    )
