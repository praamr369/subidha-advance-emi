from __future__ import annotations

import json
from decimal import Decimal

from rest_framework.test import APITestCase

from billing.models import DirectSale
from inventory.models import InventoryItem, PurchaseNeed, StockLedger, StockLocation
from subscriptions.models import Payment, Product, Subscription, SubscriptionDelivery
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_cashier_user,
    create_customer_profile,
    create_customer_user,
    create_lucky_id,
    create_partner_user,
    create_product,
    create_subscription,
)


READINESS_URL = "/api/v1/admin/inventory/readiness/"


class AdminInventoryReadinessApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin_user(username="inventory_ready_admin", phone="9106000001")

    def test_admin_can_access_inventory_readiness(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(READINESS_URL)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn(response.data["overall_status"], {"READY", "WARNINGS", "BLOCKED"})
        self.assertIn("sections", response.data)
        self.assertIn("inventory_ready", response.data)

    def test_cashier_customer_partner_cannot_access_inventory_readiness(self):
        users = [
            create_cashier_user(username="inventory_ready_cashier", phone="9106000002"),
            create_customer_user(username="inventory_ready_customer", phone="9106000003"),
            create_partner_user(username="inventory_ready_partner", phone="9106000004"),
        ]

        for user in users:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                response = self.client.get(READINESS_URL)
                self.assertEqual(response.status_code, 403)

    def test_minimal_database_returns_controlled_response(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(READINESS_URL)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["module_not_configured"])
        self.assertIn(response.data["overall_status"], {"READY", "WARNINGS", "BLOCKED"})
        self.assertIsInstance(response.data["summary"]["total_checks"], int)
        self.assertGreater(response.data["summary"]["total_checks"], 0)

    def test_missing_inventory_setup_produces_sections_and_blockers(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(READINESS_URL)

        self.assertEqual(response.status_code, 200, response.data)
        sections = {section["key"]: section for section in response.data["sections"]}
        self.assertIn("product_master", sections)
        self.assertIn("stock_locations", sections)
        self.assertIn("stock_ledger", sections)
        self.assertEqual(sections["stock_locations"]["status"], "BLOCKED")
        self.assertGreater(response.data["summary"]["blockers"], 0)

    def test_response_does_not_include_customer_pii(self):
        customer = create_customer_profile(
            name="PII Readiness Customer",
            phone="9199998888",
            email="pii-readiness@example.com",
        )
        product = create_product(product_code="PII-INV-001", name="PII Readiness Product", base_price=Decimal("12000.00"))
        batch = create_batch(batch_code="PII-INV-BATCH")
        lucky_id = create_lucky_id(batch=batch, lucky_number=71)
        create_subscription(customer=customer, product=product, batch=batch, lucky_id=lucky_id)

        self.client.force_authenticate(self.admin)
        response = self.client.get(READINESS_URL)

        self.assertEqual(response.status_code, 200, response.data)
        serialized = json.dumps(response.data)
        self.assertNotIn("PII Readiness Customer", serialized)
        self.assertNotIn("9199998888", serialized)
        self.assertNotIn("pii-readiness@example.com", serialized)

    def test_readiness_check_does_not_write_domain_rows(self):
        product = create_product(product_code="READONLY-INV-001", name="Read Only Inventory Product")
        InventoryItem.objects.create(product=product, sku="READONLY-INV-001", stock_tracking_enabled=True)

        before = {
            "products": Product.objects.count(),
            "inventory_items": InventoryItem.objects.count(),
            "stock_ledger": StockLedger.objects.count(),
            "stock_locations": StockLocation.objects.count(),
            "purchase_needs": PurchaseNeed.objects.count(),
            "subscriptions": Subscription.objects.count(),
            "subscription_deliveries": SubscriptionDelivery.objects.count(),
            "direct_sales": DirectSale.objects.count(),
            "payments": Payment.objects.count(),
        }

        self.client.force_authenticate(self.admin)
        response = self.client.get(READINESS_URL)
        self.assertEqual(response.status_code, 200, response.data)

        after = {
            "products": Product.objects.count(),
            "inventory_items": InventoryItem.objects.count(),
            "stock_ledger": StockLedger.objects.count(),
            "stock_locations": StockLocation.objects.count(),
            "purchase_needs": PurchaseNeed.objects.count(),
            "subscriptions": Subscription.objects.count(),
            "subscription_deliveries": SubscriptionDelivery.objects.count(),
            "direct_sales": DirectSale.objects.count(),
            "payments": Payment.objects.count(),
        }
        self.assertEqual(after, before)
