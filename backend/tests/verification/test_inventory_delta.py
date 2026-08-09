"""Layer-C delta: stock adjustment posting requires the inventory.adjust capability.

The inventory group is all IsAdmin (AdminInventoryModelViewSet, Layer B). Stock
adjustments change on-hand quantities and valuation (they feed the books), so the
StockAdjustmentViewSet approve/post/set-line-costs actions sit behind the
`inventory.adjust` capability (revocable per-user) on top of IsAdmin. This locks
that guard on the post (finalize) path.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.capabilities import Capability, UserCapabilityOverride

_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class InventoryAdjustmentDeltaTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username="delta_inv_admin", password="x", role="ADMIN", phone="9990120001",
        )
        cap, _ = Capability.objects.get_or_create(
            code="inventory.adjust",
            defaults={"label": "Adjust inventory", "is_active": True},
        )
        UserCapabilityOverride.objects.create(user=cls.admin, capability=cap, is_allowed=False)

    def test_revoked_capability_blocks_adjustment_post(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/v1/inventory/stock-adjustments/1/post/", data={}, format="json")
        self.assertEqual(
            resp.status_code, 403,
            msg=f"stock-adjustment post did not enforce inventory.adjust (got {resp.status_code})",
        )
