"""Role-aware baseline rate limiting.

The project previously had no ``DEFAULT_THROTTLE_CLASSES`` — only per-endpoint
scoped throttles (login, payment mutation, …). This adds a global baseline
per-user throttle whose rate depends on ``request.user.role`` so admin/staff
operations get much higher limits than partner/customer portals, while still
capping abuse. Anonymous traffic is handled separately by ``AnonRateThrottle``.

Rates live in ``settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]`` under the
scopes below, so they can be tuned per environment without code changes. A
missing/None rate for a scope disables throttling for that role (DRF default).
"""
from rest_framework.throttling import SimpleRateThrottle


class RoleAwareUserRateThrottle(SimpleRateThrottle):
    """Per-user throttle that selects its rate scope from the user's role.

    Ordering vs. endpoint-specific scoped throttles: this runs as a global
    default and is independent of them — a view that also declares e.g.
    ``PaymentMutationThrottle`` is limited by whichever bucket is hit first.
    """

    scope = "role_default"

    # accounts.UserRole -> throttle scope. Unmapped/blank roles fall back to
    # role_default.
    ROLE_SCOPES = {
        "ADMIN": "role_admin",
        "STAFF": "role_staff",
        "CASHIER": "role_cashier",
        "PARTNER": "role_partner",
        "VENDOR": "role_vendor",
        "CUSTOMER": "role_customer",
    }

    def allow_request(self, request, view):
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            # Anonymous requests are the AnonRateThrottle's job.
            return True

        self.scope = self.ROLE_SCOPES.get(getattr(user, "role", None), "role_default")
        self.rate = self.get_rate()
        if self.rate is None:
            # No rate configured for this role -> unthrottled.
            return True
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            return None
        return self.cache_format % {"scope": self.scope, "ident": user.pk}
