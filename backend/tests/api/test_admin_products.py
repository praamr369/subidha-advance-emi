from io import BytesIO
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from PIL import Image

from subscriptions.models import Product
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
