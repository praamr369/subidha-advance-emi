"""Layer-C delta: admin money-reversal endpoints require a reason.

The admin reversal/void surface (reversal_center, reversal_control) is IsAdmin-only
by design (business reversals, distinct from the raw journal tool which also needs
accounting.reverse_entry). Every reversal there delegates to a service and demands
an audit reason. This locks the reason requirement on the admin receipt-void path
(serializer-validated before any lookup, so no fixtures needed).
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class AdminReversalReasonDeltaTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username="delta_rev_admin", password="x", role="ADMIN",
            phone="9990050001", is_staff=True, is_superuser=True,
        )

    def test_receipt_void_requires_a_reason(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/v1/admin/billing/receipts/1/void/", data={}, format="json")
        # Reason is required and validated before the receipt is even looked up,
        # so a missing reason is a 400 (not a 404/500).
        self.assertEqual(resp.status_code, 400, msg=f"got {resp.status_code}: {resp.content!r}")
        self.assertIn("reason", str(resp.content).lower())
