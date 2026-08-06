"""Layer-C delta: admin_resources sensitive actions are capability-guarded.

admin_resources holds the big shared admin ViewSets (base CRUD is green-by-inheritance
from Layer B; the many read @actions are covered by the GET smoke). The delta worth
locking is that its money/lucky-draw mutating actions sit behind capabilities on top
of IsAdmin: payment reverse -> billing.override_allocation, collect -> billing.collect,
batch lock -> batch.lock, draw commit/complete -> draw.commit / draw.complete. This
locks the payment-reverse guard as the representative (revoked -> 403).
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.capabilities import Capability, UserCapabilityOverride

_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class AdminResourcesReverseDeltaTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username="delta_res_admin", password="x", role="ADMIN", phone="9990110001",
        )
        cap, _ = Capability.objects.get_or_create(
            code="billing.override_allocation",
            defaults={"label": "Override allocation / reverse payments", "is_active": True},
        )
        UserCapabilityOverride.objects.create(user=cls.admin, capability=cap, is_allowed=False)

    def test_revoked_capability_blocks_payment_reverse(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post("/api/v1/admin/payments/1/reverse/", data={}, format="json")
        self.assertEqual(
            resp.status_code, 403,
            msg=f"payment reverse did not enforce billing.override_allocation (got {resp.status_code})",
        )
