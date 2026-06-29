from __future__ import annotations

from unittest import mock

from django.test import TestCase

from reconciliation.models import ReconciliationRun, ReconciliationRunStatus
from reconciliation.services import reconciliation_runner
from reconciliation.services.reconciliation_runner import PhaseFRunRequest
from tests.helpers import create_admin_user


class ReconciliationRunnerChunkingTests(TestCase):
    def setUp(self):
        self.admin = create_admin_user(username="reconciliation_chunk_admin")

    def test_phase_f_runner_persists_progress_after_each_chunk(self):
        def first_chunk(*, run, totals):
            self.assertEqual(run.status, ReconciliationRunStatus.RUNNING)
            return {**totals, "checked": totals["checked"] + 2, "matched": totals["matched"] + 2}

        def second_chunk(*, run, totals):
            self.assertEqual(totals["checked"], 2)
            return {**totals, "checked": totals["checked"] + 3, "exceptions": totals["exceptions"] + 1, "high_risk": totals["high_risk"] + 1}

        with mock.patch.object(
            reconciliation_runner,
            "PHASE_F_CHECK_REGISTRY",
            (("FIRST", first_chunk), ("SECOND", second_chunk)),
        ):
            run = reconciliation_runner.start_and_run_phase_f(
                request=PhaseFRunRequest(scope="PHASE_F", module="CONTROL_TOWER"),
                started_by=self.admin,
            )

        run.refresh_from_db()
        self.assertEqual(run.status, ReconciliationRunStatus.COMPLETED)
        self.assertEqual(run.total_checked, 5)
        self.assertEqual(run.total_matched, 2)
        self.assertEqual(run.total_exceptions, 1)
        self.assertEqual(run.high_risk_count, 1)
        self.assertEqual(run.metadata["execution_mode"], "chunked_synchronous")
        self.assertEqual(run.metadata["completed_chunks"], ["FIRST", "SECOND"])
        self.assertEqual(run.metadata["progress"]["completed_chunks"], 2)

    def test_phase_f_runner_marks_failed_chunk_without_rolling_back_completed_chunks(self):
        def first_chunk(*, run, totals):
            return {**totals, "checked": totals["checked"] + 1, "matched": totals["matched"] + 1}

        def failed_chunk(*, run, totals):
            raise RuntimeError("controlled reconciliation test failure")

        with mock.patch.object(
            reconciliation_runner,
            "PHASE_F_CHECK_REGISTRY",
            (("FIRST", first_chunk), ("FAILED", failed_chunk)),
        ):
            with self.assertRaises(RuntimeError):
                reconciliation_runner.start_and_run_phase_f(
                    request=PhaseFRunRequest(scope="PHASE_F", module="CONTROL_TOWER"),
                    started_by=self.admin,
                )

        run = ReconciliationRun.objects.latest("id")
        self.assertEqual(run.status, ReconciliationRunStatus.FAILED)
        self.assertEqual(run.total_checked, 1)
        self.assertEqual(run.total_matched, 1)
        self.assertEqual(run.metadata["completed_chunks"], ["FIRST"])
        self.assertEqual(run.metadata["failed_chunks"][0]["chunk"], "FAILED")
        self.assertIn("controlled reconciliation test failure", run.metadata["failed_chunks"][0]["error"])
