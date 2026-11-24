from django.test import TestCase
from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework import status
from products_pim.models import ProductCategory, ProductSubcategory, PimProduct
from products_core.models import Product, ProductCategoryMaster
from tests.helpers import create_admin_user


class AccessoryRawCategoriesTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = create_admin_user(username="acc_admin", phone="9011000962")
        self.client.force_authenticate(user=self.admin)

    def test_seed_categories_and_filtering(self):
        call_command("seed_pim_accessory_raw_categories")

        # Verify categories exist
        acc_cat = ProductCategory.objects.filter(slug="accessories-hardware").first()
        self.assertIsNotNone(acc_cat)
        self.assertEqual(acc_cat.product_type, "ACCESSORY")

        raw_cat = ProductCategory.objects.filter(slug="raw-materials-lumber").first()
        self.assertIsNotNone(raw_cat)
        self.assertEqual(raw_cat.product_type, "RAW_MATERIAL")

        # Verify subcategories
        ply_sub = ProductSubcategory.objects.filter(category=acc_cat, name="Plywood & Boards").first()
        self.assertIsNotNone(ply_sub)

        # Test API filtering by product_type
        res = self.client.get("/api/v1/pim/categories/?product_type=ACCESSORY")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data if isinstance(res.data, list) else res.data.get("results", [])
        cat_names = [c["name"] for c in results]
        self.assertIn("Accessories & Hardware", cat_names)
        self.assertNotIn("Furniture", cat_names)

        # Test finished goods filtering
        res_fg = self.client.get("/api/v1/pim/categories/?product_type=FINISHED_GOOD")
        self.assertEqual(res_fg.status_code, status.HTTP_200_OK)
        results_fg = res_fg.data if isinstance(res_fg.data, list) else res_fg.data.get("results", [])
        fg_names = [c["name"] for c in results_fg]
        self.assertIn("Furniture", fg_names)
        self.assertNotIn("Accessories & Hardware", fg_names)

    def test_ensure_pim_product_for_accessory(self):
        call_command("seed_pim_accessory_raw_categories")

        product = Product.objects.create(
            product_code="TEST-ACC-001",
            name="Bed Allen Bolt M8",
            base_price=50,
            item_type="ACCESSORY",
            is_emi_enabled=False,
            is_rent_enabled=False,
            is_lease_enabled=False,
            is_direct_sale_enabled=True,
            category="Accessories & Hardware",
            subcategory="Fasteners, Nuts & Bolts",
        )

        from products_pim.services.core import ensure_pim_product_for_product
        pim = ensure_pim_product_for_product(product)
        self.assertIsNotNone(pim)
        self.assertEqual(pim.product_type, "ACCESSORY")
        self.assertEqual(pim.category.name, "Accessories & Hardware")
        self.assertEqual(pim.subcategory.name, "Fasteners, Nuts & Bolts")
