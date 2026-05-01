from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from billing.models import BillingInvoice, DirectSale, DirectSaleLine, ReceiptDocument
from inventory.models import InventoryItem, PurchaseNeed, StockLocation, Warehouse
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


class DirectSaleBillingWorkspaceTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="direct_sale_workspace_admin", phone="9377000011")
        self.client.force_authenticate(self.admin)
        self.customer = create_customer_profile(
            name="Direct Sale Workspace Customer",
            phone="7377000011",
        )
        self.product = create_product(
            name="Workspace Sofa Deluxe",
            product_code="WS-SOFA-001",
            base_price=Decimal("12000.00"),
        )
        self.location = StockLocation.objects.create(
            code="WS-STORE",
            name="Workspace Store",
            location_type="STORE",
        )
        self.warehouse = Warehouse.objects.create(
            code="WS-WH",
            name="Workspace Warehouse",
            stock_location=self.location,
        )
        self.inventory_item = InventoryItem.objects.create(
            product=self.product,
            sku="WS-SOFA-SKU-001",
            default_stock_location=self.location,
            opening_stock_qty=Decimal("0.000"),
            reorder_level_qty=Decimal("1.000"),
        )

    def _payload(self, **line_overrides):
        line = {
            "product": self.product.id,
            "inventory_item": self.inventory_item.id,
            "description": "Workspace sofa direct sale",
            "quantity": "2.000",
            "discount_amount": "1000.00",
            "gst_rate": None,
            "cgst_amount": "0.00",
            "sgst_amount": "0.00",
            "igst_amount": "0.00",
            "create_purchase_requirement": True,
            "requirement_quantity": "2.000",
            "requirement_note": "Order for walk-in retail bill",
        }
        line.update(line_overrides)
        return {
            "sale_date": date(2026, 5, 1),
            "customer": self.customer.id,
            "tax_mode": "NON_GST",
            "customer_name_snapshot": self.customer.name,
            "customer_phone_snapshot": self.customer.phone,
            "received_total": "0.00",
            "lines": [line],
        }

    def test_billing_product_search_finds_by_name_code_and_sku(self):
        for query in ["Workspace Sofa", "WS-SOFA-001", "WS-SOFA-SKU-001"]:
            response = self.client.get(
                "/api/v1/admin/billing/product-search/",
                {"q": query, "include_inventory": "true", "page_size": 10},
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            ids = {row["id"] for row in response.data["results"]}
            self.assertIn(self.product.id, ids)

    def test_billing_product_search_includes_inventory_fields(self):
        response = self.client.get(
            "/api/v1/admin/billing/product-search/",
            {"q": "WS-SOFA", "include_inventory": "true", "direct_sale_enabled": "true"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        row = next(item for item in response.data["results"] if item["id"] == self.product.id)
        self.assertEqual(row["inventory_item_id"], self.inventory_item.id)
        self.assertEqual(row["sku"], "WS-SOFA-SKU-001")
        self.assertEqual(row["current_stock_qty"], "0.000")
        self.assertTrue(row["stock_tracking_enabled"])
        self.assertTrue(row["delivery_stock_bridge_enabled"])
        self.assertTrue(row["inventory_ready"])

    def test_direct_sale_defaults_unit_price_and_discount_does_not_change_base_price(self):
        before_price = self.product.base_price
        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        sale = DirectSale.objects.get(pk=response.data["id"])
        line = DirectSaleLine.objects.get(direct_sale=sale)
        self.product.refresh_from_db()

        self.assertEqual(line.unit_price, before_price)
        self.assertEqual(sale.subtotal, Decimal("24000.00"))
        self.assertEqual(sale.discount_total, Decimal("1000.00"))
        self.assertEqual(sale.grand_total, Decimal("23000.00"))
        self.assertEqual(self.product.base_price, before_price)

    def test_discount_cannot_exceed_line_gross(self):
        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            self._payload(discount_amount="24001.00"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("discount_amount", str(response.data))

    def test_duplicate_submit_with_same_idempotency_key_is_safe(self):
        payload = self._payload()
        first = self.client.post(
            "/api/v1/billing/direct-sales/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="direct-sale-workspace-idem-1",
        )
        second = self.client.post(
            "/api/v1/billing/direct-sales/",
            payload,
            format="json",
            HTTP_IDEMPOTENCY_KEY="direct-sale-workspace-idem-1",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(DirectSale.objects.count(), 1)
        self.assertEqual(BillingInvoice.objects.count(), 1)
        self.assertEqual(ReceiptDocument.objects.count(), 0)
        self.assertEqual(PurchaseNeed.objects.count(), 1)

    def test_requirement_creation_during_direct_sale_creates_purchase_need_only(self):
        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            self._payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        need = PurchaseNeed.objects.get()
        self.assertEqual(need.source_module, PurchaseNeed.SourceModule.DIRECT_SALE)
        self.assertEqual(need.source_object_id, str(response.data["id"]))
        self.assertEqual(need.product_id, self.product.id)
        self.assertEqual(need.required_quantity, Decimal("2.000"))
        self.assertEqual(need.shortage_quantity, Decimal("2.000"))
        self.assertEqual(need.note, "Order for walk-in retail bill")

    def test_existing_subscription_financial_snapshot_is_unchanged(self):
        batch = create_batch(batch_code="WS-BATCH-001")
        lucky_id = create_lucky_id(batch=batch, lucky_number=37)
        subscription = create_subscription(
            customer=self.customer,
            product=self.product,
            batch=batch,
            lucky_id=lucky_id,
            partner=self.admin,
            total_amount=Decimal("12000.00"),
            monthly_amount=Decimal("800.00"),
            tenure_months=15,
        )

        response = self.client.post(
            "/api/v1/billing/direct-sales/",
            self._payload(discount_amount="2000.00"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        subscription.refresh_from_db()
        self.assertEqual(subscription.total_amount, Decimal("12000.00"))
        self.assertEqual(subscription.monthly_amount, Decimal("800.00"))
        self.assertEqual(subscription.product_id, self.product.id)

    def test_walkin_snapshot_can_create_without_customer_link(self):
        payload = self._payload()
        payload["customer"] = None
        payload["customer_mode"] = "WALK_IN"
        payload["customer_name_snapshot"] = "Walk In Snapshot User"
        payload["customer_phone_snapshot"] = "9000000001"
        payload["customer_snapshot_billing_address_line1"] = "Market Road"
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        sale = DirectSale.objects.get(pk=response.data["id"])
        self.assertIsNone(sale.customer_id)
        self.assertEqual(sale.customer_name_snapshot, "Walk In Snapshot User")
        self.assertEqual(sale.customer_snapshot_billing_address_line1, "Market Road")

    def test_new_customer_mode_creates_profile_and_links_sale(self):
        payload = self._payload()
        payload["customer"] = None
        payload["customer_mode"] = "NEW"
        payload["new_customer_name"] = "Billing New Customer"
        payload["new_customer_phone"] = "9000000011"
        payload["new_customer_email"] = "billing.new@example.com"
        payload["new_customer_billing_address_line1"] = "New Street 10"
        payload["new_customer_city"] = "Asansol"
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        sale = DirectSale.objects.select_related("customer", "customer__user").get(pk=response.data["id"])
        self.assertIsNotNone(sale.customer_id)
        self.assertEqual(sale.customer.name, "Billing New Customer")
        self.assertFalse(sale.customer.user.has_usable_password())

    def test_gst_registered_business_requires_gstin(self):
        payload = self._payload()
        payload["tax_mode"] = "GST"
        payload["customer_gst_type"] = "REGISTERED_BUSINESS"
        payload["customer_gstin"] = ""
        payload["customer_snapshot_place_of_supply"] = "WB"
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("customer_gstin", response.data)

    def test_non_gst_allows_without_gstin(self):
        payload = self._payload()
        payload["tax_mode"] = "NON_GST"
        payload["customer_gst_type"] = "UNREGISTERED_CONSUMER"
        payload["customer_gstin"] = ""
        response = self.client.post("/api/v1/billing/direct-sales/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
