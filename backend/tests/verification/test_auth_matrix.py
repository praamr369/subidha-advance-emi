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


# Every non-admin portal role. NONE of these may reach an IsAdmin endpoint.
_NON_ADMIN_ROLES = ("CUSTOMER", "PARTNER", "CASHIER", "VENDOR", "STAFF")


@override_settings(REST_FRAMEWORK=_RF_NO_THROTTLE)
class AuthMatrixTest(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.users = {}
        for i, role in enumerate(_NON_ADMIN_ROLES):
            cls.users[role] = User.objects.create_user(
                username=f"vmatrix_{role.lower()}", password="Verify123!", role=role,
                phone=f"999000{i:04d}",
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

    def test_admin_endpoints_reject_every_non_admin_role(self):
        # Privilege escalation: NO portal role (customer/partner/cashier/vendor/
        # staff) may get a 2xx from an IsAdmin endpoint. DRF enforces permissions
        # on the VIEW CLASS in initial(), so testing one representative path per
        # unique admin view class fully covers the permission logic while keeping
        # the sweep fast enough for a PR gate.
        seen_view = set()
        reps = []
        for ep in self.endpoints:
            if not requires_admin(ep):
                continue
            key = ep.view_cls or ep.view
            if key in seen_view:
                continue
            seen_view.add(key)
            reps.append(ep)

        failures = []
        for role in _NON_ADMIN_ROLES:
            self.client.force_authenticate(user=self.users[role])
            for ep in reps:
                resp = self.client.get(ep.path)
                # 403/404/405 mean the role was correctly blocked.
                if 200 <= resp.status_code < 300:
                    failures.append((role, resp.status_code, ep.path, ep.view))
            self.client.force_authenticate(user=None)
        self.assertEqual(
            failures, [],
            msg=f"{len(failures)} admin-only view(s) SERVED admin data to a "
                f"non-admin portal role (2xx). First 25:\n" +
                "\n".join(f"  {r:8} {s}  {p}  [{v}]" for r, s, p, v in failures[:25]),
        )
