import hashlib

from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import BatchStatus, LuckyDraw, LuckyId, LuckyIdStatus
from tests.helpers import create_admin_user, create_batch


class AdminBatchTransitionTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(
            username="admin_batch_transition",
            phone="9306400001",
        )
        self.client.force_authenticate(user=self.admin)

    def _seed_lucky_ids(self, *, batch, available_count=0):
        LuckyId.objects.filter(batch=batch).update(status=LuckyIdStatus.ASSIGNED)

        if available_count > 0:
            available_ids = list(
                LuckyId.objects.filter(batch=batch)
                .order_by("lucky_number")
                .values_list("id", flat=True)[:available_count]
            )
            LuckyId.objects.filter(id__in=available_ids).update(
                status=LuckyIdStatus.AVAILABLE
            )

    def _status_error_text(self, response):
        status_value = response.data["status"]
        if isinstance(status_value, list):
            return str(status_value[0])
        return str(status_value)

    def test_transition_status_rejects_stale_batch_status_tokens(self):
        batch = create_batch(status=BatchStatus.OPEN)

        for stale_status in ["ACTIVE", "CANCELLED"]:
            with self.subTest(stale_status=stale_status):
                response = self.client.post(
                    f"/api/v1/admin/batches/{batch.id}/transition-status/",
                    {"status": stale_status},
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(
                    "not a valid choice",
                    str(response.data["status"][0]),
                )

    def test_transition_status_requires_sold_out_full_batch_before_full(self):
        batch = create_batch(status=BatchStatus.OPEN)
        self._seed_lucky_ids(batch=batch, available_count=1)

        response = self.client.post(
            f"/api/v1/admin/batches/{batch.id}/transition-status/",
            {"status": BatchStatus.FULL},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "no Lucky IDs remain available",
            self._status_error_text(response),
        )
        batch.refresh_from_db()
        self.assertEqual(batch.status, BatchStatus.OPEN)

    def test_transition_status_supports_open_full_draw_in_progress_sequence(self):
        batch = create_batch(status=BatchStatus.OPEN)
        self._seed_lucky_ids(batch=batch, available_count=0)

        full_response = self.client.post(
            f"/api/v1/admin/batches/{batch.id}/transition-status/",
            {"status": BatchStatus.FULL},
            format="json",
        )

        self.assertEqual(full_response.status_code, status.HTTP_200_OK)
        batch.refresh_from_db()
        self.assertEqual(batch.status, BatchStatus.FULL)

        draw_response = self.client.post(
            f"/api/v1/admin/batches/{batch.id}/transition-status/",
            {"status": BatchStatus.DRAW_IN_PROGRESS},
            format="json",
        )

        self.assertEqual(draw_response.status_code, status.HTTP_200_OK)
        batch.refresh_from_db()
        self.assertEqual(batch.status, BatchStatus.DRAW_IN_PROGRESS)

    def test_transition_status_requires_draw_record_before_completion_then_allows_close(self):
        batch = create_batch(status=BatchStatus.DRAW_IN_PROGRESS)
        self._seed_lucky_ids(batch=batch, available_count=0)

        missing_draw_response = self.client.post(
            f"/api/v1/admin/batches/{batch.id}/transition-status/",
            {"status": BatchStatus.COMPLETED},
            format="json",
        )

        self.assertEqual(
            missing_draw_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn(
            "after at least one draw record exists",
            self._status_error_text(missing_draw_response),
        )

        LuckyDraw.objects.create(
            batch=batch,
            committed_hash=hashlib.sha256(b"batch-transition-seed").hexdigest(),
            draw_month=1,
        )

        completed_response = self.client.post(
            f"/api/v1/admin/batches/{batch.id}/transition-status/",
            {"status": BatchStatus.COMPLETED},
            format="json",
        )

        self.assertEqual(completed_response.status_code, status.HTTP_200_OK)
        batch.refresh_from_db()
        self.assertEqual(batch.status, BatchStatus.COMPLETED)

        closed_response = self.client.post(
            f"/api/v1/admin/batches/{batch.id}/transition-status/",
            {"status": BatchStatus.CLOSED},
            format="json",
        )

        self.assertEqual(closed_response.status_code, status.HTTP_200_OK)
        batch.refresh_from_db()
        self.assertEqual(batch.status, BatchStatus.CLOSED)
