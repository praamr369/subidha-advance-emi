from django.core.exceptions import ValidationError
from django.test import TestCase

from catalog.models import AttributeDefinition, AttributeInputType, CatalogCategory
from catalog.services.category_service import save_category


class CatalogCategoryServiceTests(TestCase):
    def test_parent_path_and_descendant_paths_follow_a_reparent(self):
        furniture = save_category(category=CatalogCategory(), validated_data={"name": "Furniture"})
        bedroom = save_category(category=CatalogCategory(), validated_data={"name": "Bedroom", "parent": furniture})
        bed = save_category(category=CatalogCategory(), validated_data={"name": "Bed", "parent": bedroom})
        self.assertEqual(bed.path, "furniture/bedroom/bed")

        home = save_category(category=CatalogCategory(), validated_data={"name": "Home"})
        bedroom = save_category(category=bedroom, validated_data={"parent": home})
        bed.refresh_from_db()
        self.assertEqual(bedroom.path, "home/bedroom")
        self.assertEqual(bed.path, "home/bedroom/bed")

    def test_category_cannot_become_its_own_descendant(self):
        parent = save_category(category=CatalogCategory(), validated_data={"name": "Furniture"})
        child = save_category(category=CatalogCategory(), validated_data={"name": "Bed", "parent": parent})
        with self.assertRaises(ValidationError):
            save_category(category=parent, validated_data={"parent": child})


class AttributeDefinitionTests(TestCase):
    def setUp(self):
        self.category = save_category(category=CatalogCategory(), validated_data={"name": "Air Conditioners"})

    def test_select_attributes_require_options_and_accept_sku_codes(self):
        attribute = AttributeDefinition(
            category=self.category,
            name="Capacity",
            code="capacity_ltr",
            input_type=AttributeInputType.SELECT,
            options=["1 Ton", "1.5 Ton"],
            sku_code_map={"1 Ton": "10", "1.5 Ton": "15"},
            is_variant_attribute=True,
            is_spec_attribute=False,
        )
        attribute.save()
        self.assertEqual(attribute.code, "capacity_ltr")

        invalid = AttributeDefinition(
            category=self.category,
            name="Star rating",
            code="star",
            input_type=AttributeInputType.SELECT,
            options=[],
        )
        with self.assertRaises(ValidationError):
            invalid.full_clean()

    def test_number_range_is_validated(self):
        invalid = AttributeDefinition(
            category=self.category,
            name="Capacity",
            code="capacity",
            input_type=AttributeInputType.NUMBER,
            min_value="2",
            max_value="1",
        )
        with self.assertRaises(ValidationError):
            invalid.full_clean()
