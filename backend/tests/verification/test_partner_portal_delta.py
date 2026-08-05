"""Layer-C delta: partner portal is uniformly partner-gated + owner-scoped.

The partner portal's defining rule is tenancy: a partner sees only their own data.
Every view enforces it two ways — the IsPartner gate (proven here across the whole
/partner/ surface) and per-partner queryset scoping (`.filter(partner=request.user)`
/ detail `.filter(partner=partner, pk=pk)`, confirmed by review). This locks the
gate half so a new partner endpoint can't ship without partner gating.
"""
from django.test import SimpleTestCase

from tests.verification.url_walker import iter_api_endpoints

PARTNER_GATES = {"IsPartner", "IsPartnerOrAdmin"}


class PartnerPortalGateDeltaTest(SimpleTestCase):
    def test_every_partner_endpoint_is_partner_gated(self):
        ungated = []
        seen = 0
        for ep in iter_api_endpoints():
            if not ep.path.startswith("/api/v1/partner/"):
                continue
            seen += 1
            if not (PARTNER_GATES & set(ep.perms)):
                ungated.append((ep.path, tuple(ep.perms), ep.view))
        self.assertGreater(seen, 0, "walker found no /partner/ endpoints")
        self.assertEqual(
            ungated, [],
            msg="Partner endpoint(s) missing a partner gate (IsPartner/IsPartnerOrAdmin):\n"
                + "\n".join(f"  {p}  {perms}  [{v}]" for p, perms, v in ungated),
        )
