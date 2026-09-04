"""Throttles for unauthenticated public endpoints.

Most public views are read-only GETs, where the global anon rate (120/minute)
is the right shape — they are cheap, cacheable, and abuse costs the attacker as
much as us.

Writes are different. A public write creates a database row and, for leads,
lands in a human worklist. The global anon rate allows 7,200 submissions per
hour per IP, which is not a limit in any practical sense: it would let a single
source bury the CRM pipeline in junk faster than anyone could triage it.
"""
from rest_framework.throttling import AnonRateThrottle


class PublicLeadThrottle(AnonRateThrottle):
    """Rate-limit unauthenticated lead submission.

    Scoped separately from `anon` so tightening it cannot slow down the public
    catalogue, which shares the same anonymous audience.
    """

    scope = "public_lead"
