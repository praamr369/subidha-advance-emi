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
