"""Layer-B: base ViewSet auth contracts (verify the shared bases once).

Hundreds of admin ViewSets inherit their permission_classes from a handful of
base classes. Asserting each base declares `IsAdmin` guarantees every present and
future subclass is admin-gated by inheritance (unless it deliberately overrides
permission_classes — which the Layer-A auth matrix would then catch per-endpoint).
"""
from django.test import SimpleTestCase

from api.v1.permissions import IsAdmin
from api.v1.views.accounting import AdminAccountingModelViewSet
from api.v1.views.accounting_phase2 import AdminAccountingPhase2ViewSet
from api.v1.views.accounting_phase3 import AdminAccountingPhase3ViewSet
from api.v1.views.admin_resources import (
    AdminOnlyModelViewSet,
    SubscriptionAdminViewSet,
)
from api.v1.views.billing import AdminBillingModelViewSet
from api.v1.views.inventory import AdminInventoryModelViewSet
from api.v1.views.paginated_registers import PaginatedSubscriptionAdminViewSet

ADMIN_BASE_VIEWSETS = [
    AdminOnlyModelViewSet,
    SubscriptionAdminViewSet,
    PaginatedSubscriptionAdminViewSet,
    AdminAccountingModelViewSet,
    AdminAccountingPhase2ViewSet,
    AdminAccountingPhase3ViewSet,
    AdminInventoryModelViewSet,
    AdminBillingModelViewSet,
]


class BaseViewSetAuthContractTest(SimpleTestCase):
    def test_admin_bases_declare_is_admin(self):
        failures = []
        for cls in ADMIN_BASE_VIEWSETS:
            perms = tuple(getattr(cls, "permission_classes", ()) or ())
            if not any(p is IsAdmin or getattr(p, "__name__", "") == "IsAdmin" for p in perms):
                failures.append(
                    f"{cls.__module__}.{cls.__name__}: permission_classes="
                    f"{[getattr(p, '__name__', p) for p in perms]} is missing IsAdmin"
                )
        self.assertEqual(
            failures, [],
            msg="Admin base ViewSet(s) not gated by IsAdmin:\n" + "\n".join(failures),
        )
