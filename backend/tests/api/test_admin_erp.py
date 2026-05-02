from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryItem
from subscriptions.models import SubscriptionRequest
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
    create_user,
)


class AdminErpApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="erp_admin", phone="919100000001")
        self.partner_user = create_user(
            username="erp_partner",
            role="PARTNER",
            phone="919100000002",
            password="PartnerPass123!",
        )
        self.client.force_authenticate(self.admin)

    def _seed_records(self):
        customer = create_customer_profile(name="ERP Customer", phone="919100000010")
        product = create_product(name="ERP Chair", product_code="ERP-CHAIR")
        batch = create_batch(batch_code="ERPBATCH1")
        lucky = create_lucky_id(batch=batch, lucky_number=11)
        create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky)
        SubscriptionRequest.objects.create(
            requester=self.admin,
            requester_role_snapshot="ADMIN",
            customer=customer,
            product=product,
            batch=batch,
            requested_customer_name=customer.name,
            requested_customer_phone=customer.phone,
            preferred_lucky_number=44,
            requested_tenure_months_snapshot=15,
            status="SUBMITTED",
        )
        return customer

    def test_admin_erp_summary_returns_authoritative_sections(self):
        self._seed_records()
        response = self.client.get("/api/v1/admin/erp/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("today_work", response.data)
        self.assertIn("business_health", response.data)
        self.assertIn("crm_pipeline", response.data)
        self.assertIn("sales_pipeline", response.data)
        self.assertIn("operations_pipeline", response.data)
        self.assertIn("charts", response.data)
        self.assertIn("quick_actions", response.data)

    def test_admin_global_search_returns_supported_record_types(self):
        customer = self._seed_records()
        response = self.client.get(f"/api/v1/admin/global-search/?q={customer.phone}")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreaterEqual(response.data["count"], 1)
        types = {row["type"] for row in response.data["results"]}
        self.assertIn("customer", types)

    def test_non_admin_blocked_from_erp_apis(self):
        self.client.force_authenticate(self.partner_user)
        response = self.client.get("/api/v1/admin/erp/summary/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        search = self.client.get("/api/v1/admin/global-search/?q=test")
        self.assertEqual(search.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_erp_workspace_views_do_not_error_with_inventory_profiles(self):
        self._seed_records()
        product = create_product(name="ERP Inventory SKU", product_code="ERP-INV-SKU")
        InventoryItem.objects.create(
            product=product,
            sku="ERP-INV-SKU-001",
            opening_stock_qty=Decimal("2.000"),
            reorder_level_qty=Decimal("5.000"),
            stock_tracking_enabled=True,
        )
        workspace_urls = (
            "/api/v1/admin/erp/today-work/",
            "/api/v1/admin/sales/workspace/",
            "/api/v1/admin/finance/workspace/",
            "/api/v1/admin/crm/workspace/",
            "/api/v1/admin/delivery/workspace/",
            "/api/v1/admin/inventory/workspace/",
        )
        for path in workspace_urls:
            response = self.client.get(path)
            self.assertEqual(response.status_code, status.HTTP_200_OK, (path, getattr(response, "data", None)))
