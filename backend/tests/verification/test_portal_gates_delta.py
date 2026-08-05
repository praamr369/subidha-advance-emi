"""Layer-C delta: every portal surface is uniformly role-gated.

Each portal's defining rule is tenancy — a portal user sees only their own data,
enforced by (a) the portal role gate and (b) per-user queryset scoping
(`.filter(<owner>=request.user)`, confirmed by review). This locks the gate half
across all four portals so a new portal endpoint can't ship under-gated (it caught
`/customer/reviews/` shipping as bare IsAuthenticated).
"""
from django.test import SimpleTestCase

from tests.verification.url_walker import iter_api_endpoints

# path prefix -> the role gates that legitimately admit that portal. `AllowAny`
# endpoints (public sub-routes) are exempt.
PORTAL_GATES = {
    "/api/v1/partner/": {"IsPartner", "IsPartnerOrAdmin"},
    "/api/v1/customer/": {"IsCustomer", "IsCustomerOrAdmin"},
    "/api/v1/vendor/": {"IsVendor", "IsVendorOrAdmin"},
    "/api/v1/staff/": {"IsStaff", "IsStaffOrAdmin"},
}


class PortalGateDeltaTest(SimpleTestCase):
    def test_every_portal_endpoint_is_role_gated(self):
        seen = 0
        ungated = []
        for ep in iter_api_endpoints():
            for prefix, gates in PORTAL_GATES.items():
                if not ep.path.startswith(prefix):
                    continue
                seen += 1
                perms = set(ep.perms)
                if not (gates & perms) and "AllowAny" not in perms:
                    ungated.append((ep.path, tuple(perms), ep.view))
        self.assertGreater(seen, 0, "walker found no portal endpoints")
        self.assertEqual(
            ungated, [],
            msg="Portal endpoint(s) missing their role gate:\n"
                + "\n".join(f"  {p}  {perms}  [{v}]" for p, perms, v in ungated),
        )
