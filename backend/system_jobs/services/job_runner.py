from __future__ import annotations

import traceback
from typing import Any, Callable

from django.db import IntegrityError, transaction
from django.utils import timezone

from system_jobs.models import SystemJobLog, SystemJobStatus


@transaction.atomic
def run_idempotent_job(
    *,
    idempotency_key: str,
    job_type: str,
    celery_task_id: str = "",
    body: Callable[[SystemJobLog], dict[str, Any]],
) -> tuple[SystemJobLog, dict[str, Any]]:
    """
    Run a background job body once per successful idempotency_key.

    Retries: if the last run FAILED, the same key may run again (retry_count increments).
    """
    initial = SystemJobLog.objects.select_for_update().filter(idempotency_key=idempotency_key).first()
    if initial and initial.status == SystemJobStatus.SUCCESS:
        return initial, {"skipped": True, "reason": "already_succeeded"}

    log: SystemJobLog | None = None

    if initial is not None:
        log = initial
        if log.status in (SystemJobStatus.FAILED, SystemJobStatus.RUNNING):
            log.retry_count += 1
            log.failure_reason = ""
        log.celery_task_id = celery_task_id or log.celery_task_id
        log.save(
            update_fields=[
                "retry_count",
                "failure_reason",
                "celery_task_id",
            ]
        )
    else:
        try:
            with transaction.atomic():
                log = SystemJobLog.objects.create(
                    idempotency_key=idempotency_key,
                    job_type=job_type,
                    status=SystemJobStatus.PENDING,
                    celery_task_id=celery_task_id or "",
                )
        except IntegrityError:
            log = SystemJobLog.objects.select_for_update().filter(idempotency_key=idempotency_key).first()
            if log is None:
                raise
            if log.status == SystemJobStatus.SUCCESS:
                return log, {"skipped": True, "reason": "already_succeeded"}
            if log.status != SystemJobStatus.FAILED:
                return log, {"skipped": True, "reason": "concurrent_enqueue"}
            log.retry_count += 1
            log.failure_reason = ""
            log.celery_task_id = celery_task_id or log.celery_task_id
            log.save(update_fields=["retry_count", "failure_reason", "celery_task_id"])

    assert log is not None

    log.status = SystemJobStatus.RUNNING
    log.started_at = timezone.now()
    log.finished_at = None
    log.save(update_fields=["status", "started_at", "finished_at"])

    try:
        summary = body(log) or {}
        log.status = SystemJobStatus.SUCCESS
        log.result_summary = summary
        log.finished_at = timezone.now()
        log.failure_reason = ""
        log.save(update_fields=["status", "result_summary", "finished_at", "failure_reason"])
        return log, {"skipped": False, "summary": summary}
    except Exception as exc:  # pragma: no cover - defensive
        log.status = SystemJobStatus.FAILED
        log.failure_reason = (str(exc) or repr(exc))[:8000]
        log.result_summary = {"traceback": traceback.format_exc()[-8000:]}
        log.finished_at = timezone.now()
        log.save(update_fields=["status", "failure_reason", "result_summary", "finished_at"])
        return log, {"skipped": False, "error": str(exc)}
