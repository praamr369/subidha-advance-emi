"""Layer-A: no-500 smoke over every GET endpoint.

As an admin, GET every buildable GET endpoint against an empty test DB and assert
it does not raise a 500. 200/302/400/403/404/405 are all acceptable — we are only
catching *crashes* (import errors, AttributeErrors, unguarded None access) like
the `direct_sale.customer_name` bug this project already hit. It exercises the
handler on empty data, which is exactly where such bugs surface.

Known pre-existing crashes are listed in `KNOWN_500` with a reason so the gate is
GREEN and any NEW crash fails the build. Shrink `KNOWN_500` over time.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from tests.verification.url_walker import iter_api_endpoints

_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}

# path -> reason. Populate ONLY with confirmed pre-existing crashes to keep the
# gate green; each entry is tech debt to fix and remove. Currently empty — the
# whole GET surface returns <500 on an empty DB.
KNOWN_500: dict[str, str] = {}


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class EndpointSmokeTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(
            username="vsmoke_admin", password="Verify123!", role="ADMIN",
            phone="9990000001", is_staff=True, is_superuser=True,
        )
        cls.endpoints = [e for e in iter_api_endpoints() if "GET" in e.methods]

    # Substrings uniquely identifying controlled disabled-feature 5xx responses
    # (not crashes) — safe to ignore. Each entry must be tied to a known feature
    # flag whose OFF state raises a DRF APIException with a distinctive detail;
    # do NOT use for generic upstream/backend errors.
    CONTROLLED_5XX_DETAIL_SUBSTRINGS: tuple[str, ...] = (
        "AI assistant is disabled",  # ai_assistant.permissions.AIAssistantDisabled
    )

    @classmethod
    def _controlled_disabled_response(cls, resp) -> bool:
        """True when a 5xx carries a well-known feature-flag guard message."""
        try:
            payload = resp.json()
        except Exception:
            return False
        if not isinstance(payload, dict):
            return False
        detail = str(payload.get("detail", ""))
        return any(marker in detail for marker in cls.CONTROLLED_5XX_DETAIL_SUBSTRINGS)

    def test_get_endpoints_do_not_500(self):
        self.client.force_authenticate(user=self.admin)
        failures = []
        for ep in self.endpoints:
            if ep.path in KNOWN_500:
                continue
            try:
                resp = self.client.get(ep.path)
                code = resp.status_code
            except Exception as exc:  # an unhandled exception is also a crash
                failures.append((f"EXC:{type(exc).__name__}", ep.path, ep.view))
                continue
            if code >= 500 and not self._controlled_disabled_response(resp):
                failures.append((code, ep.path, ep.view))
        self.client.force_authenticate(user=None)
        self.assertEqual(
            failures, [],
            msg=f"{len(failures)} GET endpoint(s) crashed (5xx/exception). First 40:\n" +
                "\n".join(f"  {s}  {p}  [{v}]" for s, p, v in failures[:40]),
        )
