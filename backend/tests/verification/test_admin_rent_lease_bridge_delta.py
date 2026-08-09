"""Layer-C delta: rent-lease bridge preview/execute wiring is not crossed.

The rent-lease accounting bridge exposes paired endpoints per event (deposit
collection / refund / damage / monthly demand): a *preview* that computes the
journal without posting, and an *execute* that actually posts it. A crossed wire
— a "preview" endpoint bound to an execute_* service — would silently post to the
ledger on what the operator believes is a dry run. This locks that every
PreviewView is bound to a preview_* service and every ExecuteView to an execute_*
service. (All views are IsAdmin; post() delegates to the bound service — reviewed
sound.)
"""
from django.test import SimpleTestCase

from api.v1.views import admin_rent_lease_accounting_bridge as mod

PREVIEW_VIEWS = [
    mod.AdminDepositPostingPreviewView,
    mod.AdminDepositRefundPostingPreviewView,
    mod.AdminDepositDamagePostingPreviewView,
    mod.AdminRentLeaseDemandPostingPreviewView,
]
EXECUTE_VIEWS = [
    mod.AdminDepositPostingExecuteView,
    mod.AdminDepositRefundPostingExecuteView,
    mod.AdminDepositDamagePostingExecuteView,
    mod.AdminRentLeaseDemandPostingExecuteView,
]


class RentLeaseBridgeWiringDeltaTest(SimpleTestCase):
    def test_preview_views_bind_preview_services(self):
        for view in PREVIEW_VIEWS:
            name = view.service_fn.__name__
            self.assertTrue(
                name.startswith("preview_"),
                msg=f"{view.__name__} is wired to non-preview service {name}",
            )

    def test_execute_views_bind_execute_services(self):
        for view in EXECUTE_VIEWS:
            name = view.service_fn.__name__
            self.assertTrue(
                name.startswith("execute_"),
                msg=f"{view.__name__} is wired to non-execute service {name}",
            )
