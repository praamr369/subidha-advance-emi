from __future__ import annotations

from rest_framework import status
from rest_framework.test import APITestCase

from products_pim.models import CategoryAttribute, ProductCategory, ProductSubcategory
from tests.helpers import create_admin_user


class PimSlugUniquenessTests(APITestCase):
    """A name that maps to a slug already taken in the same scope is a 400,
    not the unique-constraint IntegrityError (500) the models' save() hit."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=create_admin_user(username="slug_admin", phone="9011000961"))
        self.category = ProductCategory.objects.create(name="Slug Sofas")
        self.subcategory = ProductSubcategory.objects.create(category=self.category, name="Slug Recliner")

    def test_category_name_with_taken_slug_is_400(self):
        response = self.client.post("/api/v1/pim/categories/", {"name": "Slug-Sofas"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("name", response.data)

    def test_new_category_gets_derived_slug(self):
        response = self.client.post("/api/v1/pim/categories/", {"name": "Slug Wardrobes"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["slug"], "slug-wardrobes")

    def test_renaming_category_keeps_slug(self):
        response = self.client.patch(
            f"/api/v1/pim/categories/{self.category.id}/", {"name": "Slug Sofas Renamed"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.category.refresh_from_db()
        self.assertEqual(self.category.slug, "slug-sofas")

    def test_duplicate_subcategory_in_same_category_is_400(self):
        response = self.client.post(
            "/api/v1/pim/subcategories/", {"category": self.category.id, "name": "Slug Recliner"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("name", response.data)

    def test_same_subcategory_name_in_other_category_is_allowed(self):
        other = ProductCategory.objects.create(name="Slug Beds")
        response = self.client.post(
            "/api/v1/pim/subcategories/", {"category": other.id, "name": "Slug Recliner"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["slug"], "slug-recliner")

    def test_moving_subcategory_onto_taken_slug_is_400(self):
        other = ProductCategory.objects.create(name="Slug Chairs")
        ProductSubcategory.objects.create(category=other, name="Slug Recliner")
        response = self.client.patch(
            f"/api/v1/pim/subcategories/{self.subcategory.id}/", {"category": other.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    def test_duplicate_subcategory_attribute_is_400(self):
        CategoryAttribute.objects.create(category=self.category, subcategory=self.subcategory, name="Colour")
        response = self.client.post(
            "/api/v1/pim/attributes/",
            {"category": self.category.id, "subcategory": self.subcategory.id, "name": "Colour", "data_type": "TEXT"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    def test_duplicate_category_level_attribute_is_400(self):
        # NULL subcategory: the DB constraint never caught these, so duplicates slipped in.
        CategoryAttribute.objects.create(category=self.category, name="Colour")
        response = self.client.post(
            "/api/v1/pim/attributes/",
            {"category": self.category.id, "name": "Colour", "data_type": "TEXT"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)

    def test_same_attribute_name_at_category_and_subcategory_level_is_allowed(self):
        CategoryAttribute.objects.create(category=self.category, name="Colour")
        response = self.client.post(
            "/api/v1/pim/attributes/",
            {"category": self.category.id, "subcategory": self.subcategory.id, "name": "Colour", "data_type": "TEXT"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["slug"], "colour")

    def test_subcategory_product_type_filter_and_pim_core_category_mapping(self):
        """Subcategory list filters by product_type, mismatched subcategory-category is rejected, and operational accessory syncs cleanly to PIM."""
        from products.services.catalog_master_service import build_product_catalog_options
        from products_core.models import Product
        from products_pim.models import PimProduct
        from products_pim.services.core import ensure_pim_product_for_product

        acc_cat = ProductCategory.objects.create(name="Accessories & Hardware", product_type="ACCESSORY")
        acc_sub = ProductSubcategory.objects.create(category=acc_cat, name="Plywood & Boards")
        raw_cat = ProductCategory.objects.create(name="Raw Materials & Lumber", product_type="RAW_MATERIAL")
        ProductSubcategory.objects.create(category=raw_cat, name="Timber & Wood Planks")

        # Subcategory filter by product_type=ACCESSORY returns only accessory subcategories
        res = self.client.get("/api/v1/pim/subcategories/?product_type=ACCESSORY")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        sub_names = [row["name"] for row in (res.data.get("results") if isinstance(res.data, dict) else res.data)]
        self.assertIn("Plywood & Boards", sub_names)
        self.assertNotIn("Timber & Wood Planks", sub_names)

        # Creating/updating a PimProduct with mismatched category & subcategory rejects explicitly
        bad = self.client.post(
            "/api/v1/pim/products/",
            {
                "code": "ACC-MISMATCH-1",
                "name": "Mismatched Acc",
                "category": raw_cat.id,
                "subcategory": acc_sub.id,
                "base_price": "500.00",
                "product_type": "ACCESSORY",
            },
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

        # Operational Accessory product syncs category & subcategory accurately into PIM
        op_acc = Product.objects.create(
            product_code="ACC-PLY-SYNC-1",
            name="Commercial Ply Sync",
            base_price="1200.00",
            item_type="ACCESSORY",
            is_emi_enabled=False,
            is_direct_sale_enabled=True,
            category="Accessories & Hardware",
            subcategory="Plywood & Boards",
        )
        pim_acc = ensure_pim_product_for_product(op_acc)
        self.assertIsNotNone(pim_acc)
        self.assertEqual(pim_acc.product_type, "ACCESSORY")
        self.assertEqual(pim_acc.category_id, acc_cat.id)
        self.assertEqual(pim_acc.subcategory_id, acc_sub.id)

        # Catalog options enrich categories and subcategories with product_type from PIM
        opts = build_product_catalog_options()
        acc_cat_opt = next((c for c in opts.categories if c["name"] == "Accessories & Hardware"), None)
        self.assertIsNotNone(acc_cat_opt)
        self.assertEqual(acc_cat_opt["product_type"], "ACCESSORY")
        acc_sub_opt = next((s for s in opts.subcategories if s["name"] == "Plywood & Boards"), None)
        self.assertIsNotNone(acc_sub_opt)
        self.assertEqual(acc_sub_opt["product_type"], "ACCESSORY")
