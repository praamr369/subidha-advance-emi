"""Layer-C delta: opening-stock write requires the inventory.opening_stock capability.

Opening-stock entry sets initial inventory quantities/values (it feeds the books), so
all admin_opening_stock views use CapabilityRequiredMixin with
required_capability_code = "inventory.opening_stock" (revocable per-user) on top of
IsAdmin. This locks that guard on the destructive bulk-apply path.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.capabilities import Capability, UserCapabilityOverride

_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class AdminOpeningStockDeltaTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username="delta_openstock_admin", password="x", role="ADMIN", phone="9990100001",
        )
        cap, _ = Capability.objects.get_or_create(
            code="inventory.opening_stock",
            defaults={"label": "Manage opening stock", "is_active": True},
        )
        UserCapabilityOverride.objects.create(user=cls.admin, capability=cap, is_allowed=False)

    def test_revoked_capability_blocks_bulk_apply(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            "/api/v1/admin/inventory/opening-stock/import/apply/", data={}, format="json"
        )
        self.assertEqual(
            resp.status_code, 403,
            msg=f"opening-stock bulk-apply did not enforce inventory.opening_stock (got {resp.status_code})",
        )
