"""Layer-C systemic lock: every /admin/ endpoint is admin-gated.

The Layer-A admin matrix only exercises endpoints that *declare* IsAdmin, so an
admin endpoint mistakenly gated by bare IsAuthenticated slips through it and
becomes a privilege-escalation leak (a non-admin reaches admin functionality).
This delta review found 20 such endpoints (admin_finance_complete GL posting +
leases + deferred tax + assets, admin_pod, admin_prepayment, a crm_workbench view)
plus the earlier payables leak.

This test closes the class structurally: every `/api/v1/admin/` endpoint must carry
an admin-inclusive gate. Admin-inclusive = IsAdmin, any *OrAdmin gate,
IsInternalAdmin, or CanManageBrochures (a HasRole gate for ADMIN/CASHIER/STAFF).
"""
from django.test import SimpleTestCase

from tests.verification.url_walker import iter_api_endpoints

ADMIN_PREFIX = "/api/v1/admin/"

# The `/admin/customer/requests/online/` routes are the customer's own online-
# request views (IsCustomer) that merely sit under an /admin/customer/ path
# namespace — not admin functionality. They are correctly customer-gated.
CUSTOMER_NAMESPACE = "/api/v1/admin/customer/"

# Admin-functionality lives under more than /admin/: these prefixes are backend
# management surfaces (catalog, stock, ledgers, billing docs, manufacturing, branch
# config) that portals never call directly (they have their own /partner|customer/…
# endpoints). Every endpoint here must be admin-gated too — a leak in one of these
# is exactly the class this test found in both /admin/ (finance-complete) and /pim/.
ADMIN_FUNCTIONALITY_PREFIXES = (
    ADMIN_PREFIX,
    "/api/v1/pim/",
    "/api/v1/inventory/",
    "/api/v1/accounting/",
    "/api/v1/billing/",
    "/api/v1/manufacturing/",
    "/api/v1/branch-control/",
    "/api/v1/crm-pipeline/",
)


def _is_admin_inclusive(perms: set[str]) -> bool:
    return (
        any("Admin" in p for p in perms)  # IsAdmin, IsInternalAdmin, *OrAdmin, IsAdminAIEnabled
        or "CanManageBrochures" in perms  # HasRole: ADMIN/CASHIER/STAFF
    )


class AdminSurfaceGatedTest(SimpleTestCase):
    def test_every_admin_endpoint_is_admin_gated(self):
        leaks = []
        seen = 0
        for ep in iter_api_endpoints():
            if not ep.path.startswith(ADMIN_FUNCTIONALITY_PREFIXES):
                continue
            if ep.path.startswith(CUSTOMER_NAMESPACE):
                continue
            perms = set(ep.perms)
            if "AllowAny" in perms:
                continue
            seen += 1
            if not _is_admin_inclusive(perms):
                leaks.append((ep.path, tuple(perms), ep.view))
        self.assertGreater(seen, 0, "walker found no admin-functionality endpoints")
        self.assertEqual(
            leaks, [],
            msg=f"{len(leaks)} admin-functionality endpoint(s) are NOT admin-gated "
                f"(privilege-escalation risk):\n"
                + "\n".join(f"  {p}  {perms}  [{v}]" for p, perms, v in leaks),
        )
