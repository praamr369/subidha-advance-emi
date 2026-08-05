"""Layer-C delta: business-setup reset requires the business_setup.reset capability.

Resetting business configuration is destructive, so both reset-execute endpoints sit
behind the `business_setup.reset` capability (revocable per-user) on top of IsAdmin.
This locks that guard on both reset paths.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.capabilities import Capability, UserCapabilityOverride

_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}

RESET_ENDPOINTS = [
    "/api/v1/admin/business-setup/reset/",
    "/api/v1/admin/business-setup/reset-v2/",
]


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class AdminBusinessSetupResetDeltaTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username="delta_bsetup_admin", password="x", role="ADMIN", phone="9990090001",
        )
        cap, _ = Capability.objects.get_or_create(
            code="business_setup.reset",
            defaults={"label": "Reset business setup", "is_active": True},
        )
        UserCapabilityOverride.objects.create(user=cls.admin, capability=cap, is_allowed=False)

    def test_revoked_capability_blocks_reset(self):
        self.client.force_authenticate(user=self.admin)
        for path in RESET_ENDPOINTS:
            resp = self.client.post(path, data={}, format="json")
            self.assertEqual(
                resp.status_code, 403,
                msg=f"{path} did not enforce business_setup.reset (got {resp.status_code})",
            )
