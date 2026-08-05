"""Layer-C delta: admin settlement allocation input contract.

Manual settlement allocation matches money (a payment/receipt/movement) to a
finance account, so the create endpoint must not accept an under-specified body.
This locks that the source + account + amount are required (serializer-validated
before the matching service runs, so no fixtures needed). The settlement
mutations (allocation create/void, cashier day-close approve/reject) are all
IsAdmin + service-delegating + error-mapped — reviewed sound.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}

REQUIRED = {"source_type", "source_id", "finance_account", "matched_amount"}


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class AdminSettlementAllocationDeltaTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username="delta_settle_admin", password="x", role="ADMIN",
            phone="9990060001", is_staff=True, is_superuser=True,
        )

    def test_allocation_create_requires_source_account_and_amount(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/v1/admin/settlements/allocations/", data={}, format="json")
        self.assertEqual(resp.status_code, 400, msg=f"got {resp.status_code}: {resp.content!r}")
        body = resp.json()
        missing = REQUIRED - set(body.keys())
        self.assertEqual(missing, set(), msg=f"these required fields were not enforced: {missing} ({body})")
