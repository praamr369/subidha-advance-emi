"""Layer-A: auth/role matrix over the whole API surface.

Instead of hand-checking auth on 2,500+ endpoints, we walk the URLconf and assert
the two highest-value invariants for every buildable endpoint:

  1. Every auth-gated endpoint REJECTS anonymous callers (401/403).
  2. Every admin-only endpoint REJECTS an authenticated non-admin (403) — no
     privilege escalation from a portal role into admin functions.

DRF checks permissions in `initial()` before method dispatch, so a GET suffices
to exercise the permission layer regardless of the endpoint's real verb.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from tests.verification.url_walker import iter_api_endpoints, requires_admin, requires_auth

# Disable throttling for the bulk sweep (role-aware throttle would 429 mid-run).
_RF_NO_THROTTLE = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {}}

# Endpoints intentionally exempt from the anon-rejection rule beyond AllowAny
# (e.g. SSE stream with a token in the query string). Keep this tiny + justified.
_ANON_ALLOWED_PATHS = {
    "/api/v1/realtime/stream/",  # EventSource cannot send auth headers; token via query
}


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class AuthMatrixTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.customer = User.objects.create_user(
            username="vmatrix_customer", password="Verify123!", role="CUSTOMER",
            phone="9990000002",
        )
        cls.endpoints = list(iter_api_endpoints())

    def test_protected_endpoints_reject_anonymous(self):
        failures = []
        for ep in self.endpoints:
            if not requires_auth(ep) or ep.path in _ANON_ALLOWED_PATHS:
                continue
            resp = self.client.get(ep.path)
            # A leak is a 2xx (data actually served). 401/403/404/301/302/405 all
            # mean the request did not reach protected data.
            if 200 <= resp.status_code < 300:
                failures.append((resp.status_code, ep.path, ep.view))
        self.assertEqual(
            failures, [],
            msg=f"{len(failures)} auth-gated endpoint(s) SERVED data to an anonymous "
                f"caller (2xx). First 25:\n" +
                "\n".join(f"  {s}  {p}  [{v}]" for s, p, v in failures[:25]),
        )

    def test_admin_endpoints_reject_non_admin(self):
        self.client.force_authenticate(user=self.customer)
        failures = []
        for ep in self.endpoints:
            if not requires_admin(ep):
                continue
            resp = self.client.get(ep.path)
            # A privilege-escalation leak is a 2xx (admin data served to a
            # non-admin). 403/404/405 mean the customer was correctly blocked.
            if 200 <= resp.status_code < 300:
                failures.append((resp.status_code, ep.path, ep.view))
        self.client.force_authenticate(user=None)
        self.assertEqual(
            failures, [],
            msg=f"{len(failures)} admin-only endpoint(s) SERVED admin data to an "
                f"authenticated CUSTOMER (2xx). First 25:\n" +
                "\n".join(f"  {s}  {p}  [{v}]" for s, p, v in failures[:25]),
        )
