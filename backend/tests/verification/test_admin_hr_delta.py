"""Layer-C delta: HR staff mutations specify identity + action.

admin_hr (staff CRUD, leave, attendance, documents, expense claims) is IsAdmin via
_AdminBase and delegates to the HR workspace/workforce services. This locks two
input invariants: creating staff requires a phone (identity), and a status change
must name the action (both pure-serializer, no fixtures).
"""
from django.test import SimpleTestCase

from api.v1.views.admin_hr import HrStaffCreateSerializer, HrStaffStatusSerializer


class AdminHrDeltaTest(SimpleTestCase):
    def test_staff_create_requires_phone(self):
        self.assertTrue(HrStaffCreateSerializer().fields["phone"].required)

    def test_staff_status_requires_action(self):
        self.assertTrue(HrStaffStatusSerializer().fields["action"].required)
