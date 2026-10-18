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

    def test_variant_update_attributes_endpoint(self):
        admin = create_admin_user(username="scope_admin_patch", phone="9011000952")
        self.client.force_authenticate(user=admin)
        from products_pim.models import ProductVariant, VariantAttributeValue
        variant = ProductVariant.objects.create(
            product=self.product,
            sku="SCOPE-BED-5X6-M",
            price=Decimal("12000.00"),
        )
        url = f"/api/v1/pim/variants/{variant.id}/update_attributes/"
        payload = {
            "attribute_values": [
                {
                    "attribute": self.size.id,
                    "value_text": "5x6",
                }
            ]
        }
        response = self.client.patch(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        vav = VariantAttributeValue.objects.filter(variant=variant, attribute=self.size).first()
        self.assertIsNotNone(vav)
        self.assertEqual(vav.value_text, "5x6")

    def test_variant_update_attributes_with_long_variant_name(self):
        admin = create_admin_user(username="scope_admin_patch_long", phone="9011000953")
        self.client.force_authenticate(user=admin)
        from products_pim.models import ProductVariant
        variant = ProductVariant.objects.create(
            product=self.product,
            sku="SCOPE-BED-LONG-NAME",
            price=Decimal("12000.00"),
        )
        url = f"/api/v1/pim/variants/{variant.id}/update_attributes/"
        long_name = "Bed Product Title " + ("Long Attribute Value " * 20)  # > 400 characters
        payload = {
            "variant_name": long_name,
        }
        response = self.client.patch(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        variant.refresh_from_db()
        self.assertIsNotNone(variant.variant_name)
        self.assertLessEqual(len(variant.variant_name), 255)


