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
# gate green; each entry is tech debt to fix and remove.
KNOWN_500: dict[str, str] = {
    # Not a crash: the deep health probe intentionally returns 503 when an
    # optional dependency (Redis/Celery/DB replica) is unavailable, which is
    # the case in the isolated test env. Shallow /health/ stays 200.
    "/api/v1/health/deep/": "deep health probe returns 503 by design when optional deps are down",
    # Incomplete feature: WorkbenchLeadFollowUpView references a CRMFollowUpTask
    # model that does not exist anywhere in the codebase (no model class, no
    # table). GET/POST both 500 (ImportError). Needs a product decision: create
    # the model + migration, or remove the endpoint. Tracked as tech debt.
    "/api/v1/admin/workbench/customer/1/lead/1/followup/": "references non-existent CRMFollowUpTask model (unfinished feature)",
}


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
            if code >= 500:
                failures.append((code, ep.path, ep.view))
        self.client.force_authenticate(user=None)
        self.assertEqual(
            failures, [],
            msg=f"{len(failures)} GET endpoint(s) crashed (5xx/exception). First 40:\n" +
                "\n".join(f"  {s}  {p}  [{v}]" for s, p, v in failures[:40]),
        )
