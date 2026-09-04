"""Background task failures must land in AuditLog, not only in the console.

Regression guard for the task_failure handler in core.celery: console logging
reaches journald only, so a failed bridge-posting or reconciliation run was
invisible from the admin UI.
"""
from unittest.mock import patch

from django.test import TestCase

from audit.models import AuditLog
from core.celery import log_task_failure


class _FakeSender:
    def __init__(self, name):
        self.name = name


def _raise(exc):
    """Return exc with a real __traceback__ attached."""
    try:
        raise exc
    except type(exc) as caught:
        return caught


class CeleryTaskFailureAuditTests(TestCase):
    def test_task_failure_writes_audit_log(self):
        exc = _raise(ValueError("bridge posting blew up"))

        log_task_failure(
            sender=_FakeSender("accounting.tasks.post_bridge_entries"),
            task_id="abc-123",
            exception=exc,
        )

        entry = AuditLog.objects.get(
            action_type=AuditLog.ActionType.BACKGROUND_TASK_FAILED
        )
        self.assertEqual(entry.model_name, "CeleryTask")
        self.assertEqual(entry.object_id, 0)
        self.assertIsNone(entry.performed_by)
        self.assertEqual(
            entry.metadata["task_name"], "accounting.tasks.post_bridge_entries"
        )
        self.assertEqual(entry.metadata["task_id"], "abc-123")
        self.assertEqual(entry.metadata["exception_type"], "ValueError")
        self.assertEqual(entry.metadata["exception"], "bridge posting blew up")
        self.assertIn("ValueError", entry.metadata["traceback"])

    def test_missing_sender_still_records(self):
        log_task_failure(
            sender=None,
            task_id="no-sender",
            exception=_raise(RuntimeError("boom")),
        )

        entry = AuditLog.objects.get(
            action_type=AuditLog.ActionType.BACKGROUND_TASK_FAILED
        )
        self.assertEqual(entry.metadata["task_name"], "unknown")

    def test_no_exception_records_nothing(self):
        log_task_failure(sender=_FakeSender("some.task"), task_id="x", exception=None)

        self.assertFalse(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.BACKGROUND_TASK_FAILED
            ).exists()
        )

    def test_audit_write_failure_never_masks_task_failure(self):
        """The reporting path is best-effort: a broken AuditLog must not raise."""
        with patch(
            "audit.models.AuditLog.objects.create",
            side_effect=RuntimeError("audit table is gone"),
        ):
            log_task_failure(
                sender=_FakeSender("some.task"),
                task_id="y",
                exception=_raise(ValueError("original failure")),
            )

        self.assertFalse(
            AuditLog.objects.filter(
                action_type=AuditLog.ActionType.BACKGROUND_TASK_FAILED
            ).exists()
        )

    def test_long_traceback_is_truncated(self):
        exc = _raise(ValueError("x" * 5000))

        log_task_failure(sender=_FakeSender("t"), task_id="z", exception=exc)

        entry = AuditLog.objects.get(
            action_type=AuditLog.ActionType.BACKGROUND_TASK_FAILED
        )
        self.assertLessEqual(len(entry.metadata["exception"]), 1000)
        self.assertLessEqual(len(entry.metadata["traceback"]), 4000)
