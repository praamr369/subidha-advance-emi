"""Layer-C delta: reconciliation resolve requires action + audit note.

The reconciliation control tower resolves/reopens exceptions that gate the books.
Every resolution must record an action and a note (audit trail) before the
resolution service runs. This locks that contract on the resolve path (serializer-
validated before any lookup, so no fixtures). All reconciliation views are
IsAdmin + service-delegating (resolve_item / reopen_item) — reviewed sound.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class AdminReconciliationDeltaTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username="delta_recon_admin", password="x", role="ADMIN",
            phone="9990080001", is_staff=True, is_superuser=True,
        )

    def test_resolve_requires_action_and_note(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/reconciliation/items/1/resolve/", data={}, format="json"
        )
        self.assertEqual(resp.status_code, 400, msg=f"got {resp.status_code}: {resp.content!r}")
        body = resp.json()
        self.assertIn("action", body)
        self.assertIn("note", body)
