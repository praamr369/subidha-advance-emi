from rest_framework import status
from rest_framework.test import APITestCase

from subscriptions.models import ProductCategoryMaster
from tests.helpers import create_product


class PublicProductCategoriesApiTests(APITestCase):
    """SEO-3: read-only public category endpoint + product category_slug.

    Confirms only public+active categories are returned, only public-safe
    fields are exposed, no auth is required, and private/internal data never
    appears.
    """

    def _category(self, name, *, is_public=True, is_active=True, sort_order=0):
        return ProductCategoryMaster.objects.create(
            name=name, is_public=is_public, is_active=is_active, sort_order=sort_order
        )

    def test_public_categories_returns_only_public_active(self):
        public_cat = self._category("Beds Public", sort_order=1)
        self._category("Hidden Private", is_public=False)
        self._category("Archived", is_active=False)

        response = self.client.get("/api/v1/public/product-categories/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        names = {row["name"] for row in response.data["results"]}
        self.assertIn("Beds Public", names)
        self.assertNotIn("Hidden Private", names)
        self.assertNotIn("Archived", names)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["id"], public_cat.id)

    def test_public_categories_expose_only_safe_fields(self):
        self._category("Sofas Public")

        response = self.client.get("/api/v1/public/product-categories/")
        row = response.data["results"][0]

        self.assertEqual(
            set(row.keys()),
            {"id", "name", "slug", "public_title", "seo_title", "seo_description", "public_image", "sort_order"},
        )
        # No private / internal / financial fields leaked.
        for forbidden in ("description", "is_active", "is_public", "cost", "stock", "created_at"):
            self.assertNotIn(forbidden, row)

    def test_category_slug_is_autofilled_and_public(self):
        cat = self._category("Dining Tables Public")
        cat.refresh_from_db()
        self.assertEqual(cat.slug, "dining-tables-public")

        response = self.client.get("/api/v1/public/product-categories/")
        slugs = {row["slug"] for row in response.data["results"]}
        self.assertIn("dining-tables-public", slugs)

    def test_public_categories_requires_no_auth(self):
        self._category("Wardrobes Public")
        # No credentials set on the client.
        response = self.client.get("/api/v1/public/product-categories/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_product_serializer_exposes_category_slug(self):
        category = self._category("Furniture Master")
        product = create_product(name="Slug Sofa", product_code="SLUG-PROD-001")
        product.category_master = category
        product.is_active = True
        product.save()
        product.refresh_from_db()
        expected_slug = product.category_master.slug if product.category_master else ""

        response = self.client.get("/api/v1/public/products/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        match = next((row for row in response.data["results"] if row["id"] == product.id), None)
        self.assertIsNotNone(match)
        self.assertIn("category_slug", match)
        # Serializer reflects the product's actual category-master slug.
        self.assertEqual(match["category_slug"], expected_slug)
        # Private fields never present on public product payload.
        for forbidden in ("cost_price", "purchase_price", "supplier", "margin", "stock_qty", "valuation"):
            self.assertNotIn(forbidden, match)
