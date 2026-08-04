"""Layer-C delta: cashier money-collection capability guard.

The three cashier collection endpoints move money, so each must honour the
`billing.collect` capability (an admin can revoke it per-cashier via a
UserCapabilityOverride). This locks that guard on all three — it caught a real
gap where `collect-advance` was missing the guard the other two had.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.capabilities import Capability, UserCapabilityOverride

_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}

COLLECTION_ENDPOINTS = [
    "/api/v1/cashier/collect-payment/",
    "/api/v1/cashier/collect-advance/",
    "/api/v1/cashier/collect-direct-sale/",
]


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class CashierCollectionCapabilityDeltaTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.cashier = get_user_model().objects.create_user(
            username="delta_cashier", password="x", role="CASHIER", phone="9990030001",
        )
        cap, _ = Capability.objects.get_or_create(
            code="billing.collect", defaults={"label": "Collect payments", "is_active": True}
        )
        # Revoke the capability for this cashier.
        UserCapabilityOverride.objects.create(user=cls.cashier, capability=cap, is_allowed=False)

    def test_revoked_capability_blocks_every_collection_endpoint(self):
        self.client.force_authenticate(user=self.cashier)
        for path in COLLECTION_ENDPOINTS:
            resp = self.client.post(path, data={}, format="json")
            self.assertEqual(
                resp.status_code, 403,
                msg=f"{path} did not enforce billing.collect (got {resp.status_code})",
            )
