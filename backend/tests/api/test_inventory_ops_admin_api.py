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

    def test_inventory_categories_aggregates_all_product_sources(self):
        from subscriptions.models import ProductCategoryMaster, Product
        from products_pim.models import ProductCategory as PimProductCategory

        ProductCategoryMaster.objects.get_or_create(name="Electronics Master")
        PimProductCategory.objects.get_or_create(name="Home Appliances")
        Product.objects.create(name="Ceiling Fan 1200mm", product_code="FAN-1200", category="Ceiling Fans", base_price=1500)

        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/inventory/categories/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cats = response.data.get("categories", [])
        self.assertIn("Electronics Master", cats)
        self.assertIn("Home Appliances", cats)
        self.assertIn("Ceiling Fans", cats)

    def test_inventory_item_search_excludes_draft_and_disabled_pim_products(self):
        from inventory.models import InventoryItem
        from products_pim.models import PimProduct

        # 1. Published active product
        pub_prod = create_product(name="Published Bed", product_code="BED-PUB-01", published=True)
        InventoryItem.objects.create(product=pub_prod, sku="BED-PUB-01")

        # 2. Draft (unpublished) product
        draft_prod = create_product(name="Draft Bed", product_code="BED-DRAFT-01", published=False)
        InventoryItem.objects.create(product=draft_prod, sku="BED-DRAFT-01")

        # 3. Disabled (inactive in PIM) product
        dis_prod = create_product(name="Disabled Bed", product_code="BED-DIS-01", published=True)
        PimProduct.objects.filter(source_product=dis_prod).update(is_active=False)
        InventoryItem.objects.create(product=dis_prod, sku="BED-DIS-01")

        # 4. Inactive core product
        inact_prod = create_product(name="Inactive Core Bed", product_code="BED-INACT-01", published=True)
        inact_prod.is_active = False
        inact_prod.save(update_fields=["is_active"])
        InventoryItem.objects.create(product=inact_prod, sku="BED-INACT-01")

        # 5. Variant under draft parent blueprint
        from products_pim.models import ProductVariant
        cat = PimProduct.objects.filter(source_product=pub_prod).first().category
        base_draft_pim = PimProduct.objects.create(code="BASE-DRAFT", name="Base Draft Bed", is_published=False, is_active=True, category=cat)
        var_prod_1 = create_product(name="Variant 1", product_code="VAR-001", published=True)
        ProductVariant.objects.create(product=base_draft_pim, operational_product=var_prod_1, sku="VAR-001", price=1000)
        InventoryItem.objects.create(product=var_prod_1, sku="VAR-001")

        # 6. Variant with disabled ProductVariant record
        base_pub_pim = PimProduct.objects.create(code="BASE-PUB", name="Base Pub Bed", is_published=True, is_active=True, category=cat)
        var_prod_2 = create_product(name="Variant 2", product_code="VAR-002", published=True)
        ProductVariant.objects.create(product=base_pub_pim, operational_product=var_prod_2, sku="VAR-002", price=1000, is_active=False)
        InventoryItem.objects.create(product=var_prod_2, sku="VAR-002")

        # 7. Child PIM variant set to draft
        var_prod_3 = create_product(name="Variant 3", product_code="VAR-003", published=True)
        ProductVariant.objects.create(product=base_pub_pim, operational_product=var_prod_3, sku="VAR-003", price=1000, is_active=True)
        PimProduct.objects.filter(code="VAR-003").update(parent=base_pub_pim, is_published=False)
        InventoryItem.objects.create(product=var_prod_3, sku="VAR-003")

        self.client.force_authenticate(user=self.admin)

        # Default search: draft and disabled items must NOT be shown
        response = self.client.get("/api/v1/admin/inventory/items/search/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        skus = {r["sku"] for r in response.data["results"]}

        self.assertIn("BED-PUB-01", skus)
        self.assertNotIn("BED-DRAFT-01", skus)
        self.assertNotIn("BED-DIS-01", skus)
        self.assertNotIn("BED-INACT-01", skus)
        self.assertNotIn("VAR-001", skus)
        self.assertNotIn("VAR-002", skus)
        self.assertNotIn("VAR-003", skus)

        # When include_draft=1, draft item is included
        draft_response = self.client.get("/api/v1/admin/inventory/items/search/?include_draft=1")
        self.assertEqual(draft_response.status_code, status.HTTP_200_OK, draft_response.data)
        all_skus = {r["sku"] for r in draft_response.data["results"]}
        self.assertIn("BED-PUB-01", all_skus)
        self.assertIn("BED-DRAFT-01", all_skus)


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
