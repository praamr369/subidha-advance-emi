from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import create_admin_user, create_customer_profile, create_customer_user, create_partner_user


class AccountingPhase2EndpointsPermissionsTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="accounting_phase2_admin",
            phone="9365000001",
        )
        self.partner = create_partner_user(
            username="accounting_phase2_partner",
            phone="9365000002",
        )
        self.customer_user = create_customer_user(
            username="accounting_phase2_customer",
            phone="7365000001",
        )
        create_customer_profile(
            user=self.customer_user,
            name="Accounting Phase2 Customer",
            phone="7365000001",
        )

    def test_non_admin_roles_cannot_access_phase2_accounting_endpoints(self):
        endpoints = [
            "/api/v1/accounting/reports/trial-balance/",
            "/api/v1/accounting/tax-invoices/",
            "/api/v1/accounting/exports/itr-pack/",
            "/api/v1/accounting/bridges/run/",
        ]
        for user in [self.partner, self.customer_user]:
            self.client.force_authenticate(user=user)
            for endpoint in endpoints:
                response = self.client.get(endpoint) if endpoint.endswith("/") and "bridges/run" not in endpoint else self.client.post(endpoint, {}, format="json")
                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                    msg=f"Unexpected access for {user.role} on {endpoint}",
                )

    def test_admin_can_read_reports_and_create_tax_invoice(self):
        self.client.force_authenticate(user=self.admin)

        report_response = self.client.get("/api/v1/accounting/reports/trial-balance/")
        self.assertEqual(report_response.status_code, status.HTTP_200_OK, report_response.data)

        create_response = self.client.post(
            "/api/v1/accounting/tax-invoices/",
            {
                "invoice_date": "2026-04-08",
                "supplier_name": "Subidha Furniture",
                "supplier_state_code": "18",
                "recipient_name": "API GST Customer",
                "place_of_supply_state_code": "18",
                "subtotal_taxable": "100.00",
                "cgst_amount": "9.00",
                "sgst_amount": "9.00",
                "igst_amount": "0.00",
                "total_amount": "118.00",
                "lines": [
                    {
                        "description": "Furniture supply",
                        "taxable_value": "100.00",
                        "gst_rate": "0.00",
                        "cgst_amount": "9.00",
                        "sgst_amount": "9.00",
                        "igst_amount": "0.00",
                        "line_total": "118.00",
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        self.assertEqual(create_response.data["status"], "DRAFT")
