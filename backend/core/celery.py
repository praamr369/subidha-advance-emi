from __future__ import annotations

import logging
import os

from celery import Celery
from celery.signals import task_failure

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings.development")

app = Celery("subidha_core")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

logger = logging.getLogger("celery.errors")

# Traceback tail kept on the audit row. Enough to identify the failing frame
# without turning audit_logs into a log store.
_TRACEBACK_CHARS = 4000


def _record_task_failure_audit(*, task_name: str, task_id: str | None, exception) -> None:
    """Persist a task failure to AuditLog so it is visible in the admin UI.

    Console logging alone only reaches journald, where nobody looks until
    something has already gone wrong. This makes failed bridge-posting and
    reconciliation runs queryable alongside every other audited action.

    Deliberately best-effort: a failure here must never mask the task failure
    we are reporting, so every error is swallowed after being logged.
    """
    try:
        import traceback

        from django.db import connection, transaction

        from audit.models import AuditLog

        # A task that died mid-transaction leaves the connection needing
        # rollback; writing on it would raise. The task's own atomic block has
        # already unwound by the time task_failure fires, but an outer atomic
        # (eager mode in tests, or a wrapping command) may still be broken.
        if connection.in_atomic_block and connection.needs_rollback:
            logger.warning(
                "Skipping AuditLog write for failed task %s: connection needs rollback",
                task_name,
            )
            return

        tb = "".join(
            traceback.format_exception(type(exception), exception, exception.__traceback__)
        )

        # Task args are intentionally not recorded: they routinely carry
        # customer and payment identifiers, and audit_logs is broadly readable.
        with transaction.atomic():
            AuditLog.objects.create(
                action_type=AuditLog.ActionType.BACKGROUND_TASK_FAILED,
                model_name="CeleryTask",
                object_id=0,
                performed_by=None,
                metadata={
                    "task_name": task_name,
                    "task_id": task_id or "",
                    "exception_type": type(exception).__name__,
                    "exception": str(exception)[:1000],
                    "traceback": tb[-_TRACEBACK_CHARS:],
                },
            )
    except Exception:  # noqa: BLE001 - never let reporting break on a failure path
        logger.exception("Failed to record Celery task failure to AuditLog")


@task_failure.connect
def log_task_failure(sender=None, task_id=None, exception=None, traceback=None, **kwargs):
    task_name = sender.name if sender else "unknown"
    logger.error(
        "Celery task %s [%s] failed: %s",
        task_name,
        task_id,
        exception,
        exc_info=exception,
    )
    if exception is not None:
        _record_task_failure_audit(
            task_name=task_name,
            task_id=task_id,
            exception=exception,
        )
