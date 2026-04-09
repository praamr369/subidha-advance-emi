from decimal import Decimal
from io import BytesIO
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from PIL import Image

from inventory.models import InventoryItem
from subscriptions.models import (
    Product,
    ProductCategoryMaster,
    ProductSubcategoryMaster,
    ProductUnitOfMeasureMaster,
)
from tests.helpers import create_admin_user, create_product


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
