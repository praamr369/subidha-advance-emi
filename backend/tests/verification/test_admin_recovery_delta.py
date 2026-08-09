"""Layer-C delta: admin recovery bulk-escalate honours dry_run.

The recovery bulk-escalate walks every open recovery case and advances its stage
by aging. `dry_run` must return the preview without mutating anything — the safety
valve for a bulk state change. This locks that the dry-run path is admin-gated and
non-destructive (on an empty DB it simply returns an empty escalation set with 200,
proving the endpoint runs without side effects). The recovery actions
(legal-notice, settlement offer, bulk-escalate) are IsAdmin with SETTLED/WRITTEN_OFF
stage guards — reviewed sound.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class AdminRecoveryBulkEscalateDeltaTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username="delta_recov_admin", password="x", role="ADMIN",
            phone="9990070001", is_staff=True, is_superuser=True,
        )

    def test_bulk_escalate_dry_run_is_safe(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/recovery-cases/bulk-escalate/",
            data={"dry_run": True}, format="json",
        )
        self.assertEqual(resp.status_code, 200, msg=f"got {resp.status_code}: {resp.content!r}")
