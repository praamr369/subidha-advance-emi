from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from inventory.models import InventoryItem, PurchaseNeed, StockLocation, Warehouse
from tests.helpers import create_admin_user, create_cashier_user, create_product


class DirectSaleBillingWorkspaceApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin_user(username="ds_workspace_admin", phone="9808800001")
        self.cashier = create_cashier_user(username="ds_workspace_cashier", phone="9808800002")
        self.in_stock_product = create_product(
            name="Workspace In Stock Product",
            product_code="WS-IN-001",
            base_price=Decimal("2500.00"),
        )
        self.out_stock_product = create_product(
            name="Workspace Out Stock Product",
            product_code="WS-OUT-001",
            base_price=Decimal("1999.00"),
        )
        self.stock_location = StockLocation.objects.create(code="DS-BILL", name="Direct Sale Billing")
        self.warehouse = Warehouse.objects.create(code="DS-WH", name="Direct Sale WH", stock_location=self.stock_location)
        InventoryItem.objects.create(product=self.in_stock_product, opening_stock_qty=Decimal("7.000"))
        InventoryItem.objects.create(product=self.out_stock_product, opening_stock_qty=Decimal("0.000"))

    def test_admin_product_search_returns_in_and_out_stock(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/admin/billing/products/search/", {"q": "Workspace"})
        self.assertEqual(response.status_code, 200, response.data)
        names = {row["name"] for row in response.data["results"]}
        self.assertIn(self.in_stock_product.name, names)
        self.assertIn(self.out_stock_product.name, names)
        out_row = next(row for row in response.data["results"] if row["id"] == self.out_stock_product.id)
        self.assertEqual(out_row["inventory_status"]["is_in_stock"], False)

    def test_cashier_search_does_not_expose_admin_only_fields(self):
        self.client.force_authenticate(self.cashier)
        response = self.client.get("/api/v1/cashier/billing/products/search/", {"q": "Workspace"})
        self.assertEqual(response.status_code, 200, response.data)
        row = response.data["results"][0]
        self.assertNotIn("lifecycle_status", row)

    def test_preview_out_of_stock_contains_requirement_warning(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/admin/direct-sales/preview/",
            {
                "lines": [
                    {
                        "product_id": self.out_stock_product.id,
                        "quantity": "2.000",
                        "unit_price": "1999.00",
                        "discount_amount": "0.00",
                        "tax_rate": "0.00",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["stock_warnings"])
        self.assertEqual(response.data["inventory_requirements_preview"][0]["source_module"], "DIRECT_SALE")

    def test_admin_inventory_requirements_endpoint_is_admin_only(self):
        PurchaseNeed.objects.create(
            product=self.out_stock_product,
            warehouse=self.warehouse,
            required_quantity=Decimal("2.000"),
            available_quantity=Decimal("0.000"),
            shortage_quantity=Decimal("2.000"),
            source_module="DIRECT_SALE",
            source_object_id="test",
        )
        self.client.force_authenticate(self.cashier)
        cashier_response = self.client.get("/api/v1/admin/inventory/requirements/")
        self.assertEqual(cashier_response.status_code, 403)

    def test_out_of_stock_direct_sale_creates_requirement(self):
        self.client.force_authenticate(self.admin)
        create_response = self.client.post(
            "/api/v1/billing/direct-sales/",
            {
                "sale_date": "2026-05-01",
                "tax_mode": "NON_GST",
                "subtotal": "1999.00",
                "discount_total": "0.00",
                "taxable_total": "1999.00",
                "tax_total": "0.00",
                "grand_total": "1999.00",
                "received_total": "0.00",
                "balance_total": "1999.00",
                "customer_name_snapshot": "Walk In Customer",
                "customer_phone_snapshot": "9808800099",
                "lines": [
                    {
                        "product": self.out_stock_product.id,
                        "description": "Out stock sale line",
                        "quantity": "1.000",
                        "unit_price": "1999.00",
                        "discount_amount": "0.00",
                        "taxable_value": "1999.00",
                        "gst_rate": "0.00",
                        "cgst_amount": "0.00",
                        "sgst_amount": "0.00",
                        "igst_amount": "0.00",
                        "line_total": "1999.00",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201, create_response.data)
        requirements = self.client.get(
            "/api/v1/admin/inventory/requirements/",
            {"source_module": "DIRECT_SALE"},
        )
        self.assertEqual(requirements.status_code, 200, requirements.data)
        self.assertGreaterEqual(requirements.data["count"], 1)

