from django.test import SimpleTestCase

from subscriptions.models import Product, product_image_upload_to


class ProductMediaNamingTests(SimpleTestCase):
    def test_upload_path_uses_normalized_product_code_when_available(self):
        product = Product(product_code="SF-CHAIR-001")

        path = product_image_upload_to(product, "Chair Photo.PNG")

        self.assertRegex(
            path,
            r"^products/sf-chair-001/sf-chair-001-[0-9a-f]{10}\.png$",
        )

    def test_upload_path_falls_back_to_product_id_when_code_missing(self):
        product = Product()
        product.pk = 42

        path = product_image_upload_to(product, "Chair Photo.WEBP")

        self.assertRegex(
            path,
            r"^products/product-42/product-42-[0-9a-f]{10}\.webp$",
        )
