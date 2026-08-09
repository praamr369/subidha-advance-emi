"""Layer-C delta: accounting journal-reversal capability guard.

Reversing/voiding a posted journal is the most sensitive accounting action, so it
sits behind the `accounting.reverse_entry` capability (revocable per-user) on top
of IsAdmin. This locks that guard on both journal-reversal paths so it can't be
dropped. (Posting/approve actions are IsAdmin-only by design — no capability
layer in accounting_phase2/3, which is internally consistent.)
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.capabilities import Capability, UserCapabilityOverride

_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}

REVERSAL_ENDPOINTS = [
    "/api/v1/accounting/journal-entries/1/void/",
    "/api/v1/accounting/controls/journal-groups/1/reverse/",
]


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class AccountingReversalCapabilityDeltaTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Non-superuser admin: passes IsAdmin (role) but is still subject to the
        # capability layer (superusers short-circuit user_has_capability).
        cls.admin = get_user_model().objects.create_user(
            username="delta_acct_admin", password="x", role="ADMIN", phone="9990040001",
        )
        cap, _ = Capability.objects.get_or_create(
            code="accounting.reverse_entry",
            defaults={"label": "Reverse journal entries", "is_active": True},
        )
        UserCapabilityOverride.objects.create(user=cls.admin, capability=cap, is_allowed=False)

    def test_revoked_capability_blocks_journal_reversal(self):
        self.client.force_authenticate(user=self.admin)
        for path in REVERSAL_ENDPOINTS:
            resp = self.client.post(path, data={}, format="json")
            self.assertEqual(
                resp.status_code, 403,
                msg=f"{path} did not enforce accounting.reverse_entry (got {resp.status_code})",
            )
