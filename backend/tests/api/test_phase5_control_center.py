from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import create_admin_user, create_customer_profile, create_partner_user


class Phase5ControlCenterApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="p5_admin", phone="9000020001")
        self.partner = create_partner_user(username="p5_partner", phone="9000020002")
        self.customer = create_customer_profile(name="P5 Customer", phone="9000020003")

    def test_admin_can_access_accounting_control_center(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/accounting/control-center/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("kpis", response.data)

    def test_non_admin_forbidden_for_accounting_control_center(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/admin/accounting/control-center/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_access_operations_command_center(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/operations/command-center/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("contracts_awaiting_approval", response.data)

    def test_admin_can_access_phase5_report_endpoints(self):
        self.client.force_authenticate(user=self.admin)
        endpoints = [
            "/api/v1/admin/reports/executive-summary/",
            "/api/v1/admin/reports/finance-performance/",
            "/api/v1/admin/reports/contract-performance/",
            "/api/v1/admin/reports/advance-emi-performance/",
            "/api/v1/admin/reports/rent-lease-performance/",
            "/api/v1/admin/reports/direct-sale-performance/",
            "/api/v1/admin/reports/inventory-performance/",
            "/api/v1/admin/reports/delivery-performance/",
            "/api/v1/admin/reports/customer-crm-performance/",
            "/api/v1/admin/reports/partner-performance/",
            "/api/v1/admin/reports/waiver-loss-analysis/",
            "/api/v1/admin/reports/reconciliation-analysis/",
            "/api/v1/admin/reports/overdue-aging/",
            "/api/v1/admin/reports/revenue-trend/",
            "/api/v1/admin/reports/collection-trend/",
            "/api/v1/admin/reports/product-demand-analysis/",
        ]
        for endpoint in endpoints:
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, status.HTTP_200_OK, endpoint)
            if endpoint.endswith("/executive-summary/"):
                self.assertIn("overview", response.data, endpoint)
            else:
                self.assertIn("meta", response.data, endpoint)

