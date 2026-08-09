"""Layer-C delta: PaymentReminder gating (dynamic get_permissions).

PaymentReminderViewSet gates via get_permissions() rather than a static
permission_classes: list/retrieve are IsCashierOrAdmin, and every mutation/action
(create/update/schedule/send/dispatch/cancel/retry) is IsAdmin. Because this is
dynamic, the static admin-surface-gated sweep can't see it — this test pins it so a
reminder action can never silently drop to plain IsAuthenticated. (The actions
delegate to the reminder services; reviewed sound.)
"""
from django.test import SimpleTestCase

from api.v1.permissions import IsAdmin, IsCashierOrAdmin
from api.v1.views.reminders import PaymentReminderViewSet


def _perm_types(action: str):
    view = PaymentReminderViewSet()
    view.action = action
    return {type(p) for p in view.get_permissions()}


class RemindersGatingDeltaTest(SimpleTestCase):
    def test_read_actions_are_cashier_or_admin(self):
        for action in ("list", "retrieve"):
            self.assertIn(IsCashierOrAdmin, _perm_types(action))

    def test_mutating_actions_require_admin(self):
        for action in ("create", "schedule", "dispatch_reminder", "send", "cancel", "retry"):
            self.assertIn(IsAdmin, _perm_types(action), msg=f"{action} is not IsAdmin-gated")
