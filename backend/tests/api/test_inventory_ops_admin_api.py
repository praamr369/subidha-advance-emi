from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import create_admin_user, create_partner_user, create_product


class AdminInventoryOpsApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="inv_ops_admin", phone="9011111101")
        self.partner = create_partner_user(username="inv_ops_partner", phone="9022222202")
        self.product = create_product(name="Stock Need Product", product_code="SNP-001")

    def test_inventory_readiness_requires_admin(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/admin/inventory/readiness/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inventory_readiness_admin_returns_payload(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/inventory/readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("inventory_ready", response.data)
        self.assertIn("module_not_configured", response.data)

    def test_stock_needs_list_requires_admin(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.get("/api/v1/admin/inventory/stock-needs/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_stock_needs_post_patch_roundtrip(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            "/api/v1/admin/inventory/stock-needs/",
            {
                "product": self.product.id,
                "required_quantity": "4.000",
                "available_quantity": "1.000",
                "shortage_quantity": "3.000",
                "source_module": "GENERAL",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        need_id = response.data["id"]
        patch = self.client.patch(
            f"/api/v1/admin/inventory/stock-needs/{need_id}/",
            {"status": "IN_REVIEW"},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertEqual(patch.data["status"], "IN_REVIEW")

    def test_non_admin_cannot_create_stock_location(self):
        self.client.force_authenticate(user=self.partner)
        response = self.client.post(
            "/api/v1/inventory/locations/",
            {
                "code": "WH-NONADMIN",
                "name": "Non Admin Warehouse",
                "location_type": "WAREHOUSE",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class AdminSalesDirectSaleOpsApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="sales_ops_admin", phone="9033333303")

    def test_sales_direct_sale_list_requires_admin(self):
        partner = create_partner_user(username="sales_ops_partner", phone="9044444404")
        self.client.force_authenticate(user=partner)
        response = self.client.get("/api/v1/admin/sales/direct-sales/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sales_direct_sale_list_admin_ok(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/sales/direct-sales/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
