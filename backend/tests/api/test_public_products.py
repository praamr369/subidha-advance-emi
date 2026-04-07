from base64 import b64decode
from tempfile import TemporaryDirectory

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from tests.helpers import create_product


PNG_1X1 = b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p2Vd7wAAAAASUVORK5CYII="
)


class PublicProductsApiTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.media_dir = TemporaryDirectory()
        self.media_override = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)
        self.addCleanup(self.media_dir.cleanup)

    def _create_uploaded_product(self, *, active=True, suffix="001"):
        product = create_product(
            name="Public Catalog Sofa",
            product_code=f"PUBLIC-PRODUCT-{suffix}",
        )
        product.is_active = active
        product.image = SimpleUploadedFile(
            "public-catalog-sofa.png",
            PNG_1X1,
            content_type="image/png",
        )
        product.save(update_fields=["is_active", "image"])
        return product

    def test_public_products_list_exposes_absolute_image_url(self):
        product = self._create_uploaded_product(suffix="001")

        response = self.client.get("/api/v1/public/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["count"], 1)
        first_product = response.data["results"][0]
        self.assertEqual(first_product["id"], product.id)
        self.assertTrue(
            first_product["image"].startswith(
                "http://testserver/media/products/public-product-001/"
            ),
            first_product["image"],
        )

    def test_public_product_detail_exposes_absolute_image_url_and_hides_inactive_products(self):
        active_product = self._create_uploaded_product(active=True, suffix="002")
        inactive_product = self._create_uploaded_product(active=False, suffix="003")

        active_response = self.client.get(f"/api/v1/public/products/{active_product.id}/")
        inactive_response = self.client.get(f"/api/v1/public/products/{inactive_product.id}/")

        self.assertEqual(active_response.status_code, status.HTTP_200_OK, active_response.data)
        self.assertTrue(
            active_response.data["image"].startswith(
                "http://testserver/media/products/public-product-002/"
            ),
            active_response.data["image"],
        )
        self.assertEqual(inactive_response.status_code, status.HTTP_404_NOT_FOUND)
