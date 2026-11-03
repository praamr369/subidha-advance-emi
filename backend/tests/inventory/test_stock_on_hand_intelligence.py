from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryItem, InventoryItemType, StockLedger, StockMovementType
from products_core.models import Product, ProductCategoryMaster, ProductSubcategoryMaster, ProductItemType
from products_pim.models import PimProduct, ProductVariant, CategoryAttribute, VariantAttributeValue
from tests.helpers import create_admin_user


class StockOnHandIntelligenceTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="stock_intel_admin",
            phone="9399000001",
        )
        self.client.force_authenticate(user=self.admin)

        # 1. Categories
        self.cat_bed = ProductCategoryMaster.objects.create(name="Bed")
        self.subcat_king = ProductSubcategoryMaster.objects.create(
            name="King Size Bed",
            category=self.cat_bed,
        )
        self.cat_raw = ProductCategoryMaster.objects.create(name="Plywood & Board")

        # 2. Finished Good (Bed - King Size - Solid Wood)
        self.bed_product = Product.objects.create(
            name="Royal Sheesham Bed",
            product_code="BED-ROYAL-01",
            sku="SF-BED-ROYAL-KING",
            category_master=self.cat_bed,
            category="Bed",
            subcategory_master=self.subcat_king,
            subcategory="King Size Bed",
            item_type=ProductItemType.FINISHED_GOOD,
            base_price=Decimal("45000.00"),
            base_specs={"size": "King", "material": "Solid Wood", "storage": "Hydraulic"},
        )
        self.bed_item = InventoryItem.objects.create(
            product=self.bed_product,
            sku="SF-BED-ROYAL-KING",
            stock_item_type=InventoryItemType.FINISHED_GOOD,
            opening_stock_qty=Decimal("10.000"),
            reorder_level_qty=Decimal("3.000"),
            standard_unit_cost=Decimal("28000.00"),
        )

        # 3. Finished Good (Almirah - Steel)
        self.cat_almirah = ProductCategoryMaster.objects.create(name="Almirah")
        self.almirah_product = Product.objects.create(
            name="Classic Steel Almirah",
            product_code="ALM-STL-01",
            sku="SF-ALM-STL-01",
            category_master=self.cat_almirah,
            category="Almirah",
            item_type=ProductItemType.FINISHED_GOOD,
            base_price=Decimal("20000.00"),
            base_specs={"size": "3-Door", "material": "Steel"},
        )
        self.almirah_item = InventoryItem.objects.create(
            product=self.almirah_product,
            sku="SF-ALM-STL-01",
            stock_item_type=InventoryItemType.FINISHED_GOOD,
            opening_stock_qty=Decimal("5.000"),
            reorder_level_qty=Decimal("2.000"),
            standard_unit_cost=Decimal("12000.00"),
        )

        # 4. Raw Material (Plywood Sheet)
        self.ply_product = Product.objects.create(
            name="Commercial Plywood 18mm",
            product_code="PLY-18MM-01",
            sku="RM-PLY-18MM",
            category_master=self.cat_raw,
            category="Plywood & Board",
            item_type=ProductItemType.RAW_MATERIAL,
            base_price=Decimal("2500.00"),
            base_specs={"thickness": "18mm", "grade": "Commercial MR"},
        )
        self.ply_item = InventoryItem.objects.create(
            product=self.ply_product,
            sku="RM-PLY-18MM",
            stock_item_type=InventoryItemType.RAW_MATERIAL,
            opening_stock_qty=Decimal("100.000"),
            reorder_level_qty=Decimal("20.000"),
            standard_unit_cost=Decimal("1800.00"),
        )

        # 5. Add a stock ledger movement to bed item
        StockLedger.objects.create(
            inventory_item=self.bed_item,
            movement_type=StockMovementType.SALE_OUT,
            quantity_in=Decimal("0.000"),
            quantity_out=Decimal("2.000"),
            movement_date=timezone.localdate(),
            reference_model="DirectSale",
            reference_id="SALE-TEST-001",
            notes="Direct retail sale of 2 beds",
        )

    def test_stock_on_hand_list_and_calculations(self):
        res = self.client.get("/api/v1/admin/inventory/stock-on-hand/?filter=all")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 3)

        # Verify bed quantities (10 opening - 2 sale out = 8 physical)
        bed_row = next((r for r in res.data["results"] if r["inventory_item_id"] == self.bed_item.id), None)
        self.assertIsNotNone(bed_row)
        self.assertEqual(Decimal(bed_row["physical_qty"]), Decimal("8.000"))
        self.assertEqual(Decimal(bed_row["available_qty"]), Decimal("8.000"))
        self.assertEqual(bed_row["category"], "Bed")
        self.assertEqual(bed_row["subcategory"], "King Size Bed")
        self.assertEqual(bed_row["attributes_map"].get("Size"), "King")
        self.assertEqual(bed_row["attributes_map"].get("Material"), "Solid Wood")
        self.assertEqual(bed_row["standard_cost"], "28000.00")
        self.assertEqual(bed_row["selling_price"], "45000.00")
        self.assertEqual(bed_row["valuation_total"], "224000.00")

    def test_filter_by_item_type(self):
        # Finished goods only
        res_fg = self.client.get("/api/v1/admin/inventory/stock-on-hand/?item_type=FINISHED_GOOD")
        self.assertEqual(res_fg.status_code, status.HTTP_200_OK)
        self.assertEqual(res_fg.data["count"], 2)
        skus = [r["sku"] for r in res_fg.data["results"]]
        self.assertIn("SF-BED-ROYAL-KING", skus)
        self.assertIn("SF-ALM-STL-01", skus)
        self.assertNotIn("RM-PLY-18MM", skus)

        # Raw materials only
        res_rm = self.client.get("/api/v1/admin/inventory/stock-on-hand/?item_type=RAW_MATERIAL")
        self.assertEqual(res_rm.status_code, status.HTTP_200_OK)
        self.assertEqual(res_rm.data["count"], 1)
        self.assertEqual(res_rm.data["results"][0]["sku"], "RM-PLY-18MM")

    def test_filter_by_category_and_subcategory(self):
        res_bed = self.client.get("/api/v1/admin/inventory/stock-on-hand/?category=Bed")
        self.assertEqual(res_bed.status_code, status.HTTP_200_OK)
        self.assertEqual(res_bed.data["count"], 1)
        self.assertEqual(res_bed.data["results"][0]["sku"], "SF-BED-ROYAL-KING")

        res_subcat = self.client.get("/api/v1/admin/inventory/stock-on-hand/?subcategory=King Size Bed")
        self.assertEqual(res_subcat.status_code, status.HTTP_200_OK)
        self.assertEqual(res_subcat.data["count"], 1)
        self.assertEqual(res_subcat.data["results"][0]["sku"], "SF-BED-ROYAL-KING")

    def test_filter_by_variant_attribute(self):
        # Filter Size=King
        res_king = self.client.get("/api/v1/admin/inventory/stock-on-hand/?attribute_key=Size&attribute_value=King")
        self.assertEqual(res_king.status_code, status.HTTP_200_OK)
        self.assertEqual(res_king.data["count"], 1)
        self.assertEqual(res_king.data["results"][0]["sku"], "SF-BED-ROYAL-KING")

        # Filter Material=Steel
        res_steel = self.client.get("/api/v1/admin/inventory/stock-on-hand/?attribute_key=Material&attribute_value=Steel")
        self.assertEqual(res_steel.status_code, status.HTTP_200_OK)
        self.assertEqual(res_steel.data["count"], 1)
        self.assertEqual(res_steel.data["results"][0]["sku"], "SF-ALM-STL-01")

    def test_stock_facets_endpoint(self):
        res = self.client.get("/api/v1/admin/inventory/stock-on-hand/facets/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("item_types", res.data)
        self.assertIn("categories", res.data)
        self.assertIn("subcategories", res.data)
        self.assertIn("attributes", res.data)

        cat_names = [c["name"] for c in res.data["categories"]]
        self.assertIn("Bed", cat_names)
        self.assertIn("Almirah", cat_names)
        self.assertIn("Plywood & Board", cat_names)

    def test_stock_calculation_details_endpoint(self):
        res = self.client.get(f"/api/v1/admin/inventory/stock-on-hand/{self.bed_item.id}/calculation/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        calc = res.data["calculation"]

        self.assertEqual(Decimal(calc["opening_stock_qty"]), Decimal("10.000"))
        self.assertEqual(Decimal(calc["total_outflows"]), Decimal("2.000"))
        self.assertEqual(Decimal(calc["physical_qty"]), Decimal("8.000"))
        self.assertEqual(Decimal(calc["available_qty"]), Decimal("8.000"))
        self.assertEqual(Decimal(calc["outflows_breakdown"]["direct_sales"]), Decimal("2.000"))

        # Verify movement in recent movements list
        self.assertEqual(len(res.data["recent_movements"]), 1)
        m = res.data["recent_movements"][0]
        self.assertEqual(m["movement_type"], "SALE_OUT")
        self.assertEqual(Decimal(m["quantity_out"]), Decimal("2.000"))
        self.assertEqual(m["reference_id"], "SALE-TEST-001")
