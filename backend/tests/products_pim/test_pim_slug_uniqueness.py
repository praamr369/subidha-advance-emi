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
