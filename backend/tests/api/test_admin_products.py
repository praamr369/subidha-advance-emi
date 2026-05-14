from decimal import Decimal
from io import BytesIO
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from PIL import Image

from inventory.models import InventoryItem
from inventory.models import StockLedger
from subscriptions.models import (
    Product,
    ProductCategoryMaster,
    ProductSubcategoryMaster,
    ProductUnitOfMeasureMaster,
)
from tests.helpers import (
    create_admin_user,
    create_batch,
    create_customer_profile,
    create_lucky_id,
    create_product,
    create_subscription,
)


def build_png_upload(name: str) -> SimpleUploadedFile:
    buffer = BytesIO()
    image = Image.new("RGB", (2, 2), color=(36, 74, 108))
    image.save(buffer, format="PNG")
    return SimpleUploadedFile(
        name,
        buffer.getvalue(),
        content_type="image/png",
    )


class AdminProductsApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.admin = create_admin_user(
            username="admin_products_ops",
            phone="9304000031",
        )
        self.client.force_authenticate(user=self.admin)

        self.media_dir = TemporaryDirectory()
        self.media_override = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)
        self.addCleanup(self.media_dir.cleanup)

    def test_admin_product_create_uses_identity_named_upload_path(self):
        upload = build_png_upload("showroom-hero.png")

        response = self.client.post(
            "/api/v1/admin/products/",
            {
                "product_code": "SF-SOFA-001",
                "name": "Showroom Sofa",
                "base_price": "25000.00",
                "category": "Sofa",
                "subcategory": "Premium",
                "description": "Identity-named product image",
                "is_active": "true",
                "is_emi_enabled": "true",
                "is_rent_enabled": "false",
                "is_lease_enabled": "false",
                "image": upload,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        product = Product.objects.get(id=response.data["id"])
        self.assertRegex(
            product.image.name,
            r"^products/sf-sofa-001/sf-sofa-001-[0-9a-f]{10}\.png$",
        )
        self.assertTrue(
            response.data["image"].startswith(
                "http://testserver/media/products/sf-sofa-001/"
            ),
            response.data["image"],
        )

    def test_admin_product_detail_returns_absolute_image_url(self):
        product = create_product(
            name="Absolute Media Sofa",
            product_code="ABS-SOFA-001",
        )
        product.image = build_png_upload("absolute-media.png")
        product.save(update_fields=["image"])

        response = self.client.get(f"/api/v1/admin/products/{product.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(
            response.data["image"].startswith(
                "http://testserver/media/products/abs-sofa-001/"
            ),
            response.data["image"],
        )

    def test_admin_product_create_supports_catalog_master_fields(self):
        response = self.client.post(
            "/api/v1/admin/products/",
            {
                "product_code": "CAT-SOF-001",
                "name": "Catalog Sofa",
                "base_price": "18500.00",
                "category": "Sofa",
                "subcategory": "Three Seater",
                "sku": "CAT-SOF-001",
                "unit_of_measure": "PCS",
                "description": "Catalog master synced product",
                "is_active": True,
                "is_emi_enabled": True,
                "is_rent_enabled": False,
                "is_lease_enabled": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        product = Product.objects.get(id=response.data["id"])
        self.assertEqual(product.sku, "CAT-SOF-001")
        self.assertEqual(product.unit_of_measure, "PCS")
        self.assertEqual(product.category, "Sofa")
        self.assertEqual(product.subcategory, "Three Seater")
        self.assertIsNotNone(product.category_master_id)
        self.assertIsNotNone(product.subcategory_master_id)
        self.assertEqual(product.category_master.name, "Sofa")
        self.assertEqual(product.subcategory_master.name, "Three Seater")

    def test_product_catalog_options_exposes_seeded_category_subcategory_and_uom(self):
        create_product(
            name="Catalog Option Bed",
            product_code="CAT-OPT-001",
            base_price=Decimal("22000.00"),
        )

        response = self.client.get("/api/v1/admin/products/catalog-options/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn("categories", response.data)
        self.assertIn("subcategories", response.data)
        self.assertIn("unit_of_measure_masters", response.data)
        self.assertIn("unit_of_measure_options", response.data)
        self.assertTrue(any(option["name"] == "Electronics" for option in response.data["categories"]))
        self.assertTrue(any(option["name"] == "OTG" for option in response.data["subcategories"]))
        self.assertIn("PCS", response.data["unit_of_measure_options"])
        self.assertTrue(
            any(option["code"] == "PCS" for option in response.data["unit_of_measure_masters"])
        )

    def test_product_import_csv_supports_sku_and_unit_of_measure(self):
        uploaded = SimpleUploadedFile(
            "products.csv",
            (
                "name,base_price,product_code,category,sub_category,sku,unit_of_measure,description\n"
                "Import Sofa,17500.00,IMP-SOF-001,Sofa,Premium,IMP-SOF-001,PCS,Imported product\n"
            ).encode("utf-8"),
            content_type="text/csv",
        )

        response = self.client.post(
            "/api/v1/admin/products/import-csv/",
            {"file": uploaded},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["created"], 1)
        product = Product.objects.get(product_code="IMP-SOF-001")
        self.assertEqual(product.sku, "IMP-SOF-001")
        self.assertEqual(product.unit_of_measure, "PCS")
        self.assertEqual(product.category, "Sofa")
        self.assertEqual(product.subcategory, "Premium")
        self.assertIsNotNone(product.category_master_id)
        self.assertIsNotNone(product.subcategory_master_id)

    def test_product_import_preview_reports_create_and_update_candidates(self):
        create_product(
            name="Preview Existing Sofa",
            product_code="PRV-SOF-001",
            base_price=Decimal("18000.00"),
        )
        uploaded = SimpleUploadedFile(
            "products-preview.csv",
            (
                "name,base_price,product_code,category,sub_category,sku,unit_of_measure,description\n"
                "Preview Existing Sofa,19000.00,PRV-SOF-001,Sofa,Premium,PRV-SOF-001,PCS,Updated product\n"
                "Preview New Bed,22000.00,,Bed,King,PRV-BED-001,PCS,New product\n"
            ).encode("utf-8"),
            content_type="text/csv",
        )

        response = self.client.post(
            "/api/v1/admin/products/import-preview/",
            {"file": uploaded},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["valid_count"], 2)
        self.assertEqual(response.data["invalid_count"], 0)
        self.assertEqual(response.data["update_candidates"], 1)
        self.assertEqual(response.data["create_candidates"], 1)

    def test_product_partial_save_syncs_catalog_master_fields(self):
        product = create_product(
            name="Partial Sync Product",
            product_code="PARTIAL-SYNC-001",
            base_price=Decimal("21000.00"),
        )

        product.category = "Dining"
        product.subcategory = "Six Seater"
        product.unit_of_measure = "SET"
        product.save(update_fields=["category", "subcategory", "unit_of_measure"])

        product.refresh_from_db()

        self.assertEqual(product.category, "Dining")
        self.assertEqual(product.subcategory, "Six Seater")
        self.assertEqual(product.unit_of_measure, "SET")
        self.assertIsNotNone(product.category_master_id)
        self.assertIsNotNone(product.subcategory_master_id)
        self.assertIsNotNone(product.unit_of_measure_master_id)
        self.assertEqual(product.category_master.name, "Dining")
        self.assertEqual(product.subcategory_master.name, "Six Seater")
        self.assertEqual(product.unit_of_measure_master.code, "SET")

    def test_catalog_master_admin_endpoints_create_records(self):
        category_response = self.client.post(
            "/api/v1/admin/product-categories/",
            {
                "name": "Wardrobe",
                "description": "Storage furniture",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(
            category_response.status_code,
            status.HTTP_201_CREATED,
            category_response.data,
        )

        subcategory_response = self.client.post(
            "/api/v1/admin/product-subcategories/",
            {
                "category": category_response.data["id"],
                "name": "Sliding Door",
                "description": "Two panel sliding wardrobe",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(
            subcategory_response.status_code,
            status.HTTP_201_CREATED,
            subcategory_response.data,
        )

        unit_response = self.client.post(
            "/api/v1/admin/product-units/",
            {
                "code": "SET",
                "name": "Set",
                "description": "Sold as set",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(
            unit_response.status_code,
            status.HTTP_201_CREATED,
            unit_response.data,
        )

        self.assertTrue(ProductCategoryMaster.objects.filter(name="Wardrobe").exists())
        self.assertTrue(
            ProductSubcategoryMaster.objects.filter(name="Sliding Door").exists()
        )
        self.assertTrue(ProductUnitOfMeasureMaster.objects.filter(code="SET").exists())

    def test_prepare_inventory_profile_action_creates_profile_from_product_master(self):
        product = create_product(
            name="Inventory Ready Product",
            product_code="INV-PREP-001",
            base_price=Decimal("24000.00"),
        )
        product.sku = "INV-PREP-001"
        product.unit_of_measure = "PCS"
        product.save(update_fields=["sku", "unit_of_measure"])

        response = self.client.post(
            f"/api/v1/admin/products/{product.id}/prepare-inventory-profile/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["created"])

        inventory_profile = InventoryItem.objects.get(product=product)
        self.assertEqual(inventory_profile.sku, "INV-PREP-001")
        self.assertEqual(inventory_profile.unit_of_measure, "PCS")

        product.refresh_from_db()
        self.assertEqual(product.inventory_profile.id, inventory_profile.id)

    def test_prepare_inventory_profile_action_is_idempotent_and_keeps_base_price(self):
        product = create_product(
            name="Inventory Idempotent Product",
            product_code="INV-IDEMP-001",
            base_price=Decimal("31000.00"),
        )
        first = self.client.post(
            f"/api/v1/admin/products/{product.id}/prepare-inventory-profile/",
            {},
            format="json",
        )
        second = self.client.post(
            f"/api/v1/admin/products/{product.id}/prepare-inventory-profile/",
            {},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertTrue(first.data["created"])
        self.assertFalse(second.data["created"])
        self.assertEqual(InventoryItem.objects.filter(product=product).count(), 1)
        product.refresh_from_db()
        self.assertEqual(product.base_price, Decimal("31000.00"))

    def test_prepare_inventory_profile_does_not_create_stock_rows(self):
        product = create_product(
            name="Inventory No Stock Mutation",
            product_code="INV-NOSTOCK-001",
            base_price=Decimal("29000.00"),
        )
        response = self.client.post(
            f"/api/v1/admin/products/{product.id}/prepare-inventory-profile/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        item = InventoryItem.objects.get(product=product)
        self.assertEqual(item.current_stock_quantity(), Decimal("0.000"))
        self.assertFalse(StockLedger.objects.filter(inventory_item=item).exists())

    def test_product_capability_patch_persists_flags(self):
        product = create_product(
            name="Capability Patch Product",
            product_code="CAP-PATCH-001",
            base_price=Decimal("18000.00"),
        )

        response = self.client.patch(
            f"/api/v1/admin/products/{product.id}/",
            {
                "is_active": True,
                "is_emi_enabled": False,
                "is_rent_enabled": True,
                "is_lease_enabled": True,
                "is_direct_sale_enabled": False,
                "plan_type_default": "RENT",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        product.refresh_from_db()
        self.assertTrue(product.is_active)
        self.assertFalse(product.is_emi_enabled)
        self.assertTrue(product.is_rent_enabled)
        self.assertTrue(product.is_lease_enabled)
        self.assertFalse(product.is_direct_sale_enabled)
        self.assertEqual(product.plan_type_default, "RENT")
        self.assertEqual(response.data["plan_type_default"], "RENT")

    def test_product_capability_change_does_not_mutate_subscription_snapshot(self):
        product = create_product(
            name="Capability Snapshot Product",
            product_code="CAP-SNAP-001",
            base_price=Decimal("15000.00"),
        )
        customer = create_customer_profile(
            name="Capability Snapshot Customer",
            phone="9304000999",
        )
        batch = create_batch(batch_code="CAP-SNAP-BATCH")
        lucky_id = create_lucky_id(batch=batch, lucky_number=91)
        subscription = create_subscription(
            customer=customer,
            product=product,
            batch=batch,
            lucky_id=lucky_id,
            partner=self.admin,
            total_amount=Decimal("15000.00"),
            monthly_amount=Decimal("1000.00"),
            tenure_months=15,
        )

        response = self.client.patch(
            f"/api/v1/admin/products/{product.id}/",
            {
                "is_emi_enabled": False,
                "is_rent_enabled": True,
                "is_lease_enabled": False,
                "is_direct_sale_enabled": True,
                "plan_type_default": "RENT",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        subscription.refresh_from_db()
        self.assertEqual(subscription.total_amount, Decimal("15000.00"))
        self.assertEqual(subscription.monthly_amount, Decimal("1000.00"))

    def test_inventory_item_patch_toggles_stock_flags_without_base_price_change(self):
        product = create_product(
            name="Inventory Toggle Product",
            product_code="INV-TOGGLE-001",
            base_price=Decimal("22000.00"),
        )
        item = InventoryItem.objects.create(
            product=product,
            sku="INV-TOGGLE-001",
            opening_stock_qty=Decimal("3.000"),
            reorder_level_qty=Decimal("1.000"),
            standard_unit_cost=Decimal("12000.00"),
        )

        response = self.client.patch(
            f"/api/v1/inventory/items/{item.id}/",
            {
                "stock_tracking_enabled": False,
                "delivery_stock_bridge_enabled": False,
                "reorder_level_qty": "2.000",
                "standard_unit_cost": "12500.00",
                "is_active": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        item.refresh_from_db()
        product.refresh_from_db()
        self.assertFalse(item.stock_tracking_enabled)
        self.assertFalse(item.delivery_stock_bridge_enabled)
        self.assertEqual(item.reorder_level_qty, Decimal("2.000"))
        self.assertEqual(item.standard_unit_cost, Decimal("12500.00"))
        self.assertFalse(item.is_active)
        self.assertEqual(product.base_price, Decimal("22000.00"))
