from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryItem, StockLedger
from subscriptions.models import Product
from tests.helpers import create_admin_user, create_customer_profile, create_product


class AdminProductRegisterApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(username="product_register_admin", phone="9304000888")
        self.client.force_authenticate(user=self.admin)

    def test_product_register_returns_total_count_and_paginated_results(self):
        for index in range(57):
            create_product(
                name=f"Enterprise Register Product {index:03d}",
                product_code=f"ERP-REG-{index:03d}",
                base_price=Decimal("1000.00") + Decimal(index),
            )

        response = self.client.get("/api/v1/admin/products/register/?page=1&page_size=50")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertGreaterEqual(response.data["count"], 57)
        self.assertEqual(response.data["page"], 1)
        self.assertEqual(response.data["page_size"], 50)
        self.assertEqual(len(response.data["results"]), 50)
        self.assertEqual(response.data["range_start"], 1)
        self.assertEqual(response.data["range_end"], 50)
        self.assertTrue(response.data["has_next"])
        self.assertIn("summary", response.data)
        self.assertIn("total_base_value", response.data["summary"])

    def test_product_register_page_size_and_second_page_work(self):
        for index in range(65):
            create_product(
                name=f"Paged Product {index:03d}",
                product_code=f"PAGED-{index:03d}",
            )

        response = self.client.get("/api/v1/admin/products/register/?page=2&page_size=50")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["page"], 2)
        self.assertEqual(response.data["page_size"], 50)
        self.assertGreaterEqual(response.data["range_start"], 51)
        self.assertTrue(response.data["has_previous"])
        self.assertGreater(len(response.data["results"]), 0)

    def test_product_register_search_works_across_full_dataset(self):
        for index in range(30):
            create_product(name=f"Common Product {index:03d}", product_code=f"COMMON-{index:03d}")
        target = create_product(name="Cross Page Search Wardrobe", product_code="SEARCH-WARDROBE-999")
        target.sku = "GLOBAL-SKU-999"
        target.save(update_fields=["sku"])

        response = self.client.get("/api/v1/admin/products/register/?q=GLOBAL-SKU-999&page=1&page_size=20")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], target.id)

    def test_product_register_filters_inventory_image_active_and_capability(self):
        ready = create_product(name="Ready Product", product_code="READY-PRODUCT-001")
        InventoryItem.objects.create(product=ready, sku="READY-PRODUCT-001", unit_of_measure="PCS")
        ready.is_rent_enabled = True
        ready.save(update_fields=["is_rent_enabled"])
        inactive = create_product(name="Inactive Product", product_code="INACTIVE-PRODUCT-001")
        inactive.is_active = False
        inactive.save(update_fields=["is_active"])

        inventory_response = self.client.get("/api/v1/admin/products/register/?inventory=READY")
        self.assertEqual(inventory_response.status_code, status.HTTP_200_OK, inventory_response.data)
        self.assertTrue(any(row["id"] == ready.id for row in inventory_response.data["results"]))

        capability_response = self.client.get("/api/v1/admin/products/register/?capability=RENT")
        self.assertEqual(capability_response.status_code, status.HTTP_200_OK, capability_response.data)
        self.assertTrue(any(row["id"] == ready.id for row in capability_response.data["results"]))

        active_response = self.client.get("/api/v1/admin/products/register/?active=false")
        self.assertEqual(active_response.status_code, status.HTTP_200_OK, active_response.data)
        self.assertTrue(any(row["id"] == inactive.id for row in active_response.data["results"]))

    def test_customer_cannot_access_admin_product_register(self):
        customer = create_customer_profile(name="Product Register Customer", phone="9304000777")
        self.client.force_authenticate(user=customer.user)

        response = self.client.get("/api/v1/admin/products/register/")

        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_prepare_inventory_profile_remains_idempotent_no_stock_ledger(self):
        product = create_product(name="Register Inventory Prepare", product_code="REG-INV-PREP-001")
        first = self.client.post(f"/api/v1/admin/products/{product.id}/prepare-inventory-profile/", {}, format="json")
        second = self.client.post(f"/api/v1/admin/products/{product.id}/prepare-inventory-profile/", {}, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(InventoryItem.objects.filter(product=product).count(), 1)
        item = InventoryItem.objects.get(product=product)
        self.assertFalse(StockLedger.objects.filter(inventory_item=item).exists())
