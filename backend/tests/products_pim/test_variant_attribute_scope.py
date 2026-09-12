from __future__ import annotations

from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from products_pim.models import (
    AttributeDataType,
    AttributeOption,
    CategoryAttribute,
    PimProduct,
    ProductCategory,
    ProductSubcategory,
)
from products_pim.services.flexible_variant_service import FlexibleVariantService, applicable_attributes
from tests.helpers import create_admin_user


class VariantAttributeScopeTests(APITestCase):
    """Auto-Generate must see the same attributes as the product form: the
    product's own subcategory attributes plus the category-level ones."""

    def setUp(self):
        super().setUp()
        self.category = ProductCategory.objects.create(name="Scope Beds")
        self.subcategory = ProductSubcategory.objects.create(category=self.category, name="Scope Steel Bed")
        other_subcategory = ProductSubcategory.objects.create(category=self.category, name="Scope Wooden Bed")
        self.size = self._attr("Size", subcategory=None, values=["5x6", "6x6"])  # category level
        self.finish = self._attr("Finish", subcategory=self.subcategory, values=["Matte", "Gloss"])
        self._attr("Wood", subcategory=other_subcategory, values=["Teak"])
        self._attr("Retired", subcategory=None, values=["X"], is_active=False)
        self.product = PimProduct.objects.create(
            code="SCOPE-BED",
            name="Scope Bed",
            category=self.category,
            subcategory=self.subcategory,
            base_price=Decimal("10000.00"),
        )

    def _attr(self, name, *, subcategory, values, is_active=True):
        attr = CategoryAttribute.objects.create(
            category=self.category,
            subcategory=subcategory,
            name=name,
            data_type=AttributeDataType.CHOICE,
            is_variant_defining=True,
            is_active=is_active,
        )
        for order, value in enumerate(values):
            AttributeOption.objects.create(attribute=attr, value=value, display_order=order)
        return attr

    def test_category_level_attributes_apply_to_subcategory_products(self):
        ids = set(applicable_attributes(self.product).values_list("id", flat=True))
        self.assertEqual(ids, {self.size.id, self.finish.id})

    def test_preview_combines_category_level_values(self):
        result = FlexibleVariantService.preview_variants(self.product, attribute_ids=[self.size.id, self.finish.id])
        self.assertEqual(result.total_count, 4)

    def test_default_selection_includes_category_level_variant_attributes(self):
        # No saved choice: the variant-defining defaults now include category level.
        result = FlexibleVariantService.preview_variants(self.product)
        self.assertEqual(result.total_count, 4)

    def test_workbench_lists_category_level_attributes(self):
        self.client.force_authenticate(user=create_admin_user(username="scope_admin", phone="9011000951"))
        response = self.client.get(f"/api/v1/pim/workbench/{self.product.code}/attributes/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        rows = {row["name"]: row for row in response.data["attributes"]}
        self.assertEqual(set(rows), {"Size", "Finish"})
        self.assertTrue(rows["Size"]["is_selected_for_variants"])
